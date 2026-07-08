// POST /api/ingest — the authenticated write path into the content feed.
//
// Admin session required. Validates the payload, runs it through the single
// ingestion gate (dedupe upsert), and triggers on-demand ISR revalidation of
// /blog so a new/changed post shows up immediately.
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { ingestContent, GateError } from '@/lib/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 64 * 1024;

// GateError codes that are the caller's fault (bad payload) => 400.
const BAD_REQUEST_CODES = new Set([
  'invalid_item', 'invalid_source', 'invalid_type', 'missing_published_at',
  'invalid_published_at', 'invalid_status', 'invalid_payload', 'invalid_media',
  'missing_external_id',
]);

export async function POST(request) {
  // Independent server-side auth check — never trusts a page shell.
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);

  // CSRF defense-in-depth (sameSite=strict cookie already blocks cross-site).
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'payload_too_large' }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    const result = await ingestContent(body);
    revalidatePath('/blog');
    return json({ id: result.id, created: result.created, external_id: result.external_id }, result.created ? 201 : 200);
  } catch (err) {
    if (err instanceof GateError) {
      if (err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
      if (BAD_REQUEST_CODES.has(err.code)) return json({ error: err.code }, 400);
      return json({ error: 'ingest_failed' }, 500);
    }
    return json({ error: 'ingest_failed' }, 500);
  }
}
