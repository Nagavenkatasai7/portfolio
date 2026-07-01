export const prerender = false;

import type { APIRoute } from 'astro';
import {
  exchangeCode,
  verifyGoogleIdToken,
  isAdminEmail,
  createSession,
  SESSION_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  SESSION_MAX_AGE,
} from '../../../../lib/auth';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const secure = url.protocol === 'https:';
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = cookies.get(STATE_COOKIE)?.value;
  const verifier = cookies.get(VERIFIER_COOKIE)?.value;

  // Temp cookies are single-use — clear them regardless of outcome.
  cookies.delete(STATE_COOKIE, { path: '/api/auth' });
  cookies.delete(VERIFIER_COOKIE, { path: '/api/auth' });

  if (!code || !state || !savedState || state !== savedState || !verifier) {
    return new Response('Invalid authentication request.', { status: 400 });
  }

  try {
    const tokens = await exchangeCode(url.origin, code, verifier);
    const claims = await verifyGoogleIdToken(tokens.id_token);
    if (!isAdminEmail(claims.email, claims.email_verified)) {
      return new Response('Not authorized.', { status: 403 });
    }
    const jwt = await createSession({
      email: claims.email!.toLowerCase(),
      name: claims.name,
      sub: claims.sub ?? '',
    });
    cookies.set(SESSION_COOKIE, jwt, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return redirect('/admin-dashboard', 302);
  } catch {
    return new Response('Authentication failed.', { status: 500 });
  }
};
