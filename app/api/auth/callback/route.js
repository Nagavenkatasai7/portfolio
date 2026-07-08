// GET /api/auth/callback — finish the GitHub OAuth code flow.
//
// Verifies CSRF state, exchanges the code, fetches the user, and HARD-CHECKS
// the NUMERIC GitHub id against ADMIN_GITHUB_ID (never username/email). Only
// then is a session minted. Every failure path destroys the state cookie and
// returns an identical generic 401 (no oracle for *why* it failed).
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  authConfig,
  isAuthConfigured,
  createSessionToken,
  SESSION_COOKIE,
  STATE_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { exchangeCodeForToken, fetchGithubUser } from '@/lib/auth/github';
import { originFromRequest, clientIp, json } from '@/lib/http';
import { checkAndRecord } from '@/lib/auth/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clearState(res) {
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

// One generic failure response for ALL auth failures — no detail leaks.
function fail() {
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in failed</title></head>`
    + `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">`
    + `<h1>Sign-in failed</h1><p>We couldn't sign you in. <a href="/admin/login">Try again</a>.</p></body></html>`;
  const res = new NextResponse(body, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  clearState(res);
  return res;
}

function statesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (!isAuthConfigured()) return json({ error: 'server_not_configured' }, 503);

  const rl = await checkAndRecord(clientIp(request), 'callback');
  if (!rl.allowed) return json({ error: 'rate_limited' }, 429);

  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  // CSRF: the returned state must match the one we set.
  if (!code || !statesMatch(state, cookieState)) return fail();

  const redirectUri = `${originFromRequest(request)}/api/auth/callback`;
  const token = await exchangeCodeForToken({ code, redirectUri });
  if (!token) return fail();

  const user = await fetchGithubUser(token);
  if (!user) return fail();

  // THE hard check: numeric id, string-compared. Not login, not email.
  const { adminId } = authConfig();
  if (String(user.id) !== String(adminId)) return fail();

  const sessionToken = await createSessionToken(user.id);
  const res = NextResponse.redirect(`${originFromRequest(request)}/admin`, { status: 302 });
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  clearState(res);
  return res;
}
