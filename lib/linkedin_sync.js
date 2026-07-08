// ============================================================
// lib/linkedin_sync.js — READ-ONLY LinkedIn ingestion (Phase F).
//
// Pulls the owner's auto-posted LinkedIn posts from a STABLE, read-only
// contract VIEW that lives in the field-guide-builder ("FGB") database into
// this platform's Supabase, so they surface on /blog. The sync depends ONLY on
// that view's columns — names WE chose — never on FGB's real schema:
//
//     external_id text, text_md text, url text, published_at timestamptz, media jsonb
//
// The owner creates the view (mapping FGB's real table -> these names) per
// RUNBOOK-LINKEDIN.md. Until FGB_READONLY_DATABASE_URL is set, this module is
// fully DORMANT: runLinkedinSync() no-ops with a "not configured" result and
// opens ZERO outbound connections — nothing here can touch FGB before the
// owner explicitly enables it.
//
// Robustness (all required by Phase F):
//   * READ-ONLY: every read runs inside `START TRANSACTION READ ONLY`, on top
//     of a least-privilege SELECT-only role (see the runbook). We never write
//     to FGB — this is a one-way mirror.
//   * Overlapping window: fetch published_at >= now() - N days so nothing is
//     missed between runs; the ingestion gate's (source, external_id) upsert
//     makes the re-fetch idempotent (no duplicates).
//   * Schema-shape validation: verify the view exposes EXACTLY the contract
//     columns/types BEFORE ingesting; otherwise abort (ingest no garbage).
//   * Single-flight: a Supabase sync_state row lock (stale-takeover) stops two
//     overlapping runs from double-processing.
//   * Dead-man's-switch: last_success_at / last_error recorded for /admin.
//   * Fails safe: any FGB-side error is caught, recorded (last_error), the lock
//     released; the app never crashes and existing content is never corrupted.
//
// server-only: pulls in the service-role Supabase client (via lib/gate.js). The
// `pg` driver is imported lazily so it is only loaded on a real (enabled) run.
// ============================================================
import 'server-only';
import { ingestContent, canonicalizeUrl } from './gate.js';
import { getServiceClient } from './supabase/server.js';

// ---- documented constants ---------------------------------------------------

// PUBLISHED-vs-DRAFT decision for auto-synced posts: they land PUBLISHED.
// These posts are ALREADY public on LinkedIn (the owner auto-posted them), so
// mirroring them to /blog as 'published' matches their existing visibility and
// needs no manual review step. Flip this single constant to 'draft' if you ever
// want auto-synced posts to queue for review in /admin before appearing.
export const AUTO_SYNC_STATUS = 'published';

export const SYNC_NAME = 'linkedin';
export const DEFAULT_WINDOW_DAYS = 7;       // overlapping look-back window
export const STALE_LOCK_MINUTES = 30;       // reclaim a lock held at least this long
export const DEFAULT_VIEW = 'public.linkedin_posts_view'; // the contract view in FGB
const QUERY_TIMEOUT_MS = 20000;
const CONNECT_TIMEOUT_MS = 10000;

// The contract: exact column -> accepted Postgres type OIDs.
//   text=25, varchar=1043, bpchar=1042 (text family); timestamptz=1184; jsonb=3802.
const TEXT_OIDS = new Set([25, 1043, 1042]);
const CONTRACT = {
  external_id:  TEXT_OIDS,
  text_md:      TEXT_OIDS,
  url:          TEXT_OIDS,
  published_at: new Set([1184]),
  media:        new Set([3802]),
};
const CONTRACT_COLS = Object.keys(CONTRACT);

export class SyncError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'SyncError';
    this.code = code;
    this.detail = detail;
  }
}

// True iff the owner has enabled the sync by setting the read-only FGB URL.
export function isFgbConfigured() {
  return Boolean(process.env.FGB_READONLY_DATABASE_URL);
}

// ---- identifier safety ------------------------------------------------------
// The view name comes from trusted config (env / default), never user input,
// but we still validate + double-quote each part so it can never inject SQL.
function quoteQualifiedIdent(name) {
  const parts = String(name).split('.');
  if (parts.length < 1 || parts.length > 2) throw new SyncError('bad_view_name', String(name));
  for (const p of parts) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) throw new SyncError('bad_view_name', String(name));
  }
  return parts.map((p) => `"${p}"`).join('.');
}

// ---- shape validation -------------------------------------------------------
// Given pg field metadata from `SELECT * FROM view LIMIT 0`, assert the view
// exposes EXACTLY the contract columns, each with an accepted type. Pure +
// exported so it is unit-testable without a DB.
export function validateViewShape(fields) {
  const got = new Map((fields || []).map((f) => [f.name, f.dataTypeID]));
  const missing = CONTRACT_COLS.filter((c) => !got.has(c));
  const extra = [...got.keys()].filter((c) => !CONTRACT[c]);
  if (missing.length || extra.length) {
    throw new SyncError(
      'bad_view_shape',
      `columns mismatch: missing=[${missing}] unexpected=[${extra}] expected=[${CONTRACT_COLS}]`,
    );
  }
  const badType = [];
  for (const c of CONTRACT_COLS) {
    if (!CONTRACT[c].has(got.get(c))) badType.push(`${c}(oid ${got.get(c)})`);
  }
  if (badType.length) {
    throw new SyncError('bad_view_shape', `wrong column type(s): ${badType.join(', ')}`);
  }
  return true;
}

// ---- pg connection ----------------------------------------------------------
// SSL: we HONOR the connection string's sslmode. Neon/FGB connection strings
// carry `?sslmode=require`, which `pg` treats as verify-full (the server cert
// IS verified against the system CA — secure). If the URL carries no sslmode we
// default to verified TLS. This module NEVER disables certificate verification;
// a self-signed *test* database must say `sslmode=no-verify` in ITS OWN URL.
async function connectView(connectionString) {
  const { default: pg } = await import('pg');
  const hasSslmode = /[?&]sslmode=/i.test(connectionString);
  const config = {
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    application_name: 'portfolio-linkedin-sync',
  };
  if (!hasSslmode) config.ssl = { rejectUnauthorized: true };
  const client = new pg.Client(config);
  await client.connect();
  return client;
}

// ---- the source read (dependency-injectable) --------------------------------
// Connects to the view, validates its shape, and returns the windowed rows.
// Everything runs inside an explicit READ ONLY transaction — belt-and-suspenders
// on top of the least-privilege SELECT-only role, so a bug here can never write
// to FGB.
export async function readViewRows({
  connectionString,
  viewName = DEFAULT_VIEW,
  windowDays = DEFAULT_WINDOW_DAYS,
  all = false,
} = {}) {
  if (!connectionString) throw new SyncError('not_configured');
  const ident = quoteQualifiedIdent(viewName);
  const client = await connectView(connectionString);
  try {
    await client.query('start transaction read only');
    // 1) shape check — metadata only (LIMIT 0), no rows fetched.
    const probe = await client.query(`select * from ${ident} limit 0`);
    validateViewShape(probe.fields);
    // 2) windowed fetch (or full for a backfill), oldest-first for stable order.
    let res;
    if (all) {
      res = await client.query(
        `select external_id, text_md, url, published_at, media
           from ${ident} order by published_at asc`,
      );
    } else {
      res = await client.query(
        `select external_id, text_md, url, published_at, media
           from ${ident}
          where published_at >= now() - make_interval(days => $1)
          order by published_at asc`,
        [Math.max(0, Math.floor(windowDays))],
      );
    }
    await client.query('commit');
    return res.rows;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

// ---- row -> gate item -------------------------------------------------------
// Maps one contract-view row to the item the ingestion gate expects. The gate
// canonicalizes external_id into the dedupe key and never resets published_at.
export function mapRowToItem(row) {
  if (!row || typeof row !== 'object') throw new SyncError('bad_row', 'not an object');
  const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : '';
  if (!externalId) throw new SyncError('bad_row', 'missing external_id');
  if (row.published_at == null) throw new SyncError('bad_row', 'missing published_at');
  let media = row.media == null ? [] : row.media;
  if (!Array.isArray(media)) throw new SyncError('bad_row', 'media is not a jsonb array');
  const bodyMd = typeof row.text_md === 'string' ? row.text_md : null;
  const rawUrl = typeof row.url === 'string' ? row.url : '';
  const canonUrl = canonicalizeUrl(rawUrl);
  // payload.link.url is what /blog's OriginalLink renders as "View on LinkedIn ↗".
  const payload = canonUrl && /^https?:\/\//i.test(canonUrl) ? { link: { url: canonUrl } } : {};
  return {
    source: 'linkedin_auto',
    type: 'text',
    external_id: externalId,
    url: rawUrl || undefined, // only used by the gate if external_id were absent
    body_md: bodyMd,
    media,
    payload,
    status: AUTO_SYNC_STATUS,
    published_at: row.published_at, // Date from pg; the gate normalizes to UTC ISO
  };
}

function makeHolder() {
  const region = process.env.VERCEL_REGION || 'local';
  return `${region}:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

// ---- the sync ---------------------------------------------------------------
// Acquire lock -> read view -> ingest each row through the gate -> record.
// Returns a plain result object; NEVER throws (fail-safe). Options are
// dependency-injectable so tests can drive it against a mock without FGB.
export async function runLinkedinSync(opts = {}) {
  const {
    connectionString = process.env.FGB_READONLY_DATABASE_URL,
    viewName = process.env.FGB_READONLY_VIEW || DEFAULT_VIEW,
    windowDays = Number(process.env.FGB_SYNC_WINDOW_DAYS) || DEFAULT_WINDOW_DAYS,
    staleMinutes = STALE_LOCK_MINUTES,
    all = false,
    holder = makeHolder(),
    readRows = readViewRows, // dependency injection for tests
    ingest = ingestContent, // dependency injection for tests
    logger = console,
  } = opts;

  // DORMANT until the owner sets FGB_READONLY_DATABASE_URL.
  if (!connectionString) {
    logger.log('[linkedin-sync] not configured (FGB_READONLY_DATABASE_URL unset) — no-op.');
    return { ok: true, skipped: 'not_configured', synced: 0, created: 0, updated: 0 };
  }

  const supabase = getServiceClient();
  if (!supabase) {
    logger.error('[linkedin-sync] Supabase service client not configured — cannot sync.');
    return { ok: false, error: 'server_not_configured', synced: 0, created: 0, updated: 0 };
  }

  // --- single-flight lock ---
  const { data: acquired, error: lockErr } = await supabase.rpc('sync_try_acquire', {
    p_name: SYNC_NAME,
    p_holder: holder,
    p_stale_minutes: staleMinutes,
  });
  if (lockErr) {
    logger.error('[linkedin-sync] lock error:', lockErr.message);
    return { ok: false, error: 'lock_error', detail: lockErr.message, synced: 0, created: 0, updated: 0 };
  }
  if (acquired !== true) {
    logger.log('[linkedin-sync] another run holds the lock — skipping.');
    return { ok: true, skipped: 'locked', synced: 0, created: 0, updated: 0 };
  }

  const windowUsed = all ? null : Math.max(0, Math.floor(windowDays));
  let synced = 0;
  let created = 0;
  let updated = 0;
  // NOTE: `skippedRows` is a per-row COUNT (malformed rows skipped). It is
  // deliberately named differently from the run-level `skipped` REASON string
  // ('locked' / 'not_configured') that the early-return paths use, so the two
  // never collide.
  let skippedRows = 0;
  try {
    const rows = await readRows({ connectionString, viewName, windowDays, all });
    for (const row of rows) {
      // One malformed source row must NOT abort the whole run: skip + count it,
      // log, and keep ingesting the good rows.
      let item;
      try {
        item = mapRowToItem(row);
      } catch (rowErr) {
        skippedRows += 1;
        (logger.warn || logger.log).call(
          logger,
          `[linkedin-sync] skipping malformed row: ${rowErr?.detail || rowErr?.message || rowErr}`,
        );
        continue;
      }
      // autosync mode: never revert an owner-edited (locally_edited) row.
      const r = await ingest(item, { autosync: true });
      synced += 1;
      if (r && r.created) created += 1;
      else updated += 1;
    }
    await supabase.rpc('sync_finish', {
      p_name: SYNC_NAME,
      p_holder: holder,
      p_success: true,
      p_error: null,
      p_synced: synced,
      p_created: created,
      p_updated: updated,
      p_window_days: windowUsed,
    });
    logger.log(`[linkedin-sync] ok — synced=${synced} created=${created} updated=${updated} skippedRows=${skippedRows}`);
    return { ok: true, synced, created, updated, skippedRows };
  } catch (err) {
    const detail = String(err?.detail || err?.message || err).slice(0, 1000);
    const code = err?.code || 'sync_failed';
    // Fail safe: record the error + release the lock; never throw, never corrupt.
    // supabase-js rpc() returns { error } (it does not reject); a try/catch also
    // guards against a transport-level throw so this path can never re-throw.
    try {
      const fin = await supabase.rpc('sync_finish', {
        p_name: SYNC_NAME,
        p_holder: holder,
        p_success: false,
        p_error: `${code}: ${detail}`,
        p_synced: 0,
        p_created: 0,
        p_updated: 0,
        p_window_days: windowUsed,
      });
      if (fin.error) logger.error('[linkedin-sync] failed to record error state:', fin.error.message);
    } catch (e) {
      logger.error('[linkedin-sync] failed to record error state:', e?.message);
    }
    logger.error('[linkedin-sync] FAILED:', code, detail);
    return { ok: false, error: code, detail, synced: 0, created: 0, updated: 0 };
  }
}

// ---- health (dead-man's-switch surface) -------------------------------------
export async function getSyncHealth(name = SYNC_NAME) {
  const supabase = getServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('sync_state').select('*').eq('name', name).maybeSingle();
  if (error) return null;
  return data || null;
}

// A simple staleness verdict for display / alerting.
//   'unknown' — never synced yet
//   'error'   — the last run recorded an error
//   'stale'   — no successful run in over ~2 days (cron is daily on Hobby)
//   'ok'      — recent success, no error
export function syncStaleness(state, { now = Date.now } = {}) {
  if (!state || !state.last_success_at) {
    return { level: state && state.last_error ? 'error' : 'unknown', ageMs: null };
  }
  const ageMs = now() - new Date(state.last_success_at).getTime();
  const level = state.last_error ? 'error' : ageMs > 50 * 3600 * 1000 ? 'stale' : 'ok';
  return { level, ageMs };
}
