// POST /api/content/create — the composer's write path.
//
// Admin session required. Builds one item (blog/newsletter/video/image/paste)
// via lib/compose.js and writes it through the SINGLE ingestion gate
// (lib/gate.js#ingestContent — dedupe upsert, never a bare insert), then
// revalidates /blog. New items default to status='draft' unless publishNow.
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { ingestContent, GateError } from '@/lib/gate';
import { buildComposerItem, ComposeError } from '@/lib/compose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 128 * 1024;

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

  let item;
  try {
    item = buildComposerItem(body);
  } catch (err) {
    if (err instanceof ComposeError) return json({ error: err.code }, 400);
    return json({ error: 'invalid_input' }, 400);
  }

  try {
    const result = await ingestContent(item);
    revalidatePath('/blog');
    return json({ id: result.id, created: result.created, external_id: result.external_id, status: item.status }, result.created ? 201 : 200);
  } catch (err) {
    if (err instanceof GateError) {
      if (err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
      if (GATE_BAD_REQUEST.has(err.code)) return json({ error: err.code }, 400);
    }
    return json({ error: 'ingest_failed' }, 500);
  }
}
