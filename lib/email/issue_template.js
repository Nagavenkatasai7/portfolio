// ============================================================
// lib/email/issue_template.js — render one Field Guide ISSUE email (Phase N2).
//
// Turns a `content` row (type 'newsletter') + its newsletter_issue_meta into an
// email-safe HTML document + a plain-text twin, consistent with N1's
// confirmation email: a 600px table layout, dark header card with the lime
// "FIELD GUIDE" wordmark, inline styles only (no external CSS / web fonts), and
// a footer with a read-in-browser link + a PER-RECIPIENT unsubscribe link.
//
// The body comes from the content's markdown, run through the SAME sanitized
// pipeline the public /blog uses (lib/markdown.js: marked -> sanitize-html strict
// allowlist), then given inline styles so it renders in Gmail / Outlook / Apple
// Mail. Because sanitize-html has already reduced the body to a small, known,
// allow-listed tag set, inlineEmailStyles only DECORATES those exact tags — it
// never reintroduces raw HTML, so the XSS guarantee is preserved.
//
// Split so a batch renders the EXPENSIVE part once: prepareIssueContent() does
// the markdown->HTML/text conversion a single time per issue; renderIssueEmail()
// then cheaply assembles the final per-recipient document (only the unsub link
// differs between recipients).
//
// NOT server-only: pure rendering, no secrets / no DB — so the verify script can
// import and exercise it directly.
// ============================================================
import { renderMarkdown } from '../markdown.js';

// Escape a value for safe interpolation into HTML text/attributes.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Decorate the (already-sanitized, allow-listed) body tags with inline styles so
// the email renders without external CSS. Only opening tags of the known set are
// touched; text and structure are untouched.
function inlineEmailStyles(html) {
  if (!html) return '';
  const P = 'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;';
  const S = 'font-family:Georgia,\'Times New Roman\',serif;';
  const M = "font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;";
  const repl = [
    [/<h1>/g, `<h1 style="${S}font-size:26px;line-height:1.15;font-weight:700;color:#171411;margin:26px 0 12px;">`],
    [/<h2>/g, `<h2 style="${S}font-size:21px;line-height:1.2;font-weight:700;color:#171411;margin:24px 0 10px;">`],
    [/<h3>/g, `<h3 style="${S}font-size:18px;line-height:1.25;font-weight:700;color:#171411;margin:20px 0 8px;">`],
    [/<h4>/g, `<h4 style="${P}font-size:16px;font-weight:800;color:#171411;margin:18px 0 6px;">`],
    [/<p>/g, `<p style="${P}font-size:16px;line-height:1.65;color:#2c2721;margin:0 0 16px;">`],
    [/<ul>/g, `<ul style="${P}font-size:16px;line-height:1.65;color:#2c2721;margin:0 0 16px;padding-left:24px;">`],
    [/<ol>/g, `<ol style="${P}font-size:16px;line-height:1.65;color:#2c2721;margin:0 0 16px;padding-left:24px;">`],
    [/<li>/g, '<li style="margin:0 0 6px;">'],
    [/<blockquote>/g, `<blockquote style="${P}font-size:16px;line-height:1.6;color:#5c554d;margin:0 0 16px;padding:4px 0 4px 18px;border-left:3px solid #caff60;font-style:italic;">`],
    [/<pre>/g, `<pre style="${M}font-size:13px;line-height:1.5;color:#171411;background:#f3ead8;border:1px solid #ddceb8;border-radius:8px;padding:14px 16px;margin:0 0 16px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;">`],
    [/<code>/g, `<code style="${M}font-size:13px;background:#f3ead8;border-radius:4px;padding:1px 5px;">`],
    [/<hr\s*\/?>/g, '<hr style="border:none;border-top:1px solid #ddceb8;margin:26px 0;">'],
    // <a ...> already carries href/rel/target from the sanitizer; inject style.
    [/<a href/g, '<a style="color:#6e4d7d;text-decoration:underline;" href'],
  ];
  let out = html;
  for (const [re, s] of repl) out = out.replace(re, s);
  return out;
}

// A lightweight markdown -> plain-text twin (no external dep). Reduces the most
// common markdown to readable text; links become "text (url)".
export function markdownToText(md) {
  if (typeof md !== 'string' || !md.trim()) return '';
  let t = md;
  t = t.replace(/```[\s\S]*?```/g, (b) => b.replace(/```/g, '').trim()); // fenced code -> its body
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');                        // images -> alt
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');                  // links -> text (url)
  t = t.replace(/^#{1,6}\s+/gm, '');                                     // headings
  t = t.replace(/^\s{0,3}>\s?/gm, '');                                   // blockquotes
  t = t.replace(/^\s*[-*+]\s+/gm, '- ');                                 // bullet lists
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');                              // bold
  t = t.replace(/(\*|_)(.*?)\1/g, '$2');                                 // italic
  t = t.replace(/`([^`]+)`/g, '$1');                                     // inline code
  t = t.replace(/\n{3,}/g, '\n\n');                                      // collapse blank runs
  return t.trim();
}

// Render the EXPENSIVE, recipient-independent parts of an issue exactly once.
// Returns { bodyHtml, bodyText }.
export function prepareIssueContent(content) {
  const md = typeof content?.body_md === 'string' ? content.body_md : '';
  const bodyHtml = inlineEmailStyles(renderMarkdown(md));
  const bodyText = markdownToText(md);
  return { bodyHtml, bodyText };
}

const WORDMARK_HEADER = `
        <tr>
          <td style="background:#171411; padding:22px 32px;">
            <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace; font-size:12px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;">
              <span style="color:#caff60;">The Field Guide</span><span style="color:#8a8078;">&nbsp;&middot;&nbsp;Every Tuesday</span>
            </div>
          </td>
        </tr>`;

// Assemble the final per-recipient email. Pass `prepared` from
// prepareIssueContent(content) to avoid re-rendering markdown per recipient.
// `test:true` prefixes the subject with [TEST]. Returns
// { subject, html, text, headers } — headers carry the per-recipient
// List-Unsubscribe (URL) + RFC 8058 one-click List-Unsubscribe-Post.
export function renderIssueEmail({
  content,
  meta,
  prepared,
  unsubUrl,
  readInBrowserUrl,
  test = false,
} = {}) {
  const p = prepared || prepareIssueContent(content || {});
  const subjectBase = (meta?.subject || content?.title || 'The Field Guide').toString();
  const subject = `${test ? '[TEST] ' : ''}${subjectBase}`;
  const preheader = meta?.preheader ? String(meta.preheader) : '';
  const hero = meta?.hero_image_url && /^https:\/\//i.test(meta.hero_image_url) ? meta.hero_image_url : '';
  const heroAlt = esc(subjectBase);
  const browse = readInBrowserUrl ? esc(readInBrowserUrl) : '';
  const uu = unsubUrl ? esc(unsubUrl) : '';
  const postal = process.env.NEWSLETTER_POSTAL_ADDRESS ? String(process.env.NEWSLETTER_POSTAL_ADDRESS) : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#f3ead8; -webkit-text-size-adjust:100%;">
${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#f3ead8; font-size:1px; line-height:1px;">${esc(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3ead8;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:100%; background:#fffdf7; border:1px solid #ddceb8; border-radius:12px; overflow:hidden;">
${WORDMARK_HEADER}
        <tr>
          <td style="padding:34px 32px 4px 32px;">
            <h1 style="margin:0 0 18px 0; font-family:Georgia,'Times New Roman',serif; font-size:30px; line-height:1.12; font-weight:700; color:#171411;">${esc(subjectBase)}</h1>
          </td>
        </tr>
${hero ? `        <tr>
          <td style="padding:0 32px 8px 32px;">
            <img src="${esc(hero)}" alt="${heroAlt}" width="536" style="display:block; width:100%; max-width:536px; height:auto; border:1px solid #ddceb8; border-radius:8px;">
          </td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 32px 8px 32px;">
            ${p.bodyHtml || '<p style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif; font-size:16px; color:#2c2721;">(no content)</p>'}
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #ddceb8; padding:22px 32px 28px 32px;">
            <p style="margin:0 0 8px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#8a8078;">
              <strong>The Field Guide</strong> &middot; by Naga Venkata Sai Chennu${browse ? ` &middot; <a href="${browse}" style="color:#8a8078; text-decoration:underline;">Read in browser</a>` : ''}
            </p>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#8a8078;">
              ${uu ? `<a href="${uu}" style="color:#8a8078; text-decoration:underline;">Unsubscribe</a>` : 'Unsubscribe link unavailable'}${postal ? ` &middot; ${esc(postal)}` : ''}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textParts = [
    'THE FIELD GUIDE — Every Tuesday',
    '',
    subjectBase,
    '',
    p.bodyText || '(no content)',
    '',
    '—',
    'The Field Guide · by Naga Venkata Sai Chennu',
  ];
  if (browse) textParts.push(`Read in browser: ${readInBrowserUrl}`);
  textParts.push(uu ? `Unsubscribe: ${unsubUrl}` : 'Unsubscribe link unavailable');
  if (postal) textParts.push(postal);
  const text = textParts.join('\n');

  const headers = {};
  if (unsubUrl) {
    headers['List-Unsubscribe'] = `<${unsubUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  return { subject, html, text, headers };
}
