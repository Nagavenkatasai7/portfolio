/**
 * Server-side Cloudflare Turnstile verification. The secret is read at runtime
 * and NEVER exposed to the client (only PUBLIC_TURNSTILE_SITE_KEY is public).
 */
import { requireEnv } from './env';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams();
  body.set('secret', requireEnv('TURNSTILE_SECRET'));
  body.set('response', token);
  if (ip) body.set('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
