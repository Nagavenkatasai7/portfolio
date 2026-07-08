// POST /api/auth/logout — clear the admin session.
// Mutating => CSRF-guarded (sameSite=strict cookie + Origin check).
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { isSameOrigin, originFromRequest, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: 'bad_origin' }, 403);

  const res = NextResponse.redirect(`${originFromRequest(request)}/admin/login`, { status: 303 });
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0,
  });
  return res;
}
