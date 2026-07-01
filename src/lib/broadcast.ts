/**
 * Resend Broadcast sender for the weekly newsletter. Broadcasts auto-inject the
 * List-Unsubscribe / one-click (RFC 8058) headers and host the unsubscribe page,
 * satisfying Gmail/Yahoo/Microsoft bulk-sender rules. The content MUST contain
 * the {{{RESEND_UNSUBSCRIBE_URL}}} token — we ensure a footer with it exists.
 */
import { resend } from './resend';
import {
  NEWSLETTER_FROM,
  NEWSLETTER_REPLY_TO,
  NEWSLETTER_POSTAL_ADDRESS,
} from './env';

const UNSUB_TOKEN = '{{{RESEND_UNSUBSCRIBE_URL}}}';

export function ensureBroadcastFooter(html: string): string {
  if (html.includes(UNSUB_TOKEN)) return html;
  const addr = NEWSLETTER_POSTAL_ADDRESS
    ? `<p style="margin:6px 0 0;color:#8a8a92;font-size:12px">${NEWSLETTER_POSTAL_ADDRESS}</p>`
    : '';
  return `${html}
    <hr style="border:none;border-top:1px solid #e5e3db;margin:24px 0" />
    <p style="color:#8a8a92;font-size:12px;margin:0">
      You're receiving this because you confirmed a subscription at
      chennunagavenkatasai.com. <a href="${UNSUB_TOKEN}">Unsubscribe</a>.
    </p>${addr}`;
}

export type BroadcastResult = { id: string } | { error: string };

export async function sendBroadcast(opts: {
  subject: string;
  html: string;
  scheduledAt?: string;
}): Promise<BroadcastResult> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) return { error: 'RESEND_AUDIENCE_ID not configured' };

  const html = ensureBroadcastFooter(opts.html);

  try {
    const created = await resend().broadcasts.create({
      audienceId,
      from: NEWSLETTER_FROM,
      replyTo: NEWSLETTER_REPLY_TO,
      subject: opts.subject,
      html,
    });
    const id = created.data?.id;
    if (!id) return { error: created.error?.message ?? 'broadcast create failed' };

    const sent = await resend().broadcasts.send(
      id,
      opts.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}
    );
    if (sent.error) return { error: sent.error.message ?? 'broadcast send failed' };
    return { id };
  } catch {
    return { error: 'broadcast error' };
  }
}
