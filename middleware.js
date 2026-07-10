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
//     connect-src is widened to the Supabase origin so the composer can upload
//     media DIRECTLY to Supabase Storage (presigned, direct-to-storage); img/
//     media-src allow blob: for local pre-upload previews.
//
//   * /blog     — STATIC + ISR. A per-request nonce can't be baked into the
//     prerendered scripts, so it uses script-src 'self' 'unsafe-inline'. This
//     is a deliberate, documented compromise; /blog reflects no unsanitized
//     input (markdown bodies are sanitized server-side, so no inline <script>
//     survives). frame-src is opened to exactly the two privacy-friendly video
//     embed hosts (youtube-nocookie, player.vimeo) that the controlled
//     VideoEmbed component renders; media-src allows https for direct <video>.
//
// style-src keeps 'unsafe-inline' on both (inline <style> design tokens + Next's
// injected styles); styles are far lower risk than scripts.
import { NextResponse } from 'next/server';

// The Supabase origin (scheme + host) the browser uploads media to. Read at
// build time from the server env; falls back to the NEXT_PUBLIC alias.
function supabaseOrigin() {
  const raw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  try { return raw ? new URL(raw).origin : ''; } catch { return ''; }
}

const VIDEO_FRAME_HOSTS = 'https://www.youtube-nocookie.com https://player.vimeo.com';

export function middleware(request) {
  const isBlog = request.nextUrl.pathname.startsWith('/blog');

  let nonce = '';
  let directives;

  if (isBlog) {
    // Static page: host + inline scripts (no per-request nonce possible), plus
    // the controlled video embed hosts.
    directives = [
      "default-src 'self'",
      "base-uri 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "media-src 'self' https:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      `frame-src ${VIDEO_FRAME_HOSTS}`,
      "form-action 'self'",
    ];
  } else {
    // Dynamic /admin: strict nonce policy + Supabase upload origin.
    nonce = btoa(crypto.randomUUID());
    const sb = supabaseOrigin();
    directives = [
      "default-src 'self'",
      "base-uri 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "media-src 'self' https: blob:",
      "font-src 'self'",
      `connect-src 'self'${sb ? ` ${sb}` : ''}`,
      "object-src 'none'",
      // Let the studio embed the SAME-ORIGIN inline email-preview iframe
      // (/api/admin/newsletter/preview). Only 'self' — no third-party frames.
      "frame-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ];
  }

  const csp = directives.join('; ');

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
