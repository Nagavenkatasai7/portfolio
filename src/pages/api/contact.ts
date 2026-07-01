export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, hostAllowed, clientIp } from '../../lib/http';
import { checkRateLimit } from '../../lib/ratelimit';
import { verifyTurnstile } from '../../lib/turnstile';
import { sql } from '../../lib/db';
import { sendEmail } from '../../lib/resend';
import { logEvent } from '../../lib/analytics';
import { CONTACT_TO } from '../../lib/env';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).regex(EMAIL_RE),
  subject: z.string().trim().max(200).optional().default(''),
  message: z.string().trim().min(1).max(5000),
  // Honeypot: real users leave this empty. Any value -> silently dropped.
  company: z.string().max(200).optional().default(''),
  // Client-set page-load time for the min-time trap.
  ts: z.coerce.number().optional(),
  turnstileToken: z.string().max(4000).optional(),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const POST: APIRoute = async ({ request }) => {
  if (!hostAllowed(request)) return json({ error: 'forbidden' }, 403);

  const ip = clientIp(request) ?? 'unknown';
  const rl = await checkRateLimit('contact', ip, 5, '60 s');
  if (!rl.success) return json({ error: 'rate limited' }, 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation' }, 400);
  const data = parsed.data;

  // Honeypot + time-trap: accept (200) but silently drop suspected bots.
  if (data.company && data.company.length > 0) return json({ ok: true });
  if (data.ts && Date.now() - data.ts < 3000) return json({ ok: true });

  // Turnstile — only enforced when configured (so local dev works without it).
  if (process.env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(data.turnstileToken ?? null, ip);
    if (!ok) return json({ error: 'captcha failed' }, 403);
  }

  const ua = request.headers.get('user-agent') ?? '';

  // Persist (best-effort — do not fail the whole request if the DB is down).
  try {
    await sql`
      INSERT INTO contact_messages (name, email, subject, message, ip, user_agent)
      VALUES (${data.name}, ${data.email}, ${data.subject || null}, ${data.message}, ${ip}, ${ua})`;
  } catch {
    /* continue — email is the primary delivery path */
  }

  const html = `
    <p><strong>From:</strong> ${escapeHtml(data.name)} &lt;${escapeHtml(data.email)}&gt;</p>
    ${data.subject ? `<p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>` : ''}
    <p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>`;
  const text = `From: ${data.name} <${data.email}>\n${
    data.subject ? `Subject: ${data.subject}\n` : ''
  }\n${data.message}`;

  try {
    const result = await sendEmail({
      to: CONTACT_TO,
      replyTo: data.email,
      subject: `Portfolio contact: ${data.subject || 'New message'}`,
      html,
      text,
    });
    if (result.error) return json({ error: 'send failed' }, 502);
  } catch {
    return json({ error: 'send unavailable' }, 502);
  }

  await logEvent('contact_submit');
  return json({ ok: true });
};
