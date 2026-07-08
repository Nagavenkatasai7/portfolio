// ============================================================
// scripts/phase-f-verify.mjs — end-to-end verification for Phase F
// (READ-ONLY LinkedIn ingestion), proven against a MOCK — never FGB.
//
//   node --conditions=react-server scripts/phase-f-verify.mjs
//   (npm run verify:phase-f)
//
// --conditions=react-server lets this plain-Node process import the REAL
// server-only modules the app uses (lib/linkedin_sync.js, lib/gate.js) and the
// REAL cron route handler, so we exercise the true logic, not a re-implementation.
//
// SAFETY: this NEVER touches field-guide-builder. It creates a mock contract
// view (mock_fgb.linkedin_posts_view) in the SAME Supabase database — shaped
// exactly like the contract — seeds fake LinkedIn posts, and points the sync's
// pg connection at THAT (a verified Supabase host, guarded below). FGB's
// FGB_READONLY_DATABASE_URL is never set here, so the sync's default/env path
// stays dormant; we only pass the mock connection explicitly.
//
// Proves: schema-shape validation (good + malformed), upsert into `content` as
// linkedin_auto, published rows appear on the public /blog, canonicalization,
// dedupe (re-run => no dupes), overlapping-window (no double-insert), full
// backfill picks up out-of-window rows, single-flight lock blocks a concurrent
// run, stale-lock takeover, last_success_at advances, a simulated FGB error
// records last_error + releases the lock + doesn't corrupt content, and the
// cron endpoint's auth (401/503) + no-op-when-unconfigured (200). Full teardown.
// ============================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

import {
  runLinkedinSync,
  readViewRows,
  validateViewShape,
  getSyncHealth,
  isFgbConfigured,
  SyncError,
  AUTO_SYNC_STATUS,
  SYNC_NAME,
} from '../lib/linkedin_sync.js';
import * as cronRoute from '../app/api/cron/linkedin-sync/route.js';
import { updateContentFields } from '../lib/gate.js';

// ---- env --------------------------------------------------------------------
function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* fine */
  }
}
loadEnvLocal();

// SAFETY: the sync must be dormant for the cron no-op test — never set this.
delete process.env.FGB_READONLY_DATABASE_URL;
delete process.env.FGB_READONLY_VIEW;

const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RAW_PG =
  process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures += 1;
};
const section = (t) => console.log(`\n== ${t} ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SUPA_URL || !SERVICE || !RAW_PG) {
  console.log('SKIP: Supabase not fully configured (need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,');
  console.log('      and a Supabase Postgres URL in POSTGRES_URL_NON_POOLING/SUPABASE_DB_URL).');
  process.exit(2);
}

// GUARD: the mock DB connection must be a SUPABASE host — never Neon/FGB.
let pgHost = '';
try {
  pgHost = new URL(RAW_PG).host.toLowerCase();
} catch {
  /* ignore */
}
const isSupabaseHost =
  /(^|\.)supabase\.(co|com)$/.test(pgHost) || /pooler\.supabase\.com$/.test(pgHost) || pgHost.includes('supabase.');
if (!isSupabaseHost) {
  console.error(`REFUSING to run: mock DB host "${pgHost}" is not a Supabase host.`);
  console.error('This guard prevents the verify from ever connecting to Neon / field-guide-builder.');
  process.exit(3);
}

// The Supabase pooler presents a self-signed cert -> use sslmode=no-verify for
// the TEST connection ONLY. (lib/linkedin_sync.js itself never disables
// verification; it just honors whatever sslmode the URL carries — real FGB/Neon
// URLs use sslmode=require, which pg verifies.)
function mockConn() {
  const u = new URL(RAW_PG);
  u.searchParams.set('sslmode', 'no-verify');
  return u.toString();
}
const MOCK_CONN = mockConn();
const VIEW = 'mock_fgb.linkedin_posts_view';
const BAD_VIEW = 'mock_fgb.linkedin_posts_bad';
const stamp = `fverify-${Date.now()}`;
const bodyLike = `%${stamp}%`;
const extIdLike = `%${stamp}%`;

const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
const anon = ANON ? createClient(SUPA_URL, ANON, { auth: { persistSession: false } }) : null;
let setup; // rw pg client for mock schema + migration

// ---- helpers ----------------------------------------------------------------
async function contentRows() {
  const { data } = await svc
    .from('content')
    .select('external_id, status, media, payload, body_md')
    .eq('source', 'linkedin_auto')
    .like('external_id', extIdLike);
  return data || [];
}
async function contentCount() {
  const { count } = await svc
    .from('content')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'linkedin_auto')
    .like('external_id', extIdLike);
  return count ?? 0;
}
async function health() {
  return getSyncHealth();
}
async function resetLockRow() {
  await setup.query(
    `update public.sync_state set locked_by=null, locked_at=null, last_run_at=null,
       last_success_at=null, last_error=null, last_error_at=null, last_window_days=null,
       synced_count=0, created_count=0, updated_count=0, updated_at=now() where name=$1`,
    [SYNC_NAME],
  );
}
async function seed(n, hoursAgo, body, attachments) {
  const tracking = n === 1 ? '?utm_source=share&trk=feed_x' : '';
  const urn = `https://www.linkedin.com/feed/update/urn:li:activity:${stamp}-${n}${tracking}`;
  await setup.query(
    `insert into mock_fgb.posts (li_urn, post_body, permalink, posted_at, attachments)
       values ($1,$2,$3, now() - make_interval(hours => $4), $5::jsonb)`,
    [urn, body, urn, hoursAgo, JSON.stringify(attachments)],
  );
  return urn;
}

async function main() {
  // ---- Part A: pure unit — shape validation (no DB) ------------------------
  section('A. schema-shape validation (pure)');
  const goodFields = [
    { name: 'external_id', dataTypeID: 25 },
    { name: 'text_md', dataTypeID: 25 },
    { name: 'url', dataTypeID: 1043 }, // varchar accepted as text-family
    { name: 'published_at', dataTypeID: 1184 },
    { name: 'media', dataTypeID: 3802 },
  ];
  ok('valid shape passes', validateViewShape(goodFields) === true);
  const throwsShape = (label, fields) => {
    try {
      validateViewShape(fields);
      ok(label, false);
    } catch (e) {
      ok(label, e instanceof SyncError && e.code === 'bad_view_shape');
    }
  };
  throwsShape('rejects missing column', goodFields.filter((f) => f.name !== 'media'));
  throwsShape('rejects extra column', [...goodFields, { name: 'secret', dataTypeID: 25 }]);
  throwsShape('rejects wrong type (published_at as text)', goodFields.map((f) => (f.name === 'published_at' ? { ...f, dataTypeID: 25 } : f)));

  // ---- setup: migration + mock schema --------------------------------------
  section('setup: apply 0007 + build mock contract view (Supabase, NOT FGB)');
  setup = new pg.Client({ connectionString: MOCK_CONN, connectionTimeoutMillis: 10000 });
  await setup.connect();

  const migrationSql = readFileSync(new URL('../supabase/migrations/0007_sync_state.sql', import.meta.url), 'utf8');
  await setup.query(migrationSql); // idempotent
  console.log('applied migration 0007_sync_state.sql (idempotent)');

  await setup.query('drop schema if exists mock_fgb cascade');
  await setup.query('create schema mock_fgb');
  // FGB-like base table with DELIBERATELY different column names, to prove the
  // contract view (not our code) maps FGB's real schema -> our stable names.
  await setup.query(`
    create table mock_fgb.posts (
      li_urn      text primary key,
      post_body   text,
      permalink   text,
      posted_at   timestamptz not null,
      attachments jsonb not null default '[]'::jsonb
    )`);
  // THE CONTRACT VIEW — same column names + types the real runbook view uses.
  await setup.query(`
    create view mock_fgb.linkedin_posts_view as
      select li_urn::text        as external_id,
             post_body::text     as text_md,
             permalink::text     as url,
             posted_at::timestamptz as published_at,
             attachments::jsonb  as media
        from mock_fgb.posts`);
  // A malformed view (missing the media column) for the rejection test.
  await setup.query(`
    create view mock_fgb.linkedin_posts_bad as
      select li_urn::text as external_id, post_body::text as text_md,
             permalink::text as url, posted_at::timestamptz as published_at
        from mock_fgb.posts`);

  await seed(1, 24, `LinkedIn recent one ${stamp} with **bold** text`, []);
  await seed(2, 48, `LinkedIn recent two ${stamp} has an image`, [
    { kind: 'image', url: `https://example.com/img-${stamp}.jpg`, alt: 'pic' },
  ]);
  await seed(3, 3, `LinkedIn recent three ${stamp}`, []);
  await seed('old', 400 * 24, `LinkedIn OLD ${stamp} out of window`, []);
  // A MALFORMED-but-shape-valid row (media is a jsonb OBJECT, not an array):
  // passes the view shape check but mapRowToItem rejects it — proving one bad
  // row is skipped-and-counted, not fatal to the whole run (Finding 8).
  await seed('badmedia', 6, `LinkedIn BADMEDIA ${stamp} malformed`, {});
  console.log('seeded 3 recent + 1 old + 1 malformed post into mock_fgb.posts');

  // Wait for PostgREST to see the freshly-applied table + RPCs.
  section('setup: wait for PostgREST schema cache');
  let schemaReady = false;
  for (let i = 0; i < 30 && !schemaReady; i += 1) {
    const t = await svc.from('sync_state').select('name').limit(1);
    const r = await svc.rpc('sync_try_acquire', { p_name: '__probe_nonexistent__', p_holder: 'probe', p_stale_minutes: 30 });
    if (!t.error && !r.error) schemaReady = true;
    else await sleep(1000);
  }
  ok('sync_state table + RPCs visible to PostgREST', schemaReady);
  await resetLockRow();

  // ---- B. schema validation against a real (malformed) view ----------------
  section('B. schema-shape validation rejects a malformed view (real pg)');
  let rejected = false;
  try {
    await readViewRows({ connectionString: MOCK_CONN, viewName: BAD_VIEW });
  } catch (e) {
    rejected = e instanceof SyncError && e.code === 'bad_view_shape';
  }
  ok('readViewRows rejects malformed view (missing media)', rejected);

  // ---- C. first windowed sync upserts into content -------------------------
  section('C. first sync (7d window) upserts recent posts as linkedin_auto');
  const r1 = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: VIEW, windowDays: 7 });
  ok('sync ok', r1.ok === true, JSON.stringify(r1));
  ok('created 3 recent (old post excluded by window)', r1.created === 3 && r1.updated === 0 && r1.synced === 3, JSON.stringify(r1));
  ok('one malformed row skipped-and-counted, not fatal (Finding 8)', r1.skippedRows === 1, JSON.stringify(r1));
  ok('content has exactly 3 linkedin_auto rows', (await contentCount()) === 3);

  // ---- D. published rows appear on the public /blog ------------------------
  section('D. auto-synced posts appear on public /blog (published)');
  ok('AUTO_SYNC_STATUS is "published" (documented)', AUTO_SYNC_STATUS === 'published');
  if (anon) {
    const { data: pub } = await anon
      .from('public_content')
      .select('source, body_md, media, payload')
      .eq('source', 'linkedin_auto')
      .ilike('body_md', bodyLike);
    ok('3 synced posts visible via public_content (anon)', Array.isArray(pub) && pub.length === 3, `got ${pub?.length}`);
    const withImg = (pub || []).find((p) => String(p.body_md).includes('has an image'));
    ok('media flows through (image on post two)', Array.isArray(withImg?.media) && withImg.media[0]?.kind === 'image');
    const withLink = (pub || []).find((p) => p.payload?.link?.url);
    ok('payload.link.url set for "View on LinkedIn" link', Boolean(withLink), withLink?.payload?.link?.url || '');
  } else {
    console.log('SKIP  anon /blog checks (SUPABASE_ANON_KEY unset)');
  }

  // ---- E. canonicalization -------------------------------------------------
  section('E. external_id canonicalized (tracking + www stripped)');
  const rows = await contentRows();
  const row1 = rows.find((r) => r.external_id.includes(`${stamp}-1`));
  ok('row1 external_id stripped of utm_/trk + www', Boolean(row1) && !/utm_|[?&]trk=|www\./.test(row1.external_id), row1?.external_id || '(missing)');

  // ---- F. dedupe + overlapping window (no double-insert) -------------------
  section('F. re-run within overlapping window => dedupe, no duplicates');
  const r2 = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: VIEW, windowDays: 7 });
  ok('re-run updates (created=0, updated=3)', r2.ok && r2.created === 0 && r2.updated === 3, JSON.stringify(r2));
  ok('content still exactly 3 rows (overlapping window did not double-insert)', (await contentCount()) === 3);

  // ---- G. backfill (all) picks up out-of-window rows -----------------------
  section('G. backfill (all=true) picks up the out-of-window old post');
  const r3 = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: VIEW, all: true });
  ok('backfill created 1 (old) + updated 3', r3.ok && r3.created === 1 && r3.updated === 3, JSON.stringify(r3));
  ok('content now exactly 4 rows', (await contentCount()) === 4);

  // ---- G2. owner-edit preservation (High #2 / Finding 4) -------------------
  section('G2. an owner edit survives the daily autosync (locally_edited)');
  const { data: editRow } = await svc.from('content').select('id, body_md')
    .eq('source', 'linkedin_auto').like('external_id', `%${stamp}-1%`).maybeSingle();
  ok('located synced row #1 to edit', Boolean(editRow?.id), editRow?.id || '(none)');
  const OWNER_BODY = `OWNER EDITED via composer — must survive re-sync ${stamp}`;
  // Edit through the REAL gate path the composer uses (PK update + locally_edited).
  await updateContentFields(editRow.id, { body_md: OWNER_BODY });
  const { data: editedNow } = await svc.from('content').select('body_md, locally_edited').eq('id', editRow.id).maybeSingle();
  ok('composer edit set locally_edited=true + new body', editedNow?.locally_edited === true && editedNow?.body_md === OWNER_BODY);
  // Re-run the autosync — the source view STILL has the original body for row #1.
  const rEdit = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: VIEW, windowDays: 7 });
  ok('re-sync ran (autosync mode)', rEdit.ok === true, JSON.stringify(rEdit));
  const { data: afterSync } = await svc.from('content').select('body_md, locally_edited').eq('id', editRow.id).maybeSingle();
  ok('owner edit PRESERVED — autosync did NOT revert body_md', afterSync?.body_md === OWNER_BODY, (afterSync?.body_md || '').slice(0, 44));
  ok('locally_edited flag still set after re-sync', afterSync?.locally_edited === true);
  // A NON-edited row is still refreshed from source normally (un-edited posts sync).
  const { data: freshRow } = await svc.from('content').select('body_md, locally_edited')
    .eq('source', 'linkedin_auto').like('external_id', `%${stamp}-2%`).maybeSingle();
  ok('un-edited row still syncs from source (locally_edited=false)', String(freshRow?.body_md || '').includes(String(stamp)) && freshRow?.locally_edited === false);
  ok('content still exactly 4 rows after edit + re-sync', (await contentCount()) === 4);

  // ---- H. single-flight lock blocks a concurrent run -----------------------
  section('H. single-flight lock blocks a concurrent run');
  const { data: gotLock } = await svc.rpc('sync_try_acquire', { p_name: SYNC_NAME, p_holder: 'ghost-holder', p_stale_minutes: 30 });
  ok('manually acquired the lock', gotLock === true);
  const rLocked = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: VIEW, windowDays: 7 });
  ok('concurrent run SKIPS (locked)', rLocked.ok === true && rLocked.skipped === 'locked' && rLocked.synced === 0, JSON.stringify(rLocked));
  ok('content unchanged during blocked run (still 4)', (await contentCount()) === 4);
  const { data: finished } = await svc.rpc('sync_finish', {
    p_name: SYNC_NAME, p_holder: 'ghost-holder', p_success: true, p_error: null,
    p_synced: 0, p_created: 0, p_updated: 0, p_window_days: 7,
  });
  ok('holder released the lock (sync_finish returned true)', finished === true);
  const hAfterRelease = await health();
  ok('lock is free after release', !hAfterRelease?.locked_by);

  // ---- I. stale-lock takeover ----------------------------------------------
  section('I. stale lock is reclaimed (takeover after N minutes)');
  await setup.query(
    `update public.sync_state set locked_by='stale-ghost', locked_at = now() - interval '60 minutes' where name=$1`,
    [SYNC_NAME],
  );
  const rTakeover = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: VIEW, windowDays: 7, staleMinutes: 30 });
  ok('reclaims a >30min-old lock and runs', rTakeover.ok === true && !rTakeover.skipped, JSON.stringify(rTakeover));

  // ---- J. last_success_at advances -----------------------------------------
  section('J. last_success_at advances on a successful run');
  const before = (await health())?.last_success_at;
  await sleep(1100);
  const rSucc = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: VIEW, windowDays: 7 });
  const after = (await health())?.last_success_at;
  ok('successful run recorded', rSucc.ok === true);
  ok('last_success_at moved forward', Boolean(after) && (!before || new Date(after) > new Date(before)), `${before} -> ${after}`);

  // ---- K. simulated FGB error: fail-safe -----------------------------------
  section('K. simulated FGB error records last_error + releases lock + no corruption');
  const countBeforeErr = await contentCount();
  const rErr = await runLinkedinSync({ connectionString: MOCK_CONN, viewName: 'mock_fgb.does_not_exist', windowDays: 7 });
  ok('sync returns ok:false (did not throw)', rErr.ok === false, JSON.stringify(rErr));
  const hErr = await health();
  ok('last_error recorded', Boolean(hErr?.last_error), (hErr?.last_error || '').slice(0, 60));
  ok('lock released after error', !hErr?.locked_by);
  ok('content NOT corrupted (count unchanged)', (await contentCount()) === countBeforeErr);

  // ---- L. cron endpoint auth + no-op ---------------------------------------
  section('L. cron endpoint: auth (401/503) + no-op when FGB unset (200)');
  const call = (headers = {}) =>
    cronRoute.GET(new Request('https://example.com/api/cron/linkedin-sync', { method: 'GET', headers }));

  // 503 when the deployment has no CRON_SECRET at all (fail-closed).
  delete process.env.CRON_SECRET;
  const res503 = await call();
  ok('503 when CRON_SECRET unset (inert by design)', res503.status === 503);

  // 401 when a secret IS configured but the request omits it.
  process.env.CRON_SECRET = 'test-cron-secret-xyz';
  const res401 = await call();
  ok('401 without the bearer secret', res401.status === 401);
  const resBad = await call({ authorization: 'Bearer wrong' });
  ok('401 with a wrong bearer secret', resBad.status === 401);

  // 200 no-op when authorized but FGB is unset (dormant on deploy).
  const resOk = await call({ authorization: 'Bearer test-cron-secret-xyz' });
  const okBody = await resOk.json();
  ok('200 + skipped:not_configured when authorized & FGB unset', resOk.status === 200 && okBody.skipped === 'not_configured', JSON.stringify(okBody));
  delete process.env.CRON_SECRET;

  // ---- M. dormancy sanity --------------------------------------------------
  section('M. sync is dormant (FGB env unset)');
  ok('isFgbConfigured() is false (dormant)', isFgbConfigured() === false);
  const vercelJson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  ok('cron registered in vercel.json', Array.isArray(vercelJson.crons) && vercelJson.crons.some((c) => c.path === '/api/cron/linkedin-sync'));
}

// ---- run + teardown ---------------------------------------------------------
try {
  await main();
} catch (e) {
  console.error('\nUNEXPECTED ERROR:', e?.stack || e);
  failures += 1;
} finally {
  section('teardown');
  try {
    await svc.from('content').delete().eq('source', 'linkedin_auto').like('external_id', extIdLike);
    const leftover = await contentCount();
    ok('all test content rows deleted', leftover === 0, `leftover=${leftover}`);
  } catch (e) {
    console.log('content cleanup error:', e?.message);
  }
  if (setup) {
    try {
      await setup.query('drop schema if exists mock_fgb cascade');
      await resetLockRow();
      console.log('dropped mock_fgb schema + reset sync_state row to pristine');
    } catch (e) {
      console.log('pg teardown error:', e?.message);
    }
    await setup.end().catch(() => {});
  }
}

console.log(`\n${failures === 0 ? 'PHASE F: ALL PASS' : `PHASE F: ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
