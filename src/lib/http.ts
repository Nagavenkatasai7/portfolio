/**
 * Shared HTTP helpers for API endpoints: JSON responses, admin gating, and the
 * CSRF / preview-hardening origin checks the plan requires on write endpoints.
 */
import type { APIContext } from 'astro';
import { verifySession, SESSION_COOKIE, type SessionUser } from './auth';
import { PUBLIC_SITE_URL } from './env';

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Returns the admin session user for an API request, or null. */
export function getAdmin(context: APIContext): Promise<SessionUser | null> {
  return verifySession(context.cookies.get(SESSION_COOKIE)?.value);
}

/**
 * Admin gate for write endpoints: requires a valid admin session AND a matching
 * Origin (CSRF). Returns the user, or a Response to short-circuit with.
 */
export async function adminGate(
  context: APIContext
): Promise<SessionUser | Response> {
  const user = await getAdmin(context);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!sameOrigin(context.request)) return json({ error: 'forbidden' }, 403);
  return user;
}

function allowedOrigins(request: Request): Set<string> {
  const set = new Set<string>();
  try {
    set.add(new URL(PUBLIC_SITE_URL).origin);
  } catch {
    /* ignore */
  }
  // The request's own origin covers localhost/dev and the live deployment.
  try {
    set.add(new URL(request.url).origin);
  } catch {
    /* ignore */
  }
  return set;
}

/**
 * CSRF defense-in-depth for state-changing requests: the Origin (or Referer)
 * must match an allowed origin. Same-origin fetches send Origin automatically.
 */
export function sameOrigin(request: Request): boolean {
  const allowed = allowedOrigins(request);
  const origin = request.headers.get('origin');
  if (origin) return allowed.has(origin);
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Preview-hardening for PUBLIC write endpoints (contact, subscribe): reject
 * requests whose Host isn't the production domain (or localhost for dev), so a
 * leaked preview URL can't write to the production DB or send mail. Belt-and-
 * suspenders with Vercel Deployment Protection.
 */
export function hostAllowed(request: Request): boolean {
  const host = request.headers.get('host') ?? '';
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(PUBLIC_SITE_URL).host);
  } catch {
    /* ignore */
  }
  allowed.add('localhost:4321');
  allowed.add('127.0.0.1:4321');
  return allowed.has(host);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return request.headers.get('x-real-ip');
}
