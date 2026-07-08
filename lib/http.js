// ============================================================
// lib/http.js — tiny request/response helpers shared by the API routes.
// ============================================================
import 'server-only';

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// Build this deployment's own origin, honoring the Vercel proxy headers so the
// OAuth redirect_uri matches the URL the browser actually used.
export function originFromRequest(request) {
  const h = request.headers;
  const proto = h.get('x-forwarded-proto') || request.nextUrl?.protocol?.replace(':', '') || 'https';
  const host = h.get('x-forwarded-host') || h.get('host') || request.nextUrl?.host || '';
  return `${proto}://${host}`;
}

// CSRF defense for mutating routes: the request's Origin must be present and
// match this deployment's host. Combined with sameSite=strict cookies this
// blocks cross-site form/fetch submissions.
export function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return originHost === host;
}

// Best-effort client IP for the rate limiter. Prefer `x-real-ip`, which Vercel
// sets to the true edge peer and OVERWRITES on every request — a client cannot
// spoof it. Only if it is absent do we fall back to the LEFTMOST hop of
// X-Forwarded-For (which IS client-controllable, so it is the weaker source and
// must never be the primary rate-limit key — otherwise an attacker rotates the
// leftmost XFF to get a fresh limit bucket per request).
export function clientIp(request) {
  const real = request.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}
