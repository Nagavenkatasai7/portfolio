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
//
// NOTE (finding #6, deliberately SKIPPED — auth-risk): pinning an allowlist of
// expected hosts here (instead of trusting x-forwarded-host) was considered but
// NOT done — OAuth login + same-origin admin POSTs run on dynamic Vercel preview
// hosts (`*.vercel.app`, per-deployment subdomains) that can't be provably
// enumerated, so an allowlist risks locking out legitimate preview/login flows.
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
// spoof it. Only if it is absent do we fall back to the RIGHTMOST hop of
// X-Forwarded-For — the entry appended by the closest trusted proxy. The
// LEFTMOST hop is the ORIGINAL, fully client-controllable value, so keying the
// limiter on it would let an attacker prepend a rotating fake IP to mint a fresh
// bucket per request; the rightmost entry is the least attacker-influenced one
// available. On Vercel x-real-ip is always present, so this fallback is only
// reached off-platform (local/dev), where behavior is otherwise unchanged.
export function clientIp(request) {
  const real = request.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}
