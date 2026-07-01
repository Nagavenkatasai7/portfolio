export const prerender = false;

import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { json } from '../../../lib/http';
import { logEvent } from '../../../lib/analytics';
import { setStatusByEmail } from '../../../lib/subscribers';

interface ResendEvent {
  type?: string;
  data?: {
    email?: string;
    to?: string[] | string;
    unsubscribed?: boolean;
  };
}

function emailOf(evt: ResendEvent): string | null {
  const d = evt.data ?? {};
  if (d.email) return d.email;
  if (Array.isArray(d.to)) return d.to[0] ?? null;
  if (typeof d.to === 'string') return d.to;
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'not configured' }, 500);

  // Verify the Svix signature against the RAW body BEFORE acting on anything.
  const payload = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };

  let evt: ResendEvent;
  try {
    evt = new Webhook(secret).verify(payload, headers) as ResendEvent;
  } catch {
    return json({ error: 'invalid signature' }, 400);
  }

  const type = evt.type ?? '';
  const email = emailOf(evt);

  try {
    switch (type) {
      case 'email.opened':
        await logEvent('email_open', { meta: { email } });
        break;
      case 'email.clicked':
        await logEvent('email_click', { meta: { email } });
        break;
      case 'email.bounced':
        if (email) await setStatusByEmail(email, 'bounced');
        await logEvent('bounce', { meta: { email } });
        break;
      case 'email.complained':
        if (email) await setStatusByEmail(email, 'complained');
        await logEvent('complaint', { meta: { email } });
        break;
      case 'contact.updated':
      case 'contact.deleted':
        // Resend's hosted unsubscribe flips the contact to unsubscribed.
        if (email && evt.data?.unsubscribed === true) {
          await setStatusByEmail(email, 'unsubscribed');
          await logEvent('unsubscribe', { meta: { email, via: 'resend' } });
        }
        break;
      default:
        // Ignore delivered/sent/etc.
        break;
    }
  } catch {
    /* never fail the webhook on a downstream write error */
  }

  return json({ ok: true });
};
