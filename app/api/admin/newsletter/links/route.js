// POST /api/admin/newsletter/links — the "link bin" CRUD (Phase N2).
//   add     -> addLink({url, note})     (a URL the owner drops in during the week)
//   discard -> discardLink(id)          (dismiss a queued link)
// (Listing is server-rendered by /admin/newsletter; Phase N3's drafter consumes
// the queued rows.) requireAdmin + isSameOrigin; service-role via the chokepoint.
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { addLink, discardLink, IssueError } from '@/lib/newsletter_issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const action = typeof body?.action === 'string' ? body.action : '';

  try {
    if (action === 'add') {
      const link = await addLink({ url: body?.url, note: body?.note ?? null });
      return json({ ok: true, link }, 200);
    }
    if (action === 'discard') {
      const id = typeof body?.id === 'string' ? body.id : '';
      const link = await discardLink(id);
      return json({ ok: true, link }, 200);
    }
    return json({ error: 'invalid_action' }, 400);
  } catch (err) {
    if (err instanceof IssueError) {
      if (err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
      if (err.code === 'invalid_url' || err.code === 'invalid_id') return json({ error: err.code }, 400);
    }
    return json({ error: 'action_failed' }, 500);
  }
}
