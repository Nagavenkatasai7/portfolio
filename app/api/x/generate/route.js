// POST /api/x/generate — the X studio's drafting call.
//
// Admin session required (independently re-checked here — never trust the page).
// Takes { topic, tone, format } and returns 1..3 styled X-post variants from
// lib/x_draft.js#generateXDrafts (which walks the OpenRouter free-model fallback
// chain). PERSISTS NOTHING — the owner explicitly Saves/Approves afterwards.
//
// Graceful degradation: generateXDrafts never throws. When the free models are
// out of credits / throttled it returns { ok:false }, and we surface that as a
// 200 with { ok:false, error } — the SAME convention api/chat.js uses (a 200
// stream carrying an error frame). The studio then shows a "write it yourself"
// state; drafting failure must never block manual authoring.
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { generateXDrafts } from '@/lib/x_draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 8 * 1024;

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'payload_too_large' }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  if (!topic) return json({ ok: false, error: 'topic_required' }, 400);
  const tone = typeof body?.tone === 'string' ? body.tone : '';
  const format = body?.format === 'thread' ? 'thread' : 'single';

  // generateXDrafts is total (never throws); it returns { ok:false } on failure.
  const result = await generateXDrafts(
    { topic, tone, format },
    { referer: request.headers.get('referer') || '' },
  );

  if (result.ok) {
    return json(
      { ok: true, topic: result.topic, tone: result.tone, format: result.format, model_used: result.model_used, variants: result.variants },
      200,
    );
  }
  // invalid_input shouldn't happen (topic validated above) but map it to 400.
  if (result.error === 'invalid_input') return json({ ok: false, error: 'topic_required' }, 400);
  // Generation unavailable / empty: 200 so the client renders a soft fallback
  // (matches api/chat.js) rather than throwing on a non-2xx.
  return json({ ok: false, error: result.error || 'generation_unavailable' }, 200);
}
