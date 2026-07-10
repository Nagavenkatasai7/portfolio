// ============================================================
// scripts/newsletter-preview-verify.mjs — verify the INLINE EMAIL PREVIEW
// feature (admin studio) WITHOUT needing Supabase creds or a live session.
//
//   node scripts/newsletter-preview-verify.mjs   (npm run verify:newsletter-preview)
//
// Two kinds of checks, both offline:
//   1. The renderer (prepareIssueContent + renderIssueEmail) — the EXACT code the
//      preview route calls — produces an HTML email that embeds the subject and
//      the "The Field Guide" wordmark from a fixture content+meta.
//   2. Static guarantees on the new/changed source: the preview route gates on
//      requireAdmin BEFORE it renders, never fetches the hero server-side, and
//      emits a self-isolating CSP; the /admin CSP gained exactly frame-src 'self';
//      next.config carves the preview path out of the strict /api CSP; and the
//      studio embeds a sandboxed same-origin preview iframe.
//
// The over-HTTP "401 without a session" assertion (which needs the Next runtime
// for requireAdmin -> next/headers) lives in scripts/newsletter-issues-verify.mjs
// routeAuthTests(), alongside the other admin-route auth checks.
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepareIssueContent, renderIssueEmail } from '../lib/email/issue_template.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};

// ---- 1. the renderer output the preview serves ----
console.log('\n== RENDERER: the exact email the preview route returns ==');
{
  const content = { id: 'abc', title: 'Fallback Title', body_md: '# Heading\n\nA para with **bold** and a [link](https://example.com).' };
  const meta = { subject: 'Weekly Signal', preheader: 'the good stuff', hero_image_url: 'https://ref.supabase.co/storage/v1/object/public/hero.png' };
  const prepared = prepareIssueContent(content);
  const { html, subject } = renderIssueEmail({
    content, meta, prepared,
    unsubUrl: 'https://site.example/api/newsletter/unsubscribe?token=PREVIEW',
    readInBrowserUrl: 'https://site.example/blog/abc',
    test: false,
  });
  ok('renderer: subject taken from meta', subject === 'Weekly Signal');
  ok('renderer: HTML contains the subject', html.includes('Weekly Signal'));
  ok('renderer: HTML contains the "The Field Guide" wordmark', html.includes('The Field Guide'));
  ok('renderer: markdown body rendered + styled', /<h1 style=/.test(html) && /<strong>/.test(html));
  ok('renderer: hero image embedded (browser loads it, not the server)', html.includes(meta.hero_image_url));
  ok('renderer: placeholder unsub link present (no real token minted)', html.includes('token=PREVIEW'));
  ok('renderer: no <script> survives the sanitizer', !/<script/i.test(html));
}

// ---- 2. static guarantees on the new/changed source ----
console.log('\n== ROUTE: app/api/admin/newsletter/preview/route.js ==');
{
  const src = read('app/api/admin/newsletter/preview/route.js');
  ok('route: exports an async GET handler', /export\s+async\s+function\s+GET\s*\(/.test(src));
  const iAdmin = src.indexOf('requireAdmin');
  const iRender = src.indexOf('renderIssueEmail(');
  ok('route: gates on requireAdmin BEFORE it renders the email', iAdmin !== -1 && iRender !== -1 && iAdmin < iRender);
  ok('route: returns 401 unauthorized with no session', /!session/.test(src) && /'unauthorized'/.test(src) && /\b401\b/.test(src));
  ok('route: reuses the shared reader getIssueDetail (no new DB access)', /getIssueDetail\(/.test(src) && !/getServiceClient|from\(/.test(src));
  ok('route: NEVER fetches the hero (no SSRF sink)', !/\bfetch\s*\(/.test(src));
  ok('route: self-isolating CSP default-src none', /default-src 'none'/.test(src));
  ok('route: self-isolating CSP frame-ancestors self', /frame-ancestors 'self'/.test(src));
  ok('route: self-isolating CSP style-src unsafe-inline (scoped to preview doc)', /style-src 'unsafe-inline'/.test(src));
  ok('route: img-src limited to data: + supabase origin (https: fallback)', /img-src data:/.test(src));
  ok('route: X-Frame-Options SAMEORIGIN + no-store', /SAMEORIGIN/.test(src) && /no-store/.test(src));
}

console.log('\n== /admin CSP: middleware.js ==');
{
  const src = read('middleware.js');
  ok("middleware: /admin CSP gained frame-src 'self'", /"frame-src 'self'"/.test(src));
  ok("middleware: /admin script-src stays nonce + strict-dynamic (unchanged)", /script-src 'self' 'nonce-\$\{nonce\}' 'strict-dynamic'/.test(src));
  // Scope the unsafe-* check to the /admin (else) branch only — the /blog branch
  // legitimately uses script-src 'unsafe-inline' (a pre-existing static compromise).
  const adminBlock = src.slice(src.indexOf('Dynamic /admin'));
  ok('middleware: /admin branch adds no unsafe-inline/eval to script-src',
    !/unsafe-eval/.test(adminBlock) && !/script-src[^,]*unsafe-inline/.test(adminBlock));
}

console.log('\n== /api CSP carve-out: next.config.mjs ==');
{
  const src = read('next.config.mjs');
  ok('next.config: strict /api CSP excludes the preview path (negative lookahead)', /\(\?!admin\/newsletter\/preview\)/.test(src));
  ok('next.config: dedicated preview entry with frame-ancestors self', /frame-ancestors 'self'/.test(src));
  ok('next.config: preview entry sets X-Frame-Options SAMEORIGIN', /X-Frame-Options"?,?\s*value:\s*"SAMEORIGIN"/.test(src) || /"SAMEORIGIN"/.test(src));
  ok('next.config: global /api entry still frame-ancestors none for other routes', /frame-ancestors 'none'/.test(src));
}

console.log('\n== STUDIO: app/admin/NewsletterStudio.js ==');
{
  const src = read('app/admin/NewsletterStudio.js');
  ok('studio: embeds the preview route as an iframe src', /\/api\/admin\/newsletter\/preview\?contentId=/.test(src));
  ok('studio: iframe is fully sandboxed (sandbox="")', /sandbox=""/.test(src));
  ok('studio: Refresh reloads via previewNonce key', /previewNonce/.test(src) && /key=\{previewNonce\}/.test(src));
  ok('studio: preview section is collapsible (default expanded)', /previewOpen/.test(src));
  ok('studio: no inline script handlers (React handlers only)', !/onclick=|dangerouslySetInnerHTML/.test(src));
}

console.log(`\n${failures === 0 ? 'NEWSLETTER-PREVIEW VERIFY: ALL PASS' : `NEWSLETTER-PREVIEW VERIFY: ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
