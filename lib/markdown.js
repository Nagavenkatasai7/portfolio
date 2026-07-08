// ============================================================
// lib/markdown.js — render markdown to SANITIZED html, server-side.
//
// marked turns markdown into HTML, then sanitize-html enforces a strict
// allowlist: a small set of formatting tags only. No raw-HTML passthrough,
// no event handlers, no script/iframe/svg/style, http(s)/mailto links only.
// Call only from server components.
// ============================================================
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'strong', 'em', 'b', 'i', 'del',
  'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4',
  'a',
];

const SANITIZE_OPTS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    // rel/target are added by transformTags below; they must be allow-listed
    // here or sanitize-html strips them right back off.
    a: ['href', 'rel', 'target'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  // No data:, no relative-scheme surprises.
  allowProtocolRelative: false,
  // Force safe rel + new-tab on every surviving link.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, rel: 'nofollow noopener noreferrer', target: '_blank' },
    }),
  },
  // Anything not in the allowlist (script/iframe/svg/style/img/on*) is dropped,
  // text preserved.
  disallowedTagsMode: 'discard',
};

export function renderMarkdown(md) {
  if (typeof md !== 'string' || !md.trim()) return '';
  const rawHtml = marked.parse(md, { gfm: true, breaks: false, async: false });
  return sanitizeHtml(rawHtml, SANITIZE_OPTS);
}
