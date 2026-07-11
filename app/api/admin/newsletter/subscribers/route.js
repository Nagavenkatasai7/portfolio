// POST /api/admin/newsletter/subscribers — admin subscriber actions (Phase N2).
//   add    -> addSubscriberManual(email)        (owner manual add -> 'active')
//   remove -> removeSubscriber(subscriberId)    (manual opt-out -> 'unsubscribed')
//   import -> importResendAudience()            (optional Resend Audience import)
//
// requireAdmin + isSameOrigin on every call. Service-role writes only via the
// chokepoint lib/newsletter_issues.js.
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { addSubscriberManual, removeSubscriber, importResendAudience, IssueError } from '@/lib/newsletter_issues';

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
      const email = typeof body?.email === 'string' ? body.email : '';
      const result = await addSubscriberManual(email);
      return json({ ok: true, ...result }, 200);
    }
    if (action === 'remove') {
      const subscriberId = typeof body?.subscriberId === 'string' ? body.subscriberId : '';
      const row = await removeSubscriber(subscriberId);
      return json({ ok: true, subscriber: row }, 200);
    }
    if (action === 'import') {
      const result = await importResendAudience();
      // not_configured is an expected, non-error state (no audience set up).
      const status = result.ok ? 200 : (result.error === 'not_configured' ? 200 : 502);
      return json(result, status);
    }
    return json({ error: 'invalid_action' }, 400);
  } catch (err) {
    if (err instanceof IssueError) {
      if (err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
      if (err.code === 'not_found') return json({ error: 'not_found' }, 404);
      if (err.code === 'invalid_id' || err.code === 'invalid_email') return json({ error: err.code }, 400);
      if (err.code === 'suppressed') return json({ error: 'suppressed', detail: err.detail || null }, 409);
    }
    return json({ error: 'action_failed' }, 500);
  }
}
