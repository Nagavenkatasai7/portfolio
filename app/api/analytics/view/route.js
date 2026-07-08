// POST /api/analytics/view — public, privacy-friendly page-view beacon.
//
// Called by a tiny inline script on /blog/[id]. Records ONE row per (visitor,
// post, UTC-day) in analytics_event, with NO PII. Order of checks is chosen so
// that abuse fails CLOSED (over-limit -> 429, unknown/malformed id -> reject,
// cross-site -> 403) while any infrastructure hiccup fails OPEN (204 no-op) so
// it can never break the page it is measuring. See lib/analytics.js.
import { json, clientIp, isSameOrigin } from '@/lib/http';
import { checkAndRecord } from '@/lib/auth/ratelimit';
import { isUuid } from '@/lib/post';
import {
  hashIp, isBot, dntEnabled, isKnownPublishedId, recordView,
  parseDedupe, dedupeSetCookie, DEDUPE_COOKIE, VIEW_ROUTE, VIEW_LIMIT, VIEW_WINDOW_MS,
} from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noop = () => new Response(null, { status: 204 });

export async function POST(request) {
  // 1. Respect Do-Not-Track / Global-Privacy-Control — silently no-op.
  if (dntEnabled(request.headers)) return noop();

  // 2. Drop obvious bots / crawlers / missing-UA clients.
  if (isBot(request.headers.get('user-agent') || '')) return noop();

  // 3. If an Origin is present it must be same-origin (blocks trivial
  //    cross-site inflation). A missing Origin is allowed — some privacy modes
  //    strip it — because the id whitelist + rate limit still gate the write.
  if (request.headers.get('origin') && !isSameOrigin(request)) {
    return json({ error: 'bad_origin' }, 403);
  }

  // 4. Parse + validate the payload: a known content id is the ONLY thing we
  //    accept. Malformed -> reject.
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const id = body?.id;
  const path = typeof body?.path === 'string' ? body.path : null;
  if (!isUuid(id)) return json({ error: 'invalid_id' }, 400);

  // 5. Per-IP burst limit, keyed on a SALTED HASH of the IP (no raw IP stored).
  //    Over-limit fails closed (429). A limiter error fails open (no-op).
  const rl = await checkAndRecord(hashIp(clientIp(request)), VIEW_ROUTE, { limit: VIEW_LIMIT, windowMs: VIEW_WINDOW_MS });
  if (rl.error) return noop();
  if (!rl.allowed && !rl.unconfigured) return json({ error: 'rate_limited' }, 429);

  // 6. Whitelist: reject anything that is not a real published post.
  const known = await isKnownPublishedId(id);
  if (known === false) return json({ error: 'unknown_id' }, 404);
  if (known === null) return noop(); // DB unconfigured/error -> fail open

  // 7. Dedupe per (visitor, post, day) via a short httpOnly cookie.
  const { ids } = parseDedupe(request.cookies.get(DEDUPE_COOKIE)?.value);
  if (ids.has(id)) return json({ ok: true, deduped: true }, 200);

  // 8. Record exactly one row; fail open if the write hiccups.
  const rec = await recordView({ contentId: id, path: path || `/blog/${id}` });
  if (!rec.ok) return noop();

  ids.add(id);
  const res = json({ ok: true }, 200);
  res.headers.append('Set-Cookie', dedupeSetCookie(ids));
  return res;
}

// Only POST is meaningful; make anything else explicit.
export function GET() { return json({ error: 'method_not_allowed' }, 405); }
