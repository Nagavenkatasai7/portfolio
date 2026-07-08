// POST /api/media/finalize — server-side CONTENT-SNIFF of an uploaded object.
//
// After the browser uploads bytes directly to Storage, this route does a small
// RANGED GET of the object's first bytes and verifies the REAL magic number
// (a lying Content-Type can't smuggle an svg/script/exe past this). On any
// mismatch the object is DELETED and the upload rejected, so nothing untrusted
// is ever persisted into content.media. Returns a validated media descriptor
// { url, type, kind, width, height, bytes } for the composer to attach.
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { getServiceClient } from '@/lib/supabase/server';
import {
  sniffMime, resolveSniffedMime, imageDimensions, kindForMime, capForKind,
  publicUrlFor, MediaError,
} from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 4 * 1024;
const SNIFF_BYTES = 64 * 1024; // enough for a JPEG SOF scan
// Capturing form so the path can be REBUILT from validated components (see below).
const PATH_RE = /^(image|video)\/(\d{4})\/(\d{2})\/([a-z0-9]{1,64})\.([a-z0-9]{1,5})$/;

// Turn an untrusted path into a canonical, provably-safe one rebuilt ONLY from
// regex capture groups (kind/yyyy/mm/name.ext). The result contains no scheme,
// host, `..`, `@`, `:` or anything that could redirect a request off our own
// Storage origin — closing the SSRF vector at the source, not just at the sink.
function safeObjectPath(input) {
  const m = typeof input === 'string' ? input.match(PATH_RE) : null;
  if (!m) return null;
  return `${m[1]}/${m[2]}/${m[3]}/${m[4]}.${m[5]}`;
}

function supabaseOrigin() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
}

async function deleteObject(supabase, path) {
  try { await supabase.storage.from('media').remove([path]); } catch { /* best-effort */ }
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'payload_too_large' }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const path = safeObjectPath(body?.path);
  if (!path) return json({ error: 'invalid_path' }, 400);

  const supabase = getServiceClient();
  if (!supabase) return json({ error: 'server_not_configured' }, 503);

  const origin = supabaseOrigin();
  if (!origin || !/^https:\/\//i.test(origin)) return json({ error: 'server_not_configured' }, 503);
  // `path` is rebuilt from regex capture groups above; the fetch host is our own
  // trusted Storage origin. Re-assert the final origin as belt-and-suspenders.
  const target = new URL(publicUrlFor(origin, path));
  if (target.origin !== origin || target.protocol !== 'https:') return json({ error: 'invalid_path' }, 400);
  const publicUrl = target.toString();

  // Ranged GET the head of the object we just accepted (fixed-origin URL).
  let res;
  try {
    res = await fetch(target, { headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` }, cache: 'no-store' });
  } catch {
    return json({ error: 'fetch_failed' }, 502);
  }
  if (!res.ok && res.status !== 206) {
    await deleteObject(supabase, path);
    return json({ error: 'object_missing' }, 400);
  }

  const buf = new Uint8Array(await res.arrayBuffer());

  // True total size from Content-Range ("bytes 0-65535/123456") or -Length.
  let total = buf.length;
  const cr = res.headers.get('content-range');
  const m = cr && cr.match(/\/(\d+)\s*$/);
  if (m) total = Number(m[1]);
  else {
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl > 0) total = cl;
  }

  // Content-sniff: reject svg/unknown, delete the object on failure.
  let mime;
  try {
    mime = resolveSniffedMime(sniffMime(buf));
  } catch (err) {
    await deleteObject(supabase, path);
    if (err instanceof MediaError && (err.code === 'svg_rejected' || err.code === 'content_sniff_failed')) {
      return json({ error: err.code }, 400);
    }
    return json({ error: 'content_sniff_failed' }, 400);
  }

  const kind = kindForMime(mime);
  if (kind !== path.split('/')[0]) {
    // The sniffed kind must match the folder it was signed into.
    await deleteObject(supabase, path);
    return json({ error: 'kind_mismatch' }, 400);
  }
  if (total > capForKind(kind)) {
    await deleteObject(supabase, path);
    return json({ error: kind === 'video' ? 'video_too_large' : 'image_too_large' }, 400);
  }

  const dims = kind === 'image' ? imageDimensions(buf, mime) : null;

  return json({
    url: publicUrl,
    path,
    type: mime,
    kind,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    bytes: total,
  }, 200);
}
