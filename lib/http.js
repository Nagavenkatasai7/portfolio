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

// Best-effort client IP for the rate limiter (first hop of X-Forwarded-For).
export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
