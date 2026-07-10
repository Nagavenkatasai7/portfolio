// ============================================================
// lib/post.js — PURE presentation helpers for a content row.
//
// No DB, no server-only, no secrets: shared by /blog (feed), /blog/[id]
// (per-post page + SEO), the sitemap, and the verification
// script — so a post's public path, title and meta description are derived
// ONE way everywhere and can never drift apart.
// ============================================================

// The public permalink path for a content row. Keyed on the immutable uuid
// (not a title-slug) so it is stable across edits and well-defined for EVERY
// content type (an X post or image has no title-slug). The same id is the
// analytics whitelist key, so path and analytics always agree.
export function postPath(id) {
  return `/blog/${id}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Strip markdown / stray HTML down to a single line of plain text, for meta
// descriptions. Intentionally lightweight (no marked
// import) — it only needs to be readable, not a full renderer.
export function plainText(md) {
  if (typeof md !== 'string') return '';
  let s = md;
  s = s.replace(/```[\s\S]*?```/g, ' ');       // fenced code
  s = s.replace(/~~~[\s\S]*?~~~/g, ' ');
  s = s.replace(/`[^`]*`/g, ' ');               // inline code
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // images -> alt
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');  // links -> text
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');      // headings
  s = s.replace(/^\s{0,3}>\s?/gm, '');           // blockquotes
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, '');       // bullet markers
  s = s.replace(/^\s{0,3}\d+[.)]\s+/gm, '');     // ordered markers
  s = s.replace(/(\*\*|__|\*|_|~~)/g, '');       // emphasis markers
  s = s.replace(/<[^>]+>/g, ' ');                // stray tags (defensive)
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Truncate to <= max chars on a word boundary, with an ellipsis.
export function truncate(s, max = 160) {
  const str = String(s || '');
  if (str.length <= max) return str;
  const cut = str.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  const body = (sp > Math.floor(max * 0.5) ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?—-]+$/, '');
  return `${body}…`;
}

const TYPE_LABEL = {
  blog: 'Blog post', newsletter: 'Newsletter', video: 'Video',
  image: 'Image', thread: 'Thread', text: 'Post', link: 'Link',
};

// Best plain-text body for a row (article body, else an X thread joined).
export function postText(post) {
  if (post && typeof post.body_md === 'string' && post.body_md.trim()) {
    return plainText(post.body_md);
  }
  const thread = post?.payload?.thread;
  if (Array.isArray(thread)) {
    return plainText(thread.filter((x) => typeof x === 'string').join('  '));
  }
  return '';
}

// A human title even when the row has none (X posts / images).
export function postTitle(post) {
  if (post?.title && String(post.title).trim()) return String(post.title).trim();
  return TYPE_LABEL[post?.type] || TYPE_LABEL[post?.source] || 'Post';
}

// A sanitized, bounded meta description for a row.
export function postDescription(post, max = 160) {
  const body = postText(post);
  if (body) return truncate(body, max);
  return truncate(`${postTitle(post)} from the field notes of Naga Venkata Sai Chennu.`, max);
}

export { TYPE_LABEL };
