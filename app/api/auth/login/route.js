// GET /api/auth/login — begin the GitHub OAuth code flow.
// Generates CSRF state, stores it in an httpOnly cookie, and 302s to GitHub.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isAuthConfigured, STATE_COOKIE, stateCookieOptions } from '@/lib/auth/session';
import { buildAuthorizeUrl } from '@/lib/auth/github';
import { originFromRequest, clientIp, json } from '@/lib/http';
import { checkAndRecord } from '@/lib/auth/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!isAuthConfigured()) {
    return json({ error: 'server_not_configured' }, 503);
  }

  const rl = await checkAndRecord(clientIp(request), 'login');
  if (!rl.allowed) return json({ error: 'rate_limited' }, 429);

  const state = randomBytes(16).toString('hex');
  const redirectUri = `${originFromRequest(request)}/api/auth/callback`;
  const authorizeUrl = buildAuthorizeUrl({ redirectUri, state });

  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
  res.cookies.set(STATE_COOKIE, state, stateCookieOptions());
  return res;
}
