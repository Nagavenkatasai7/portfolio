// ============================================================
// lib/auth/ratelimit.js — per-IP sliding-window limiter (Supabase table).
//
// Backed by the auth_rate_limit table (RLS-locked; service_role only). Simple
// count-in-window: if an IP has made >= LIMIT attempts on a route in the last
// WINDOW, it is blocked. Old rows are opportunistically pruned.
//
// Reused beyond auth: the public analytics view beacon (/api/analytics/view)
// calls this with its own { limit, windowMs } and a HASHED ip, sharing the
// exact same Postgres-limiter pattern — see lib/analytics.js. The `ip` argument
// is opaque to this module (auth passes a raw IP; analytics passes a salted
// hash so no raw IP is ever stored for it).
//
// NOTE (reported as a later upgrade): the team has an unconnected Upstash
// Redis resource which would be a better home for this than a Postgres table;
// not wired up in this phase.
//
// KNOWN RACE (finding #8, SKIPPED — needs migration): this counts-then-inserts,
// so a concurrent burst can each read count < limit before any inserts land and
// modestly overshoot the limit. A clean atomic fix (insert-first + a
// unique-constraint / a Postgres function that counts-and-inserts in one
// statement) requires a DB migration, which this change set intentionally avoids
// (the code must run against the CURRENT schema on deploy). An insert-first-only
// tweak was rejected because it changes the AUTH limiter's block-duration
// semantics (every denied attempt would also insert, auto-extending the block).
// Low severity; left as-is to avoid any risk to the auth limiter.
// ============================================================
import 'server-only';
import { getServiceClient } from '../supabase/server.js';

const LIMIT = 10; // default max attempts...
const WINDOW_MS = 15 * 60 * 1000; // ...per 15 minutes, per IP+route.

// Returns { allowed, remaining }. Fails OPEN only when Supabase is entirely
// unconfigured (there is nothing to record against); when configured but the
// query errors, it fails CLOSED (allowed=false) so an outage can't disable the
// limiter silently. `opts` lets a caller override the window/limit; the auth
// callers pass none, so their behavior is unchanged.
export async function checkAndRecord(ip, route, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : LIMIT;
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : WINDOW_MS;

  const supabase = getServiceClient();
  if (!supabase) return { allowed: true, remaining: limit, unconfigured: true };

  const since = new Date(Date.now() - windowMs).toISOString();

  const { count, error: countErr } = await supabase
    .from('auth_rate_limit')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('route', route)
    .gte('created_at', since);

  if (countErr) return { allowed: false, remaining: 0, error: true };
  if ((count ?? 0) >= limit) return { allowed: false, remaining: 0 };

  const { error: insErr } = await supabase
    .from('auth_rate_limit')
    .insert({ ip, route });
  if (insErr) return { allowed: false, remaining: 0, error: true };

  // Opportunistic prune of expired rows (ignore result).
  supabase.from('auth_rate_limit').delete().lt('created_at', since).then(() => {}, () => {});

  return { allowed: true, remaining: Math.max(0, limit - (count ?? 0) - 1) };
}
