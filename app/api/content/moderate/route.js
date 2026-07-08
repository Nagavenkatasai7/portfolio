// POST /api/content/moderate — lifecycle transitions from the /admin table.
//
// Admin session required. Handles the publish/unpublish toggle and the
// "Remove from blog" soft-delete (tombstone) via lib/gate.js#moderateContent —
// the ingest RPC deliberately can't set deleted_at, so these targeted, keyed
// UPDATEs live in the gate module too (still not a bare insert). Accepts a
// same-origin FORM POST (the table's buttons) and redirects back to /admin, or
// a JSON body and returns JSON.
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { isSameOrigin, originFromRequest, json } from '@/lib/http';
import { moderateContent, GateError } from '@/lib/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['publish', 'draft', 'remove']);

function argsForAction(action) {
  if (action === 'publish') return { status: 'published' };
  if (action === 'draft') return { status: 'draft' };
  if (action === 'remove') return { remove: true };
  return null;
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const ctype = request.headers.get('content-type') || '';
  const isForm = ctype.includes('application/x-www-form-urlencoded') || ctype.includes('multipart/form-data');

  let id, action;
  if (isForm) {
    const form = await request.formData();
    id = String(form.get('id') || '');
    action = String(form.get('action') || '');
  } else {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    id = typeof body?.id === 'string' ? body.id : '';
    action = typeof body?.action === 'string' ? body.action : '';
  }

  if (!id || !ACTIONS.has(action)) {
    if (isForm) return NextResponse.redirect(`${originFromRequest(request)}/admin`, { status: 303 });
    return json({ error: 'invalid_request' }, 400);
  }

  try {
    const updated = await moderateContent(id, argsForAction(action));
    revalidatePath('/blog');
    if (isForm) return NextResponse.redirect(`${originFromRequest(request)}/admin`, { status: 303 });
    return json({ id: updated.id, status: updated.status, deleted_at: updated.deleted_at }, 200);
  } catch (err) {
    if (err instanceof GateError) {
      if (err.code === 'server_not_configured') return isForm
        ? NextResponse.redirect(`${originFromRequest(request)}/admin?e=unconfigured`, { status: 303 })
        : json({ error: 'server_not_configured' }, 503);
      if (err.code === 'not_found') return isForm
        ? NextResponse.redirect(`${originFromRequest(request)}/admin?e=notfound`, { status: 303 })
        : json({ error: 'not_found' }, 404);
    }
    return isForm
      ? NextResponse.redirect(`${originFromRequest(request)}/admin?e=failed`, { status: 303 })
      : json({ error: 'moderate_failed' }, 500);
  }
}
