// ============================================================
// lib/compose.js — PURE builder that turns one composer submission into an
// item for lib/gate.js#ingestContent. Shared by app/api/content/create and the
// verification script so both produce the exact same identity/shape per type.
//
// Every content type in the platform is created here:
//   blog / newsletter — title + markdown body (native, slug external_id)
//   video             — title + video URL (YouTube/Vimeo/direct), safe embed
//   image             — title + uploaded, content-sniffed image(s)
//   paste             — a LinkedIn or X/Twitter post URL (auto-detected source)
//                       + optional note/body + optional media
// ============================================================
import { blogExternalId } from './slug.js';
import { parseVideoUrl } from './video.js';

export class ComposeError extends Error {
  constructor(code) { super(code); this.name = 'ComposeError'; this.code = code; }
}

const XLIKE = new Set(['x.com', 'twitter.com', 'mobile.twitter.com']);
const LINKEDIN = new Set(['linkedin.com', 'www.linkedin.com', 'lnkd.in']);

// Auto-detect the manual paste source from the URL host.
export function detectPasteSource(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl).trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  if (XLIKE.has(h) || XLIKE.has(u.hostname.toLowerCase())) return 'x_manual';
  if (LINKEDIN.has(h) || h.endsWith('.linkedin.com')) return 'linkedin_manual';
  return null;
}

function cleanTitle(t) {
  const s = typeof t === 'string' ? t.trim() : '';
  return s ? s.slice(0, 300) : null;
}
function cleanBody(b) {
  const s = typeof b === 'string' ? b.trim() : '';
  return s ? s : null;
}
function whenIso(published_at) {
  if (published_at == null || published_at === '') return new Date().toISOString();
  const d = new Date(published_at);
  if (Number.isNaN(d.getTime())) throw new ComposeError('invalid_published_at');
  return d.toISOString();
}

// Normalize a media array (from /api/media/finalize descriptors) to the safe
// jsonb shape stored in content.media. Drops anything without an https url.
export function normalizeMedia(media) {
  if (!Array.isArray(media)) return [];
  const out = [];
  for (const m of media) {
    if (!m || typeof m.url !== 'string' || !/^https:\/\//i.test(m.url)) continue;
    const kind = m.kind === 'video' ? 'video' : (m.kind === 'image' ? 'image' : null);
    if (!kind) continue;
    const entry = { kind, url: m.url };
    if (typeof m.type === 'string') entry.type = m.type;
    if (Number.isFinite(m.width)) entry.width = m.width;
    if (Number.isFinite(m.height)) entry.height = m.height;
    if (typeof m.alt === 'string' && m.alt.trim()) entry.alt = m.alt.trim().slice(0, 300);
    out.push(entry);
    if (out.length >= 8) break;
  }
  return out;
}

// The one builder. `input.kind` selects the content type. Returns an item ready
// for ingestContent; throws ComposeError on invalid input. `seed` makes the
// generated blog/newsletter/image slug deterministic for tests.
export function buildComposerItem(input, seed = Date.now()) {
  if (!input || typeof input !== 'object') throw new ComposeError('invalid_input');
  const status = input.publishNow ? 'published' : 'draft';
  const published_at = whenIso(input.published_at);
  const title = cleanTitle(input.title);
  const body_md = cleanBody(input.body_md);
  const media = normalizeMedia(input.media);

  switch (input.kind) {
    case 'blog': {
      if (!title) throw new ComposeError('title_required');
      if (!body_md) throw new ComposeError('body_required');
      return { source: 'blog', type: 'blog', external_id: blogExternalId(title, seed), status, title, body_md, media, published_at };
    }
    case 'newsletter': {
      if (!title) throw new ComposeError('title_required');
      if (!body_md) throw new ComposeError('body_required');
      return { source: 'newsletter', type: 'newsletter', external_id: blogExternalId(title, seed), status, title, body_md, media, published_at };
    }
    case 'video': {
      if (!title) throw new ComposeError('title_required');
      const video = parseVideoUrl(input.videoUrl);
      if (!video) throw new ComposeError('bad_video_url');
      return {
        source: 'video', type: 'video', external_id: video.url, status, title, body_md, media,
        payload: { video: { provider: video.provider, id: video.id, embedUrl: video.embedUrl, url: video.url, mime: video.mime || null } },
        published_at,
      };
    }
    case 'image': {
      if (!title) throw new ComposeError('title_required');
      if (media.filter((m) => m.kind === 'image').length === 0) throw new ComposeError('image_required');
      return { source: 'image', type: 'image', external_id: `image-${blogExternalId(title, seed)}`, status, title, body_md, media, published_at };
    }
    case 'paste': {
      const source = detectPasteSource(input.url);
      if (!source) throw new ComposeError('unrecognized_paste_url');
      let host = '';
      try { host = new URL(input.url).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* validated above */ }
      return {
        source, type: 'text', external_id: String(input.url).trim(), status, title, body_md, media,
        payload: { link: { url: String(input.url).trim(), host } },
        published_at,
      };
    }
    default:
      throw new ComposeError('invalid_kind');
  }
}

export const COMPOSER_KINDS = ['blog', 'newsletter', 'video', 'image', 'paste'];
