// ============================================================
// lib/site.js — the deployment's own base URL, for absolute SEO/syndication
// URLs (canonical, Open Graph, sitemap, RSS <link>/<guid>).
//
// No NEW required env var: it prefers an OPTIONAL NEXT_PUBLIC_SITE_URL (set it
// to the apex domain for the nicest canonical), then Vercel's auto-injected
// system vars, then localhost. Where a Request is available (RSS route) the
// caller can derive the exact origin the browser used instead — see
// originFromHeaders.
// ============================================================

function stripSlash(u) {
  return String(u || '').replace(/\/+$/, '');
}

// Build-/run-time base URL from env only (no request in scope).
export function siteBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripSlash(explicit);
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${stripSlash(prod)}`;
  const vurl = process.env.VERCEL_URL;
  if (vurl) return `https://${stripSlash(vurl)}`;
  return 'http://localhost:3000';
}

// Exact origin the browser used, honoring the Vercel proxy headers. Falls back
// to siteBaseUrl() when the host header is absent. `headers` is a Headers-like
// object (request.headers).
export function originFromHeaders(headers) {
  try {
    const proto = headers.get('x-forwarded-proto') || 'https';
    const host = headers.get('x-forwarded-host') || headers.get('host') || '';
    if (host) return `${proto}://${host}`;
  } catch { /* fall through */ }
  return siteBaseUrl();
}

// A sensible default social-share image that already ships in public/.
export const DEFAULT_OG_IMAGE = '/profile.png';
export const SITE_AUTHOR = 'Naga Venkata Sai Chennu';
