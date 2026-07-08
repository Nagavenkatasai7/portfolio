// POST /api/content/update — edit an EXISTING content row.
//
// Admin session required. Loads the row by id (for field defaults + the video
// payload merge), applies the edited title / body / media / video, and writes
// through the gate's PK-based updateContentFields() — a targeted UPDATE on the
// one row, NOT a read-modify-reingest (which routed edits through the dedupe
// upsert and carried a TOCTOU). Identity (source/external_id/type), status and
// published_at are untouched; the row is stamped locally_edited=true so a daily
// LinkedIn re-sync never reverts the owner's edit.
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { updateContentFields, getContentById, GateError } from '@/lib/gate';
import { normalizeMedia, ComposeError } from '@/lib/compose';
import { parseVideoUrl } from '@/lib/video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 128 * 1024;

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'payload_too_large' }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return json({ error: 'invalid_id' }, 400);

  let row;
  try {
    row = await getContentById(id);
  } catch (err) {
    if (err instanceof GateError && err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
    return json({ error: 'read_failed' }, 500);
  }
  if (!row) return json({ error: 'not_found' }, 404);

  // Compute the edited fields, defaulting to the existing row's values.
  const title = typeof body.title === 'string' ? (body.title.trim() ? body.title.trim().slice(0, 300) : null) : row.title;
  const bodyMd = typeof body.body_md === 'string' ? (body.body_md.trim() ? body.body_md.trim() : null) : row.body_md;
  const media = body.media !== undefined ? normalizeMedia(body.media) : (Array.isArray(row.media) ? row.media : []);

  let payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  if (row.type === 'video' && typeof body.videoUrl === 'string' && body.videoUrl.trim()) {
    const v = parseVideoUrl(body.videoUrl);
    if (!v) return json({ error: 'bad_video_url' }, 400);
    payload = { ...payload, video: { provider: v.provider, id: v.id, embedUrl: v.embedUrl, url: v.url, mime: v.mime || null } };
  }

  try {
    // PK-based UPDATE (not a re-ingest). Identity/status/published_at preserved;
    // sets locally_edited=true so autosync won't revert this edit.
    const result = await updateContentFields(id, { title, body_md: bodyMd, media, payload });
    revalidatePath('/blog');
    return json({ id: result.id, created: result.created, external_id: result.external_id }, 200);
  } catch (err) {
    if (err instanceof GateError && err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
    if (err instanceof GateError && err.code === 'not_found') return json({ error: 'not_found' }, 404);
    if (err instanceof ComposeError) return json({ error: err.code }, 400);
    return json({ error: 'ingest_failed' }, 500);
  }
}
