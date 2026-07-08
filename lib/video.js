// ============================================================
// lib/video.js — PURE, dependency-free video URL parsing.
//
// Turns a user-supplied video URL into a SAFE, structured descriptor the blog
// can render as a controlled embed. Shared by the composer (to validate at
// ingest time) and /blog (to render). Because the output feeds an <iframe src>
// / <video src>, every extracted id is matched against a STRICT charset and we
// only ever emit https:// URLs on a fixed allowlist of hosts — nothing
// user-controlled is interpolated raw.
//
//   YouTube -> https://www.youtube-nocookie.com/embed/<id>  (privacy-friendly)
//   Vimeo   -> https://player.vimeo.com/video/<id>
//   direct  -> the original https .mp4/.webm URL, rendered in <video>
// ============================================================

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^[0-9]{6,12}$/;

function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return u;
}

function host(u) {
  return u.hostname.toLowerCase().replace(/^www\./, '');
}

// Returns { provider, id, embedUrl, url } or null if unrecognized/unsafe.
export function parseVideoUrl(raw) {
  const u = safeUrl(raw);
  if (!u) return null;
  const h = host(u);

  // --- YouTube ---
  if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
    let id = u.searchParams.get('v');
    if (!id) {
      const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([^/?#]+)/);
      if (m) id = m[1];
    }
    if (id && YT_ID.test(id)) {
      return { provider: 'youtube', id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, url: u.toString() };
    }
    return null;
  }
  if (h === 'youtu.be') {
    const id = u.pathname.slice(1).split(/[/?#]/)[0];
    if (id && YT_ID.test(id)) {
      return { provider: 'youtube', id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, url: u.toString() };
    }
    return null;
  }

  // --- Vimeo ---
  if (h === 'vimeo.com' || h === 'player.vimeo.com') {
    const m = u.pathname.match(/(\d{6,12})/);
    if (m && VIMEO_ID.test(m[1])) {
      return { provider: 'vimeo', id: m[1], embedUrl: `https://player.vimeo.com/video/${m[1]}`, url: u.toString() };
    }
    return null;
  }

  // --- direct file (https only for the <video> src) ---
  if (u.protocol === 'https:' && /\.(mp4|webm)(?:$|[?#])/i.test(u.pathname)) {
    const ext = u.pathname.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
    return { provider: 'direct', id: null, embedUrl: u.toString(), url: u.toString(), mime: `video/${ext}` };
  }

  return null;
}
