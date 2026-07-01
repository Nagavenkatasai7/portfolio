export const prerender = false;

import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { safeEqual } from '../../../lib/tokens';
import { sql } from '../../../lib/db';

// Monthly retention purge (Vercel Cron). Fail-closed on CRON_SECRET, like the
// draft cron.
export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return json({ error: 'not configured' }, 500);
  if (!safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    // Drop old analytics events.
    await sql`DELETE FROM analytics_events WHERE created_at < now() - interval '400 days'`;
    // Anonymize IPs on old contact messages.
    await sql`UPDATE contact_messages SET ip = NULL
              WHERE ip IS NOT NULL AND created_at < now() - interval '180 days'`;
    // Anonymize consent IPs for long-unsubscribed contacts.
    await sql`UPDATE subscribers SET signup_ip = NULL, confirm_ip = NULL
              WHERE status = 'unsubscribed' AND unsubscribed_at < now() - interval '180 days'`;
    return json({ ok: true });
  } catch {
    return json({ error: 'purge failed' }, 503);
  }
};
