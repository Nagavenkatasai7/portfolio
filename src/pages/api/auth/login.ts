export const prerender = false;

import type { APIRoute } from 'astro';
import {
  buildAuthUrl,
  generatePkce,
  generateState,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  OAUTH_TEMP_MAX_AGE,
} from '../../../lib/auth';

// Entry point for admin sign-in. Visit /api/auth/login to start Google OAuth.
export const GET: APIRoute = ({ cookies, url, redirect }) => {
  const secure = url.protocol === 'https:';
  const state = generateState();
  const { verifier, challenge } = generatePkce();
  const opts = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: OAUTH_TEMP_MAX_AGE,
  };
  cookies.set(STATE_COOKIE, state, opts);
  cookies.set(VERIFIER_COOKIE, verifier, opts);
  return redirect(buildAuthUrl(url.origin, state, challenge), 302);
};
