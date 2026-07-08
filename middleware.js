// Content-Security-Policy for the new APP HTML routes (/blog, /admin). Scoped
// by the matcher below so it NEVER touches the legacy static site at "/"
// (served from public/ via a rewrite) or its vercel.json headers. Non-page
// routes (/api) get their headers from next.config.mjs.
//
// Two CSP profiles, because nonce-based CSP is fundamentally incompatible with
// STATIC prerendering (a nonce must be per-request; static HTML is baked once):
//
//   * /admin/*  — DYNAMIC (force-dynamic). Gets a strict nonce + 'strict-dynamic'
//     script policy; Next stamps the per-request nonce onto every script it
//     emits (verified: header nonce === page nonce). No 'unsafe-inline' scripts.
//
//   * /blog     — STATIC + ISR. A per-request nonce can't be baked into the
//     prerendered scripts, so it uses script-src 'self' 'unsafe-inline'. This
//     is a deliberate, documented compromise; /blog reflects no unsanitized
//     input (markdown bodies are sanitized server-side, so no inline <script>
//     survives), so inline-script injection is not a vector here.
//
// style-src keeps 'unsafe-inline' on both (inline <style> design tokens + Next's
// injected styles); styles are far lower risk than scripts.
import { NextResponse } from 'next/server';

const COMMON = [
  "default-src 'self'",
  "base-uri 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
];

export function middleware(request) {
  const isBlog = request.nextUrl.pathname.startsWith('/blog');

  let nonce = '';
  let scriptSrc;
  if (isBlog) {
    // Static page: host + inline (no per-request nonce possible).
    scriptSrc = "script-src 'self' 'unsafe-inline'";
  } else {
    // Dynamic /admin: strict nonce policy.
    nonce = btoa(crypto.randomUUID());
    scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  }

  const csp = [scriptSrc, ...COMMON].join('; ');

  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    // Hand the nonce to Next so it stamps its inline/bootstrap scripts.
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('content-security-policy', csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('x-frame-options', 'DENY');
  return response;
}

export const config = {
  // Only the new app HTML surfaces. Legacy "/", static assets and /api excluded.
  matcher: ['/blog', '/blog/:path*', '/admin', '/admin/:path*'],
};
