/**
 * Resend client + a small send helper.
 * Client is created lazily so RESEND_API_KEY is only needed at runtime.
 */
import { Resend } from 'resend';
import { requireEnv, NEWSLETTER_FROM, NEWSLETTER_REPLY_TO } from './env';

let client: Resend | null = null;

export function resend(): Resend {
  if (!client) {
    client = new Resend(requireEnv('RESEND_API_KEY'));
  }
  return client;
}

export interface SendArgs {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/**
 * Send a transactional email. Resend returns `{ data, error }` and never throws
 * on API errors, so callers must check the returned `error`.
 */
export async function sendEmail(args: SendArgs) {
  return resend().emails.send({
    from: args.from ?? NEWSLETTER_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: args.replyTo ?? NEWSLETTER_REPLY_TO,
    headers: args.headers,
  });
}
