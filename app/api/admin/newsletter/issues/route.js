// POST /api/admin/newsletter/issues — the admin issue actions (Phase N2).
//
// One admin-gated endpoint that dispatches on `action`:
//   meta       -> ensureIssueMeta(contentId, {subject,preheader,heroImageUrl})
//   approve    -> approveIssue(contentId)        (draft -> approved / "arm")
//   disarm     -> disarmIssue(contentId)         (approved -> draft)
//   send-now   -> sendNow({contentId})           (start + drain now, any weekday)
//   test-send  -> sendTestIssue({contentId,email})  ([TEST] render to one addr)
//
// Every mutation re-checks requireAdmin + isSameOrigin independently (never
// trusts the page). Service-role writes happen ONLY inside the chokepoint
// lib/newsletter_issues.js. JSON in, JSON out.
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, json } from '@/lib/http';
import { isEmailConfigured } from '@/lib/email/send';
import {
  ensureIssueMeta, approveIssue, disarmIssue, sendNow, sendTestIssue, getIssueDetail, IssueError,
} from '@/lib/newsletter_issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?contentId=... — one issue's detail (meta + per-recipient ledger + stats)
// for the admin detail view. requireAdmin; non-mutating read (no origin check).
export async function GET(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  const contentId = new URL(request.url).searchParams.get('contentId') || '';
  if (!contentId) return json({ error: 'invalid_id' }, 400);
  try {
    const detail = await getIssueDetail(contentId);
    if (!detail) return json({ error: 'not_found' }, 404);
    return json({ ok: true, ...detail }, 200);
  } catch (err) {
    if (err instanceof IssueError && err.code === 'server_not_configured') {
      return json({ error: 'server_not_configured' }, 503);
    }
    return json({ error: 'detail_failed' }, 500);
  }
}

const MAX_BODY = 32 * 1024;
const BAD_REQUEST = new Set(['invalid_id', 'subject_required', 'invalid_email', 'invalid_url']);
const CONFLICT = new Set(['not_newsletter', 'not_draft', 'not_approved', 'another_sending', 'locked']);

function mapError(err) {
  if (err instanceof IssueError) {
    if (err.code === 'server_not_configured') return json({ error: 'server_not_configured' }, 503);
    if (err.code === 'not_found') return json({ error: 'not_found' }, 404);
    if (BAD_REQUEST.has(err.code)) return json({ error: err.code }, 400);
    if (CONFLICT.has(err.code)) return json({ error: err.code, detail: err.detail || null }, 409);
  }
  if (err && (err.code === 'email_not_configured' || err.name === 'NotConfiguredError')) {
    return json({ error: 'email_not_configured' }, 503);
  }
  return json({ error: 'action_failed' }, 500);
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'payload_too_large' }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const action = typeof body?.action === 'string' ? body.action : '';
  const contentId = typeof body?.contentId === 'string' ? body.contentId : '';

  try {
    if (action === 'meta') {
      const meta = await ensureIssueMeta(contentId, {
        subject: body?.subject,
        preheader: body?.preheader ?? null,
        heroImageUrl: body?.heroImageUrl ?? null,
      });
      return json({ ok: true, meta }, 200);
    }
    if (action === 'approve') {
      const meta = await approveIssue(contentId);
      return json({ ok: true, meta }, 200);
    }
    if (action === 'disarm') {
      const meta = await disarmIssue(contentId);
      return json({ ok: true, meta }, 200);
    }
    if (action === 'send-now') {
      if (!isEmailConfigured()) return json({ error: 'email_not_configured' }, 503);
      const result = await sendNow({ contentId });
      if (!result.ok) return mapError(new IssueError(result.error, result.detail));
      return json({ ok: true, ...result }, 200);
    }
    if (action === 'test-send') {
      if (!isEmailConfigured()) return json({ error: 'email_not_configured' }, 503);
      const result = await sendTestIssue({ contentId, email: body?.email });
      return json({ ok: true, ...result }, 200);
    }
    return json({ error: 'invalid_action' }, 400);
  } catch (err) {
    return mapError(err);
  }
}
