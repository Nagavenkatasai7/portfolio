export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, hostAllowed, clientIp } from '../../../lib/http';
import { checkRateLimit } from '../../../lib/ratelimit';
import { verifyTurnstile } from '../../../lib/turnstile';
import { startSubscription, setResendContactId } from '../../../lib/subscribers';
import { createResendContact } from '../../../lib/audience';
import { sendEmail } from '../../../lib/resend';
import { confirmationEmail } from '../../../lib/emails';
import { PUBLIC_SITE_URL } from '../../../lib/env';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CONSENT_TEXT =
  'I agree to receive the weekly newsletter and accept the privacy policy.';

const SubscribeSchema = z.object({
  email: z.string().trim().max(200).regex(EMAIL_RE),
  company: z.string().max(200).optional().default(''), // honeypot
  ts: z.coerce.number().optional(),
  source: z.string().max(60).optional().default('site'),
  turnstileToken: z.string().max(4000).optional(),
});

// Identical response for sent / already-confirmed / throttled — never leak
// subscriber state, never allow this endpoint to email-bomb a victim.
const FRIENDLY = { ok: true, message: 'Check your inbox to confirm your subscription.' };

export const POST: APIRoute = async ({ request }) => {
  if (!hostAllowed(request)) return json({ error: 'forbidden' }, 403);

  const ip = clientIp(request) ?? 'unknown';
  const rl = await checkRateLimit('subscribe', ip, 5, '60 s');
  if (!rl.success) return json({ error: 'rate limited' }, 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation' }, 400);
  const data = parsed.data;

  if (data.company && data.company.length > 0) return json(FRIENDLY); // honeypot
  if (data.ts && Date.now() - data.ts < 3000) return json(FRIENDLY); // time-trap

  if (process.env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(data.turnstileToken ?? null, ip);
    if (!ok) return json({ error: 'captcha failed' }, 403);
  }

  const email = data.email.toLowerCase();

  let start;
  try {
    start = await startSubscription(email, {
      ip,
      userAgent: request.headers.get('user-agent'),
      source: data.source,
      consentText: CONSENT_TEXT,
    });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }

  if (start.action !== 'sent') return json(FRIENDLY); // already_confirmed | throttled

  // Create the Resend contact (unsubscribed until confirmed) and remember its id.
  const contactId = await createResendContact(email);
  if (contactId) {
    try {
      await setResendContactId(email, contactId);
    } catch {
      /* non-fatal */
    }
  }

  const confirmUrl = `${PUBLIC_SITE_URL}/newsletter/confirm?token=${encodeURIComponent(start.token)}`;
  const { html, text } = confirmationEmail(confirmUrl);
  try {
    const res = await sendEmail({
      to: email,
      subject: 'Confirm your subscription',
      html,
      text,
    });
    if (res.error) return json({ error: 'send failed' }, 502);
  } catch {
    return json({ error: 'send unavailable' }, 502);
  }

  return json(FRIENDLY);
};
