// ============================================================
// scripts/phase-d-verify.mjs — end-to-end verification for Phase D (X studio).
//
//   node --conditions=react-server scripts/phase-d-verify.mjs
//   (npm run verify:phase-d)
//
// --conditions=react-server lets this plain-Node process import the REAL
// server-only drafting module (lib/x_draft.js) + ingestion gate (lib/gate.js)
// exactly as the app does, so we exercise the true logic, not a re-implementation.
//
// It CANNOT log in (the admin session secret is unset by design), so it verifies
// the studio fail-closed and exercises the drafting/persistence logic directly:
//
//   A. STUBBED-LLM unit tests (always run; no network, no DB): generateXDrafts
//      with an injected llmFn returning canned variants — asserts variants are
//      parsed, character-limited, and thread-split correctly; asserts it DEGRADES
//      GRACEFULLY (returns { ok:false }, never throws) when the stub throws or
//      returns empty. Plus splitter/counter/external_id invariants.
//   (DB parts SKIP cleanly if Supabase creds are unset.)
//   B. Seed x_auto DRAFTS through the REAL gate (buildXDraftItem -> ingestContent),
//      driven by the stubbed generator: one single draft (stays draft, dedupe
//      checked), one thread + one single that get published via moderateContent.
//      Assert the draft is ABSENT from the anon public_content surface /blog reads.
//   C. Cold build + next start, then assert the fail-closed surface (/ byte-
//      identical, /admin/x -> login redirect, /api/x/* -> 401) AND that the
//      published x_auto posts RENDER on /blog (X chip; thread as sequential
//      tweets) while the draft stays hidden.
//   D. Full teardown (delete every test row) + confirm the slate is clean.
//   Optional live-generation probe (INFO only) reports whether OpenRouter had
//   credits — never counted as a failure (free pool is often exhausted).
// ============================================================
import { readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { generateXDrafts, buildXDraftItem } from '../lib/x_draft.js';
import { countChars, splitIntoTweets, parseVariants, xDraftExternalId, TWEET_LIMIT } from '../lib/x_draft_pure.js';
import { ingestContent, moderateContent } from '../lib/gate.js';
import { canonicalizeUrl } from '../lib/canonical.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3211;
const BASE = `http://127.0.0.1:${PORT}`;

function loadEnvLocal() {
  try {
    const txt = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fine */ }
}
loadEnvLocal();

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const info = (name, detail = '') => console.log(`INFO  ${name}${detail ? '  ' + detail : ''}`);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------
// A. STUBBED-LLM UNIT TESTS (no network, no DB) — always run.
// ---------------------------------------------------------------
async function stubbedTests() {
  console.log('\n== A. Stubbed-LLM drafting logic (deterministic, no network) ==');

  // 3 distinct single-tweet variants separated by --- lines.
  const rawSingles = [
    'Shipped a config-driven 12-stage LLM pipeline — one YAML file launches a job.',
    '900 Pydantic checks now gate every pipeline stage before a job hits the cluster.',
    'Cut time-to-experiment >50% on a shared 4xH100 SLURM cluster this term.',
  ].join('\n---\n');
  const rSingle = await generateXDrafts(
    { topic: 'my research pipeline', tone: 'Punchy', format: 'single' },
    { llmFn: async () => ({ text: rawSingles, model: 'stub/model-x' }) },
  );
  ok('gen(single): ok=true', rSingle.ok === true);
  ok('gen(single): parsed 3 variants', rSingle.variants?.length === 3, `(got ${rSingle.variants?.length})`);
  ok('gen(single): model_used passed through', rSingle.model_used === 'stub/model-x');
  ok('gen(single): every variant is ONE tweet <=280',
    rSingle.variants.every((v) => v.tweets.length === 1 && v.char_counts[0] <= TWEET_LIMIT));

  // A single string return (not {text,model}) should also work; model_used=unknown.
  const rStr = await generateXDrafts({ topic: 't', format: 'single' }, { llmFn: async () => rawSingles });
  ok('gen(single): plain-string llmFn accepted, model_used=unknown', rStr.ok === true && rStr.model_used === 'unknown');

  // Thread: one long variant that must split into multiple <=280 tweets.
  const longThread = Array.from({ length: 90 }, (_, i) => `insight${i}`).join(' ');
  const rawThread = `${longThread}\n---\nshorter second thread option here`;
  const rThread = await generateXDrafts(
    { topic: 'lessons learned', format: 'thread' },
    { llmFn: async () => ({ text: rawThread, model: 'stub/thread' }) },
  );
  ok('gen(thread): ok=true', rThread.ok === true);
  const v0 = rThread.variants[0];
  ok('gen(thread): first variant splits into >1 tweet', v0.tweets.length > 1, `(${v0.tweets.length} tweets)`);
  ok('gen(thread): every tweet <=280', v0.tweets.every((t) => countChars(t) <= TWEET_LIMIT));
  ok('gen(thread): char_counts align with tweets', JSON.stringify(v0.char_counts) === JSON.stringify(v0.tweets.map(countChars)));

  // GRACEFUL DEGRADATION — never throws.
  let threw = false;
  let rThrow;
  try { rThrow = await generateXDrafts({ topic: 't', format: 'single' }, { llmFn: async () => { throw Object.assign(new Error('502 ResourceExhausted'), { status: 502 }); } }); }
  catch { threw = true; }
  ok('degrade: llmFn throws -> returns cleanly (no throw)', threw === false);
  ok('degrade: llmFn throws -> ok=false generation_unavailable', rThrow?.ok === false && rThrow?.error === 'generation_unavailable');

  const rEmpty = await generateXDrafts({ topic: 't', format: 'single' }, { llmFn: async () => '   ' });
  ok('degrade: empty output -> ok=false empty_generation', rEmpty.ok === false && rEmpty.error === 'empty_generation');

  const rNoParse = await generateXDrafts({ topic: 't', format: 'single' }, { llmFn: async () => '\n---\n---\n' });
  ok('degrade: unparseable output -> ok=false empty_generation', rNoParse.ok === false && rNoParse.error === 'empty_generation');

  const rNoTopic = await generateXDrafts({ topic: '', format: 'single' }, { llmFn: async () => rawSingles });
  ok('degrade: missing topic -> ok=false invalid_input (llmFn never called)', rNoTopic.ok === false && rNoTopic.error === 'invalid_input');

  // Pure invariants.
  const words = Array.from({ length: 120 }, (_, i) => `w${i}`);
  const tw = splitIntoTweets(words.join(' '));
  ok('split: all tweets <=280', tw.every((t) => countChars(t) <= TWEET_LIMIT));
  ok('split: no word broken (rejoins losslessly)', tw.join(' ').split(/\s+/).join(' ') === words.join(' '));
  ok('split: overlong single token hard-split', splitIntoTweets('z'.repeat(650)).every((t) => countChars(t) <= TWEET_LIMIT));
  ok('count: astral emoji counts as 1 code point', countChars('a😀b') === 3, `(got ${countChars('a😀b')})`);

  const e1 = xDraftExternalId('My Topic!', 'single', 'hello');
  ok('extid: deterministic + content-derived', e1 === xDraftExternalId('My Topic!', 'single', 'hello') && e1 !== xDraftExternalId('My Topic!', 'single', 'bye'));
  ok('extid: canonicalizeUrl passthrough (dedupe key is exact)', canonicalizeUrl(e1) === e1, e1);

  // draftId identity: a stable per-card id keeps the row stable ACROSS text
  // edits — this is what makes "save draft, edit inline, then approve" persist
  // the edited text into the one row instead of dropping it or orphaning a row.
  const bidA = buildXDraftItem({ topic: 'T', format: 'single', draftId: 'vcardA1', chosenText: 'first version' }).external_id;
  const bidA2 = buildXDraftItem({ topic: 'T', format: 'single', draftId: 'vcardA1', chosenText: 'HEAVILY edited later version' }).external_id;
  const bidB = buildXDraftItem({ topic: 'T', format: 'single', draftId: 'vcardB2', chosenText: 'first version' }).external_id;
  ok('extid(draftId): stable across text edits (edit-then-approve hits one row)', bidA === bidA2, bidA);
  ok('extid(draftId): different card -> different row', bidA !== bidB);
  ok('extid(draftId): canonicalizeUrl passthrough', canonicalizeUrl(bidA) === bidA);

  const pv = parseVariants('Variant 1: alpha\n---\n2) alpha\n---\n"beta"', { format: 'single' });
  ok('parse: strips labels/quotes + dedups identical', pv.length === 2 && pv[0].text === 'alpha' && pv[1].text === 'beta', JSON.stringify(pv.map((v) => v.text)));
}

// ---------------------------------------------------------------
// server lifecycle (mirrors phase-c-verify)
// ---------------------------------------------------------------
function runBuild(tag) {
  try { rmSync(join(ROOT, '.next'), { recursive: true, force: true }); } catch { /* fine */ }
  console.log(`\n[${tag}] npm run build (cold) ...`);
  const res = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8', env: process.env });
  const clean = res.status === 0;
  ok(`${tag}: build succeeds`, clean, clean ? '' : (res.stderr || res.stdout || '').slice(-600));
  return clean;
}
async function startServer() {
  const child = spawn(join(ROOT, 'node_modules', '.bin', 'next'), ['start', '-p', String(PORT)], {
    cwd: ROOT, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try { const r = await fetch(`${BASE}/api/health`, { cache: 'no-store' }); if (r.ok) return child; } catch { /* not up */ }
    if (child.exitCode != null) break;
  }
  throw new Error('server did not become ready:\n' + log.slice(-600));
}
function stopServer(child) {
  if (!child || child.pid == null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* */ } }
}
async function curl(path, opts) { return fetch(`${BASE}${path}`, { cache: 'no-store', ...opts }); }
async function post(path) { return curl(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); }

// ---------------------------------------------------------------
// B. Seed x_auto drafts through the REAL gate, driven by the stub.
// ---------------------------------------------------------------
const STAMP = Date.now();
const MARK_A = `xdmark${STAMP}a`;   // single draft — stays DRAFT (must stay hidden)
const MARK_B = `xdmark${STAMP}b`;   // thread — will be PUBLISHED
const MARK_C = `xdmark${STAMP}c`;   // single — will be PUBLISHED
const MARK_E = `xdmark${STAMP}e`;   // edit-persistence case (stays draft)
const created = []; // { source, external_id }
let extA = '', extB = '', extC = '';

async function seedDrafts(svc) {
  console.log('\n== B. Seed x_auto drafts via ingestContent (stubbed generator) ==');

  // --- draft A: single, driven end-to-end through the stubbed generator ---
  const genA = await generateXDrafts(
    { topic: `${STAMP} single draft`, tone: 'Punchy', format: 'single' },
    { llmFn: async () => ({ text: `${MARK_A} — a single-tweet draft that stays hidden until approved.`, model: 'stub/model' }) },
  );
  ok('seedA: generator ok', genA.ok === true && genA.variants.length >= 1);
  const itemA = buildXDraftItem({
    topic: `${STAMP} single draft`, tone: 'Punchy', format: 'single',
    model_used: genA.model_used, variants: genA.variants.map((v) => v.text),
    chosenText: genA.variants[0].text,
  });
  ok('seedA: item is x_auto/text/draft', itemA.source === 'x_auto' && itemA.type === 'text' && itemA.status === 'draft');
  const rA1 = await ingestContent(itemA);
  extA = rA1.external_id; created.push({ source: 'x_auto', external_id: extA });
  ok('seedA: created as new row', rA1.created === true);

  // dedupe: rebuild the IDENTICAL draft (fresh item, same topic/format/text) -> same row.
  const itemA2 = buildXDraftItem({ topic: `${STAMP} single draft`, format: 'single', chosenText: genA.variants[0].text });
  const rA2 = await ingestContent(itemA2);
  ok('seedA: dedupe re-save UPSERTS same row (created=false, same id)', rA2.created === false && rA2.id === rA1.id && rA2.external_id === extA);
  const { count: cntA } = await svc.from('content').select('id', { count: 'exact', head: true }).eq('source', 'x_auto').eq('external_id', extA);
  ok('seedA: exactly one row for the draft', cntA === 1, `(count=${cntA})`);

  // --- draft B: THREAD (long text -> multiple tweets), will be published ---
  const longB = `${MARK_B} ${Array.from({ length: 70 }, (_, i) => `pt${i}`).join(' ')} closing thought about the build`;
  const genB = await generateXDrafts(
    { topic: `${STAMP} thread`, format: 'thread' },
    { llmFn: async () => ({ text: longB, model: 'stub/thread' }) },
  );
  const itemB = buildXDraftItem({
    topic: `${STAMP} thread`, format: 'thread', model_used: genB.model_used,
    variants: genB.variants.map((v) => v.text), chosenText: genB.variants[0].text,
  });
  ok('seedB: item is x_auto/thread with payload.thread[]', itemB.type === 'thread' && Array.isArray(itemB.payload.thread) && itemB.payload.thread.length > 1);
  const rB = await ingestContent(itemB);
  extB = rB.external_id; created.push({ source: 'x_auto', external_id: extB });
  ok('seedB: thread draft created', rB.created === true);

  // --- draft C: single, will be published ---
  const itemC = buildXDraftItem({ topic: `${STAMP} pub single`, format: 'single', model_used: 'stub', chosenText: `${MARK_C} — an approved single tweet.` });
  const rC = await ingestContent(itemC);
  extC = rC.external_id; created.push({ source: 'x_auto', external_id: extC });
  ok('seedC: single draft created', rC.created === true);

  // --- edit-persistence (the reviewed fix): save a draft, then "edit inline" and
  // re-save with the SAME stable draftId -> UPSERT the same row with the NEW body,
  // never a text-blind status flip that keeps the pre-edit text. ---
  const eDraftId = `veditcard${STAMP}`;
  const itemE1 = buildXDraftItem({ topic: `${STAMP} editcase`, format: 'single', draftId: eDraftId, chosenText: `${MARK_E} original pre-edit text` });
  const rE1 = await ingestContent(itemE1);
  created.push({ source: 'x_auto', external_id: rE1.external_id });
  const itemE2 = buildXDraftItem({ topic: `${STAMP} editcase`, format: 'single', draftId: eDraftId, chosenText: `${MARK_E} EDITED text made after the first save` });
  const rE2 = await ingestContent(itemE2);
  ok('edit-fix: same draftId + edited text UPSERTS the same row (no orphan)', rE2.created === false && rE2.id === rE1.id);
  const { data: erow } = await svc.from('content').select('body_md').eq('id', rE1.id).maybeSingle();
  ok('edit-fix: stored body_md is the EDITED text, not the pre-edit text',
    Boolean(erow?.body_md?.includes('EDITED text made after the first save')) && !erow?.body_md?.includes('original pre-edit text'));

  // While all three are DRAFT: none visible on the anon public surface /blog reads.
  if (SB_ANON) {
    const anon = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    for (const [mk, lbl] of [[MARK_A, 'A'], [MARK_B, 'B'], [MARK_C, 'C']]) {
      const { data } = await anon.from('public_content').select('id').ilike('body_md', `%${mk}%`);
      ok(`seed: draft ${lbl} NOT visible to anon while draft`, Array.isArray(data) && data.length === 0, `(saw ${data?.length})`);
    }
  }

  // Publish B (thread) and C (single) via the gate's lifecycle write.
  const upB = await moderateContent(rB.id, { status: 'published' });
  ok('publish B via moderateContent -> published', upB.status === 'published' && upB.deleted_at === null);
  const upC = await moderateContent(rC.id, { status: 'published' });
  ok('publish C via moderateContent -> published', upC.status === 'published');

  // A stays draft; B & C now visible to anon.
  if (SB_ANON) {
    const anon = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data: da } = await anon.from('public_content').select('id').ilike('body_md', `%${MARK_A}%`);
    ok('post-publish: draft A STILL hidden from anon', Array.isArray(da) && da.length === 0);
    const { data: db } = await anon.from('public_content').select('id, type').ilike('body_md', `%${MARK_B}%`);
    ok('post-publish: thread B visible to anon (type=thread)', Array.isArray(db) && db.length === 1 && db[0].type === 'thread');
    const { data: dc } = await anon.from('public_content').select('id').ilike('body_md', `%${MARK_C}%`);
    ok('post-publish: single C visible to anon', Array.isArray(dc) && dc.length === 1);
  }
}

// ---------------------------------------------------------------
// C. Fail-closed surface + published rendering (single build).
// ---------------------------------------------------------------
async function assertFailClosed() {
  console.log('\n-- fail-closed surface --');
  const rootRes = await curl('/');
  const rootBody = Buffer.from(await rootRes.arrayBuffer());
  const fileSha = sha256(readFileSync(join(ROOT, 'public', 'index.html')));
  ok('/ is byte-identical to public/index.html', sha256(rootBody) === fileSha, `(${rootBody.length} bytes)`);

  const adminX = await curl('/admin/x', { redirect: 'manual' });
  const loc = adminX.headers.get('location') || '';
  ok('/admin/x redirects to /admin/login', (adminX.status === 307 || adminX.status === 308) && loc.includes('/admin/login'), `(${adminX.status} ${loc})`);

  for (const p of ['/api/x/generate', '/api/x/save']) {
    const r = await post(p);
    ok(`${p} without session -> 401`, r.status === 401, `(${r.status})`);
  }
  // sanity: a pre-existing admin route still fail-closed too
  const modR = await post('/api/content/moderate');
  ok('/api/content/moderate without session -> 401', modR.status === 401, `(${modR.status})`);
}

async function assertPublishedRender() {
  console.log('\n-- published x_auto rendering on /blog --');
  const html = await (await curl('/blog')).text();
  ok('/blog: X source chip present', html.includes('chip x'));
  ok('/blog: published thread B renders (marker present)', html.includes(MARK_B));
  ok('/blog: thread B renders as SEQUENTIAL tweets (thread markup)', html.includes('class="thread"') && /class="tnum"/.test(html));
  ok('/blog: published single C renders (marker present)', html.includes(MARK_C));
  ok('/blog: DRAFT A is ABSENT from /blog', !html.includes(MARK_A));
}

async function cleanup(svc) {
  console.log('\n== D. Cleanup ==');
  for (const c of created) {
    await svc.from('content').delete().eq('source', c.source).eq('external_id', c.external_id);
  }
  const extIds = created.map((c) => c.external_id).filter(Boolean);
  if (extIds.length) {
    const { count } = await svc.from('content').select('id', { count: 'exact', head: true }).in('external_id', extIds);
    ok('all test rows deleted (0 remain)', count === 0, `(count=${count})`);
  }
}

// Optional live probe — reports whether OpenRouter had credits. INFO only.
async function liveProbe() {
  console.log('\n== (optional) live OpenRouter probe — INFO only, not a pass/fail ==');
  if (!process.env.OPENROUTER_API_KEY) { info('live probe skipped: OPENROUTER_API_KEY unset'); return; }
  try {
    const r = await generateXDrafts({ topic: 'a quick note about shipping software fast', tone: 'Punchy', format: 'single' });
    if (r.ok) info('live generation WORKED', `model=${r.model_used}, ${r.variants.length} variant(s), first="${(r.variants[0]?.text || '').slice(0, 70)}..."`);
    else info('live generation returned ok=false (expected if free pool out of credits)', `error=${r.error}`);
  } catch (e) { info('live probe threw (unexpected — generateXDrafts should not throw)', e?.message || String(e)); }
}

// ---- run ----
await stubbedTests();

if (!SB_URL || !SB_SVC) {
  console.log('\nSKIP  Supabase creds unset (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — DB + render checks skipped.');
  console.log(`\n${failures === 0 ? 'PHASE D VERIFY: STUBBED TESTS ALL PASS (DB skipped)' : `PHASE D VERIFY: ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

const svc = createClient(SB_URL, SB_SVC, { auth: { persistSession: false, autoRefreshToken: false } });
let server = null;
try {
  await seedDrafts(svc);
  if (runBuild('build')) {
    server = await startServer();
    await assertFailClosed();
    await assertPublishedRender();
    stopServer(server); server = null;
    await sleep(800);
  }
  await liveProbe();
} catch (err) {
  console.error('\nERROR during verification:', err?.message || err);
  failures++;
} finally {
  if (server) { stopServer(server); await sleep(500); }
  try { await cleanup(svc); } catch (e) { console.error('cleanup error:', e?.message || e); failures++; }
}

console.log(`\n${failures === 0 ? 'PHASE D VERIFY: ALL PASS' : `PHASE D VERIFY: ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
