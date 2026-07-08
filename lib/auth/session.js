// ============================================================
// lib/auth/session.js — admin session (encrypted JWT) + requireAdmin().
//
// The session is a jose JWE (dir + A256GCM, an AEAD: authenticated =>
// "signed+encrypted") whose only claim is the admin's numeric GitHub id. The
// key is SHA-256(SESSION_SECRET). Cookie is httpOnly, secure, sameSite=strict.
//
// Fail-closed: if the required env is unset, isAuthConfigured() is false and
// requireAdmin() returns null — callers then emit a controlled "not
// configured" error instead of pretending anyone is authed.
// ============================================================
import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { EncryptJWT, jwtDecrypt } from 'jose';

export const SESSION_COOKIE = 'admin_session';
export const STATE_COOKIE = 'gh_oauth_state';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)

export function authConfig() {
  return {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || '',
    adminId: process.env.ADMIN_GITHUB_ID || '',
    sessionSecret: process.env.SESSION_SECRET || '',
  };
}

export function isAuthConfigured() {
  const c = authConfig();
  return Boolean(c.clientId && c.clientSecret && c.adminId && c.sessionSecret);
}

function key() {
  const { sessionSecret } = authConfig();
  if (!sessionSecret) throw new Error('server_not_configured');
  // 32 bytes for A256GCM.
  return new Uint8Array(createHash('sha256').update(sessionSecret).digest());
}

// Mint an encrypted session token for the given numeric GitHub id (string).
export async function createSessionToken(githubId) {
  return await new EncryptJWT({ sub: String(githubId) })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .encrypt(key());
}

async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key());
    return payload;
  } catch {
    return null;
  }
}

// Read + verify the session cookie. Returns { sub, iat, exp } or null.
export async function getSession() {
  if (!isAuthConfigured()) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  if (!payload?.sub) return null;
  return payload;
}

// The one gate every admin surface calls. Returns the session only when the
// cookie is valid AND its subject equals ADMIN_GITHUB_ID (numeric string
// compare — never username/email). Otherwise null.
export async function requireAdmin() {
  const { adminId } = authConfig();
  if (!adminId) return null;
  const session = await getSession();
  if (!session) return null;
  if (String(session.sub) !== String(adminId)) return null;
  return session;
}

// Cookie option helpers (keep flags identical everywhere they are set).
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

// The OAuth state cookie must survive the top-level redirect BACK from
// github.com, which is a cross-site navigation — so sameSite must be 'lax',
// not 'strict' (strict would drop it and every login would fail).
export function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes to complete the round trip
  };
}
