// ============================================================
// lib/auth/github.js — minimal GitHub OAuth (code flow) helpers.
// Hand-rolled; no auth framework. Web-standard fetch only.
// ============================================================
import 'server-only';
import { authConfig } from './session.js';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

// Build the GitHub authorize URL. redirectUri is this deployment's own
// /api/auth/callback (derived from the request origin by the caller).
export function buildAuthorizeUrl({ redirectUri, state }) {
  const { clientId } = authConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state,
    allow_signup: 'false',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Exchange an authorization code for an access token. Returns the token string
// or null on any failure (never throws the raw upstream body).
export async function exchangeCodeForToken({ code, redirectUri }) {
  const { clientId, clientSecret } = authConfig();
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  if (json.error || !json.access_token) return null;
  return json.access_token;
}

// Fetch the authenticated user. Returns { id, login } or null. The NUMERIC id
// is what the caller compares against ADMIN_GITHUB_ID.
export async function fetchGithubUser(accessToken) {
  let res;
  try {
    res = await fetch(USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'naga-portfolio-admin',
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  if (json.id == null) return null;
  return { id: String(json.id), login: json.login };
}
