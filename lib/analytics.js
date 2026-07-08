// ============================================================
// lib/analytics.js — server-only helpers behind POST /api/analytics/view.
//
// Privacy stance (see PLATFORM.md): we log OUR OWN page views only, with NO
// PII. No raw IP or user-agent is ever stored. The IP is used transiently to
// (a) derive a per-IP rate-limit key that is HASHED with a server-side salt
// before it touches the DB, and (b) nothing else. A view row is just
// { content_id, kind:'view', path } — no visitor identity at all.
//
// Abuse controls layered here: DNT/GPC respect, a bot user-agent filter, a
// published-id whitelist, a per-IP burst limit (reusing the existing Postgres
// limiter), and a per-day dedupe cookie. Everything FAILS OPEN on a DB/limiter
// error (silently no-ops) so analytics can never break a page render, but
// FAILS CLOSED on abuse (over-limit -> 429, unknown id -> reject).
// ============================================================
import 'server-only';
import { createHash } from 'node:crypto';
import { getServiceClient } from './supabase/server.js';

// Per-IP burst guard for the view beacon. Generous enough for a real reader
// browsing several posts, tight enough to stop scripted inflation.
export const VIEW_LIMIT = 40;                 // max recorded checks per IP...
export const VIEW_WINDOW_MS = 10 * 60 * 1000; // ...per 10 minutes.
export const VIEW_ROUTE = 'analytics:view';

export const DEDUPE_COOKIE = 'av';
export const DEDUPE_MAX_AGE = 60 * 60 * 36;   // 36h (spans a day boundary)
const DEDUPE_CAP = 60;                        // ids remembered per day (bounds cookie size)

// Retention: bound analytics_event growth on the shared DB. The dashboard only
// looks back 30 days; keep a generous window and prune older rows opportunistically
// on write (same cheap, fail-open pattern as the auth limiter). A pg_cron job
// would be tidier but is deferred (see PLATFORM.md / migration 0009).
export const ANALYTICS_RETENTION_DAYS = 180;
const PRUNE_PROBABILITY = 0.02;               // ~1 in 50 writes triggers a prune

// Salt for the IP hash. Reuses an existing server-only secret — no new env var.
// SESSION_SECRET is preferred; SUPABASE_SERVICE_ROLE_KEY is the fallback and is
// always present wherever a view could actually be written.
function salt() {
  return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'analytics';
}

// One-way, salted, truncated hash of an IP — the rate-limiter key. Never
// reversible to the IP, never stored beyond the limiter ledger.
export function hashIp(ip) {
  return createHash('sha256').update(`${salt()}:ip:${ip || 'unknown'}`).digest('hex').slice(0, 40);
}

// Do-Not-Track / Global-Privacy-Control opt-out.
export function dntEnabled(headers) {
  return headers.get('dnt') === '1' || headers.get('sec-gpc') === '1';
}

// A deliberately broad bot/crawler/monitor/library UA filter. Also treats a
// missing/implausibly short UA as a bot (real browsers send long UAs).
const BOT_RE = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|whatsapp|telegrambot|embedly|quora link|pinterest|bingpreview|yandex|baiduspider|duckduck|headless|phantomjs|puppeteer|playwright|selenium|curl|wget|python-requests|python-urllib|aiohttp|okhttp|axios|node-fetch|got \(|go-http-client|libwww|java\/|httpclient|scrapy|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|dataforseo|screaming frog|preview|monitor|uptime|pingdom|lighthouse|gtmetrix|pagespeed/i;
export function isBot(ua) {
  if (typeof ua !== 'string' || ua.trim().length < 12) return true;
  return BOT_RE.test(ua);
}

// UTC day key for the dedupe cookie.
export function dayBucketUTC(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// Dedupe cookie value: "<YYYY-MM-DD>.<id>,<id>,...". A day change resets it.
export function parseDedupe(cookieVal) {
  const today = dayBucketUTC();
  if (typeof cookieVal !== 'string') return { ids: new Set() };
  const dot = cookieVal.indexOf('.');
  if (dot < 0) return { ids: new Set() };
  if (cookieVal.slice(0, dot) !== today) return { ids: new Set() };
  return { ids: new Set(cookieVal.slice(dot + 1).split(',').filter(Boolean)) };
}
export function serializeDedupe(ids) {
  const arr = Array.from(ids).slice(-DEDUPE_CAP);
  return `${dayBucketUTC()}.${arr.join(',')}`;
}
export function dedupeSetCookie(ids) {
  return `${DEDUPE_COOKIE}=${serializeDedupe(ids)}; Path=/; Max-Age=${DEDUPE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

// Whitelist: is `id` a real, published, non-deleted content row? Returns
// true/false, or null on DB-unconfigured/error so the caller can fail open.
// The caller MUST have validated `id` is a uuid first (uuid-typed column).
export async function isKnownPublishedId(id) {
  const supabase = getServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('content')
    .select('id')
    .eq('id', id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}

// Write at most one view row per (post, hashed visitor, UTC day). No PII: only
// a one-way SALTED hash of the IP + a day bucket are stored, never the raw IP or
// UA. Server-side dedupe is enforced by the UNIQUE index from migration 0009 —
// the upsert is ON CONFLICT DO NOTHING (ignoreDuplicates), so a cookie-less
// attacker replaying the same view collapses to the existing row. Returns
// { ok } / { ok:false } — the caller no-ops (fails open) on any falsy ok, and a
// deduped no-op is still ok:true (the intended state was reached).
export async function recordView({ contentId, path, ipHash, dayBucket }) {
  const supabase = getServiceClient();
  if (!supabase) return { ok: false, reason: 'unconfigured' };
  const { error } = await supabase
    .from('analytics_event')
    .upsert(
      {
        content_id: contentId,
        kind: 'view',
        path: typeof path === 'string' ? path.slice(0, 300) : null,
        ip_hash: ipHash || null,
        day_bucket: dayBucket || dayBucketUTC(),
      },
      { onConflict: 'content_id,ip_hash,day_bucket', ignoreDuplicates: true },
    );
  if (error) return { ok: false, reason: 'db_error' };

  // Opportunistic retention prune (fire-and-forget; never blocks or fails the
  // write). Bounds table growth without a scheduled job.
  if (Math.random() < PRUNE_PROBABILITY) {
    const cutoff = new Date(Date.now() - ANALYTICS_RETENTION_DAYS * 86400000).toISOString();
    supabase.from('analytics_event').delete().lt('created_at', cutoff).then(() => {}, () => {});
  }

  return { ok: true };
}
