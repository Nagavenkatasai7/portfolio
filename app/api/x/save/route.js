// POST /api/x/save — persist ONE chosen X draft through the ingestion gate.
//
// Admin session required. Builds an x_auto item (buildXDraftItem — status=draft,
// type text|thread, stable content-derived external_id) and writes it via the
// SINGLE ingestion gate (lib/gate.js#ingestContent — dedupe upsert, never a bare
// insert), so re-saving the identical draft updates one row instead of duping.
//
// action:
//   'draft'   -> save as a draft (hidden from /blog until published)
//   'publish' -> save, then flip to published via moderateContent (the gate's
//                lifecycle write) — publishing shows it on /blog. (Posting to X
//                itself is manual for now; the studio provides Copy / intent link.)
//
// Discarding a SAVED draft is /api/content/moderate {action:'remove'} (reused).
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { ingestContent, moderateContent, GateError } from '@/lib/gate';
import { buildXDraftItem, XDraftError } from '@/lib/x_draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 64 * 1024;
const GATE_BAD_REQUEST = new Set([
  'invalid_item', 'invalid_source', 'invalid_type', 'missing_published_at',
  'invalid_published_at', 'invalid_status', 'invalid_payload', 'invalid_media',
  'missing_external_id',
]);

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'payload_too_large' }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const action = body?.action === 'publish' ? 'publish' : 'draft';

  // Build the item purely (validates text/format); map its errors to 400.
  let item;
  try {
    item = buildXDraftItem({
      topic: body?.topic,
      tone: body?.tone,
      format: body?.format,
      model_used: body?.model_used,
      variants: body?.variants,
      chosenText: body?.text,
    });
  } catch (err) {
    if (err instanceof XDraftError) return json({ error: err.code }, 400);
    return json({ error: 'invalid_input' }, 400);
  }

  try {
    const result = await ingestContent(item);           // always status=draft
    let status = 'draft';
    if (action === 'publish') {
      const updated = await moderateContent(result.id, { status: 'published' });
      status = updated.status;
    }
    revalidatePath('/blog');
    return json(
      { id: result.id, created: result.created, external_id: result.external_id, status, type: item.type },
      result.created ? 201 : 200,
    );
  } catch (err) {
    if (err instanceof GateError) {
      if (err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
      if (err.code === 'not_found') return json({ error: 'not_found' }, 404);
      if (GATE_BAD_REQUEST.has(err.code)) return json({ error: err.code }, 400);
    }
    return json({ error: 'save_failed' }, 500);
  }
}
