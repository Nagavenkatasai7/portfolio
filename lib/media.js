// ============================================================
// lib/media.js — media validation, content-sniff, and dimension parsing.
//
// PURE + dependency-free (no server-only, no DB) so it is imported both by the
// admin media API routes (app/api/media/*) AND by the verification script,
// exactly like lib/canonical.js is shared by the gate and gate-verify.
//
// The security model for uploads (see PLATFORM.md):
//   1. sign route: validates the DECLARED {filename, contentType, size}
//      against the allowlist + per-type cap and rejects svg, then mints a
//      signed upload URL. Bytes never touch the function.
//   2. finalize route: does a small RANGED GET of the uploaded object's first
//      bytes and CONTENT-SNIFFS the real magic number server-side — a lying
//      Content-Type can't smuggle an svg/exe past this. Mismatch => the object
//      is deleted and the upload rejected. Only then is the public URL saved.
// ============================================================

export class MediaError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MediaError';
    this.code = code;
  }
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

// The ONLY types that may be stored. SVG is deliberately absent (script vector).
export const IMAGE_MIMES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
});
export const VIDEO_MIMES = Object.freeze({
  'video/mp4': 'mp4',
  'video/webm': 'webm',
});
export const ALL_MIMES = Object.freeze({ ...IMAGE_MIMES, ...VIDEO_MIMES });

export function kindForMime(mime) {
  if (mime in IMAGE_MIMES) return 'image';
  if (mime in VIDEO_MIMES) return 'video';
  return null;
}

export function capForKind(kind) {
  return kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

function extFromName(name) {
  if (typeof name !== 'string') return '';
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

// Validate a DECLARED upload (pre-signing). Throws MediaError on any violation.
// Returns a normalized descriptor { kind, mime, ext, size }.
export function validateDeclaredUpload({ filename, contentType, size }) {
  const mime = typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : '';
  if (mime === 'image/svg+xml' || extFromName(filename) === 'svg') {
    throw new MediaError('svg_rejected');
  }
  const kind = kindForMime(mime);
  if (!kind) throw new MediaError('unsupported_type');

  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) throw new MediaError('invalid_size');
  if (n > capForKind(kind)) throw new MediaError(kind === 'video' ? 'video_too_large' : 'image_too_large');

  return { kind, mime, ext: ALL_MIMES[mime], size: n };
}

// A stable, unguessable object path. Grouped by kind + yyyy/mm for tidiness.
export function storagePathFor({ kind, ext }, rand = cryptoRandomId()) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext || '') ? ext : 'bin';
  return `${kind}/${yyyy}/${mm}/${rand}.${safeExt}`;
}

function cryptoRandomId() {
  // Works in Node 19+ and the edge/runtime; falls back to Math.random only if
  // crypto is somehow unavailable (never in our runtimes).
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function publicUrlFor(supabaseUrl, path) {
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/media/${path}`;
}

// ---- content sniff ----------------------------------------------------------

function startsWith(bytes, sig, offset = 0) {
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

// Detect the real MIME from the leading bytes. Returns a mime string (which may
// be 'image/svg+xml' or 'application/octet-stream' for things we then reject),
// or null if there aren't enough bytes to decide.
export function sniffMime(bytes) {
  if (!bytes || bytes.length < 12) return null;

  // Explicit SVG / XML text detection so we can reject with a precise code.
  // Skip a UTF-8 BOM + leading ASCII whitespace, then look for "<?xml" / "<svg".
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  const lt = 0x3c;
  if (bytes[i] === lt) {
    const tail = String.fromCharCode(...bytes.slice(i, Math.min(i + 5, bytes.length))).toLowerCase();
    if (tail.startsWith('<?xml') || tail.startsWith('<svg')) return 'image/svg+xml';
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // GIF8
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'; // EBML
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return 'video/mp4'; // ....ftyp

  return 'application/octet-stream';
}

// The server-side gate for finalize: given the sniffed magic AND the declared
// mime, decide the trustworthy type. Throws MediaError otherwise.
export function resolveSniffedMime(sniffed) {
  if (sniffed === 'image/svg+xml') throw new MediaError('svg_rejected');
  if (!sniffed || !(sniffed in ALL_MIMES)) throw new MediaError('content_sniff_failed');
  return sniffed;
}

// ---- image dimensions (best-effort, dependency-free) ------------------------

function u16be(b, o) { return (b[o] << 8) | b[o + 1]; }
function u16le(b, o) { return b[o] | (b[o + 1] << 8); }
function u32be(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function u24le(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); }

// Returns { width, height } or null. Handles png/gif/jpeg/webp. Video is not
// parsed here (returns null) — dimensions for video are stored as null.
export function imageDimensions(bytes, mime) {
  try {
    if (mime === 'image/png' && bytes.length >= 24) {
      return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
    }
    if (mime === 'image/gif' && bytes.length >= 10) {
      return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
    }
    if (mime === 'image/jpeg') {
      let o = 2;
      while (o + 9 < bytes.length) {
        if (bytes[o] !== 0xff) { o++; continue; }
        const marker = bytes[o + 1];
        // SOF markers carry the frame dimensions (skip DHT/DQT-style C4/C8/CC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: u16be(bytes, o + 5), width: u16be(bytes, o + 7) };
        }
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
        const len = u16be(bytes, o + 2);
        if (len <= 0) break;
        o += 2 + len;
      }
      return null;
    }
    if (mime === 'image/webp' && bytes.length >= 30) {
      const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (fourcc === 'VP8X') {
        return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
      }
      if (fourcc === 'VP8 ') {
        return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
      }
      if (fourcc === 'VP8L') {
        const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { width, height };
      }
    }
  } catch {
    return null;
  }
  return null;
}
