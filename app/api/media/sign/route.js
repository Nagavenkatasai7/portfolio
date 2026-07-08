// POST /api/media/sign — mint a SIGNED, direct-to-storage upload URL.
//
// Admin session required. Validates the DECLARED file (mime allowlist + per-type
// size cap; svg rejected) and returns a signed upload URL the browser PUTs the
// bytes to DIRECTLY — the file never streams through this function. The real
// content-sniff happens afterward in /api/media/finalize.
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { getServiceClient } from '@/lib/supabase/server';
import {
  validateDeclaredUpload, storagePathFor, publicUrlFor, capForKind, MediaError,
} from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 4 * 1024; // just a small JSON descriptor

const BAD_REQUEST_CODES = new Set([
  'svg_rejected', 'unsupported_type', 'invalid_size', 'image_too_large', 'video_too_large',
]);

function supabaseOrigin() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'payload_too_large' }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  let descriptor;
  try {
    descriptor = validateDeclaredUpload({
      filename: body?.filename, contentType: body?.contentType, size: body?.size,
    });
  } catch (err) {
    if (err instanceof MediaError && BAD_REQUEST_CODES.has(err.code)) return json({ error: err.code }, 400);
    return json({ error: 'invalid_upload' }, 400);
  }

  const supabase = getServiceClient();
  if (!supabase) return json({ error: 'server_not_configured' }, 503);

  const path = storagePathFor(descriptor);
  const { data, error } = await supabase.storage.from('media').createSignedUploadUrl(path);
  if (error || !data?.token) return json({ error: 'sign_failed' }, 502);

  const origin = supabaseOrigin();
  const signed = data.signedUrl || '';
  // Absolute upload URL so the browser needs neither the supabase origin nor a
  // supabase client — it just PUTs the bytes here.
  const uploadUrl = /^https?:\/\//i.test(signed)
    ? signed
    : `${origin}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;

  return json({
    path,
    token: data.token,
    uploadUrl,
    publicUrl: publicUrlFor(origin, path),
    kind: descriptor.kind,
    mime: descriptor.mime,
    maxBytes: capForKind(descriptor.kind),
  }, 200);
}
