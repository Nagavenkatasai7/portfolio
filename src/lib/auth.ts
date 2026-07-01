/**
 * Single-admin Google OAuth 2.0 (Authorization Code + PKCE) and a signed-JWT
 * session. Deliberately dependency-light (jose + node:crypto) so it can't be
 * broken by an auth integration lagging the Astro major.
 *
 * Only ADMIN_EMAIL (a verified Google account) may obtain a session. The
 * session is an HS256 JWT stored in an HttpOnly cookie; middleware re-checks it
 * on every /admin-dashboard request.
 */
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { requireEnv, ADMIN_EMAIL } from './env';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);

export const SESSION_COOKIE = 'admin_session';
export const STATE_COOKIE = 'oauth_state';
export const VERIFIER_COOKIE = 'oauth_verifier';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const OAUTH_TEMP_MAX_AGE = 600; // 10 minutes

export interface SessionUser {
  email: string;
  name?: string;
  sub: string;
}

function sessionKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv('AUTH_SECRET'));
}

// ---- PKCE + state ----------------------------------------------------------
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(16).toString('base64url');
}

// ---- Google endpoints ------------------------------------------------------
export function redirectUri(origin: string): string {
  return `${origin}/api/auth/callback/google`;
}

export function buildAuthUrl(
  origin: string,
  state: string,
  challenge: string
): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  origin: string,
  code: string,
  verifier: string
): Promise<{ id_token: string; access_token: string }> {
  const body = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(origin),
    code_verifier: verifier,
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  return (await res.json()) as { id_token: string; access_token: string };
}

export async function verifyGoogleIdToken(idToken: string): Promise<{
  email?: string;
  email_verified?: boolean;
  name?: string;
  sub?: string;
}> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUER,
    audience: requireEnv('GOOGLE_CLIENT_ID'),
  });
  return payload as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    sub?: string;
  };
}

/** The single-account gate: verified email AND exact match to ADMIN_EMAIL. */
export function isAdminEmail(
  email: string | undefined,
  verified: boolean | undefined
): boolean {
  return (
    typeof email === 'string' &&
    verified === true &&
    email.toLowerCase().trim() === ADMIN_EMAIL
  );
}

// ---- Session ---------------------------------------------------------------
export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, sub: user.sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(sessionKey());
}

export async function verifySession(
  token: string | undefined
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    const email = String(payload.email ?? '').toLowerCase();
    // Re-assert the single-admin invariant even on a validly-signed token.
    if (email !== ADMIN_EMAIL) return null;
    return {
      email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      sub: String(payload.sub ?? ''),
    };
  } catch {
    return null;
  }
}
