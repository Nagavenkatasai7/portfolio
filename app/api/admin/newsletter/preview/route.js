// GET /api/admin/newsletter/preview?contentId=<uuid> — an admin-only, inline
// render of the EXACT email an issue would send, so the studio can embed it in a
// same-origin <iframe> without first firing a test send (Phase N3+).
//
// Read-only: it reuses the SAME service-role reader the issues route uses
// (getIssueDetail) and the SAME renderer the sender uses (prepareIssueContent +
// renderIssueEmail), so what the admin sees here is byte-for-byte what a
// recipient would get (minus the per-recipient unsubscribe token, which is a
// harmless PREVIEW placeholder). It never mutates anything and never sends.
//
// SECURITY — this response is an isolated HTML document meant to be framed by
// /admin only:
//   * The hero image is loaded by the BROWSER inside the sandboxed iframe, never
//     fetched server-side (the admin-set URL is untrusted — no SSRF sink here).
//   * The email body was already sanitized (renderMarkdown → sanitize-html strict
//     allowlist) and renderIssueEmail only decorates allow-listed tags, so there
//     is no script surface; default-src 'none' in the response CSP blocks scripts
//     regardless, and style-src 'unsafe-inline' is scoped to THIS document only.
//   * Because Next applies next.config.mjs `headers()` OVER a Route Handler's own
//     Response headers for /api paths, the AUTHORITATIVE isolating CSP + framing
//     headers for this exact path live in next.config.mjs (which excludes this
//     path from the global strict /api CSP and re-asserts the isolating one). We
//     ALSO set them here so the handler is self-documenting and correct on its
//     own; the two sets are identical, so whichever wins yields the same result.
import { requireAdmin } from '@/lib/auth/session';
import { json } from '@/lib/http';
import { originFromHeaders } from '@/lib/site';
import { getIssueDetail, IssueError } from '@/lib/newsletter_issues';
import { prepareIssueContent, renderIssueEmail } from '@/lib/email/issue_template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Scheme+host the browser may load the hero <img> from inside the iframe. Read
// from the server env (falls back to the NEXT_PUBLIC alias), mirroring
// middleware.js. Empty when underivable — the caller then falls back to https:.
function supabaseOrigin() {
  const raw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  try { return raw ? new URL(raw).origin : ''; } catch { return ''; }
}

// The self-isolating response CSP for the framed preview document. Permits ONLY
// the email's inline styles + data:/Supabase-hosted hero images, and allows the
// same-origin /admin page (frame-ancestors 'self') to embed it. Never affects the
// /admin app's own CSP.
function previewCsp() {
  const sb = supabaseOrigin();
  return [
    "default-src 'none'",
    `img-src data: ${sb || 'https:'}`,
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

// Common security headers for the isolated HTML responses (200 + the 404 page).
function htmlHeaders() {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': previewCsp(),
    'x-frame-options': 'SAMEORIGIN',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  };
}

function notFound() {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Issue not found</title></head>`
    + `<body style="margin:0;padding:40px;background:#f3ead8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#756b62;">`
    + `<p style="font-size:15px;">Issue not found.</p></body></html>`;
  return new Response(body, { status: 404, headers: htmlHeaders() });
}

export async function GET(request) {
  // Admin gate FIRST — identical to issues/route.js. No same-origin check: this
  // is a non-mutating GET the admin's iframe navigates to.
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);

  const contentId = new URL(request.url).searchParams.get('contentId') || '';
  // Lenient shape check (the DB query is parameterized either way); anything
  // obviously not an id is treated as "not found" rather than hitting the DB.
  if (!contentId || contentId.length > 128) return notFound();

  let detail;
  try {
    detail = await getIssueDetail(contentId);
  } catch (err) {
    if (err instanceof IssueError && err.code === 'server_not_configured') {
      return json({ error: 'server_not_configured' }, 503);
    }
    // A malformed id (bad uuid) or transient read error: don't leak a 500 into
    // the iframe — show the same isolated "not found" page.
    return notFound();
  }
  if (!detail || !detail.meta || !detail.content) return notFound();

  const { content, meta } = detail;
  const prepared = prepareIssueContent(content);
  const origin = originFromHeaders(request.headers);
  const absoluteUrl = (p) => `${origin}${p}`;

  const { html } = renderIssueEmail({
    content,
    meta: {
      subject: meta.subject,
      preheader: meta.preheader,
      hero_image_url: meta.hero_image_url,
    },
    prepared,
    // A preview uses a harmless placeholder unsubscribe token — we never mint or
    // rotate a real subscriber token for a preview.
    unsubUrl: absoluteUrl('/api/newsletter/unsubscribe?token=PREVIEW'),
    readInBrowserUrl: absoluteUrl(`/blog/${contentId}`),
    test: false,
  });

  return new Response(html, { headers: htmlHeaders() });
}
