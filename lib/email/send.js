// ============================================================
// lib/email/send.js — transactional email via Resend (native fetch, NO SDK).
//
// The ONLY place that talks to the Resend HTTP API. No new npm dependency: a
// plain fetch() POST to https://api.resend.com/emails. Fails LOUD when the key
// is unset (throws a typed NotConfiguredError) so the caller (the subscribe
// route) can fail CLOSED with a 503 — the dormant-config pattern the admin auth
// routes use for an unset SESSION_SECRET — rather than silently dropping mail.
//
// server-only: this holds RESEND_API_KEY. Never import it from a client bundle.
// ============================================================
import 'server-only';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Sender identity. Override with NEWSLETTER_FROM (must be a Resend-verified
// domain — see RUNBOOK-NEWSLETTER.md); otherwise the Field Guide default.
const DEFAULT_FROM = 'The Field Guide <newsletter@chennunagavenkatasai.com>';

// Thrown when RESEND_API_KEY is unset. The subscribe route maps this to a 503
// (fail closed / dormant), exactly like admin login maps an unset SESSION_SECRET.
export class NotConfiguredError extends Error {
  constructor(message = 'email_not_configured') {
    super(message);
    this.name = 'NotConfiguredError';
    this.code = 'email_not_configured';
  }
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress() {
  return process.env.NEWSLETTER_FROM || DEFAULT_FROM;
}

// Low-level transport. POSTs one message to Resend. Throws NotConfiguredError
// when the key is unset; throws a generic Error (code 'send_failed') on a
// non-2xx Resend response. Returns Resend's parsed JSON ({ id, ... }) on success.
//
// `idempotencyKey` (optional): forwarded as Resend's `Idempotency-Key` request
// header. When set, Resend dedupes retries of the SAME key (24h window) so a
// process that dies AFTER Resend accepted a message but BEFORE our ledger
// flipped to 'sent' won't send that recipient a duplicate on the next batch.
// Purely additive: a mock/test sendFn ignores it, and omitting it is unchanged.
export async function sendEmail({ to, subject, html, text, headers, idempotencyKey } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new NotConfiguredError();

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey) } : {}),
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(headers ? { headers } : {}),
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
    const e = new Error(`resend_send_failed_${res.status}`);
    e.code = 'send_failed';
    e.status = res.status;
    e.detail = detail;
    throw e;
  }
  return res.json().catch(() => ({}));
}

// ---- The confirmation ("double opt-in") email ------------------------------

export const CONFIRM_SUBJECT = 'Confirm your Field Guide subscription';

// Escape a value for safe interpolation into HTML attributes/text. The URLs are
// our own (siteBaseUrl + a base64url token), but escape defensively anyway.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Email-safe HTML: table layout + inline CSS, 600px, a dark header card with a
// lime accent (the site's "Luminous" palette) so it reads as the same brand as
// chennunagavenkatasai.com. Renders in Gmail / Outlook / Apple Mail (no
// box-shadow, no external CSS, no web fonts). Companion plain-text twin below.
export function confirmationEmail({ confirmUrl, unsubUrl } = {}) {
  const cu = esc(confirmUrl);
  const uu = esc(unsubUrl);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(CONFIRM_SUBJECT)}</title>
</head>
<body style="margin:0; padding:0; background:#f3ead8; -webkit-text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#f3ead8; font-size:1px; line-height:1px;">One click confirms your subscription to The Field Guide — AI, explained like I'd explain it to a friend.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3ead8;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:100%; background:#fffdf7; border:1px solid #ddceb8; border-radius:12px; overflow:hidden;">
        <!-- dark header band with lime wordmark -->
        <tr>
          <td style="background:#171411; padding:26px 32px;">
            <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace; font-size:12px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;">
              <span style="color:#caff60;">The Field Guide</span><span style="color:#8a8078;">&nbsp;&middot;&nbsp;Every Tuesday</span>
            </div>
          </td>
        </tr>
        <!-- body -->
        <tr>
          <td style="padding:36px 32px 12px 32px;">
            <h1 style="margin:0 0 14px 0; font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:1.15; font-weight:700; color:#171411;">One click to confirm.</h1>
            <p style="margin:0 0 24px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.6; color:#423b34;">
              You're signing up for <strong>The Field Guide</strong> — one email a week with the three or four AI stories that actually matter, in plain English. Tap the button to confirm this address and you're in.
            </p>
          </td>
        </tr>
        <!-- pill button: dark fill + lime ring (email-safe echo of the site's lime-offset pill) -->
        <tr>
          <td style="padding:0 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:999px; background:#171411; border:2px solid #caff60;">
                  <a href="${cu}" style="display:inline-block; padding:14px 28px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px; font-weight:800; color:#ffffff; text-decoration:none;">Confirm my subscription &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 32px 32px;">
            <p style="margin:0 0 6px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#756b62;">Button not working? Paste this link into your browser:</p>
            <p style="margin:0; font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace; font-size:12px; line-height:1.5; word-break:break-all;"><a href="${cu}" style="color:#6e4d7d; text-decoration:underline;">${cu}</a></p>
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td style="border-top:1px solid #ddceb8; padding:22px 32px 28px 32px;">
            <p style="margin:0 0 8px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#8a8078;">
              You're getting this because someone entered this address at chennunagavenkatasai.com. <strong>Didn't sign up?</strong> Just ignore this email — you won't be added to anything, and this link expires on its own.
            </p>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#8a8078;">
              <a href="${uu}" style="color:#8a8078; text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    'The Field Guide — Every Tuesday',
    '',
    'One click to confirm.',
    '',
    "You're signing up for The Field Guide — one email a week with the three or",
    'four AI stories that actually matter, in plain English. Confirm this address',
    'by opening the link below and you\'re in:',
    '',
    confirmUrl,
    '',
    '—',
    "You're getting this because someone entered this address at",
    "chennunagavenkatasai.com. Didn't sign up? Just ignore this email — you won't",
    'be added to anything, and the link expires on its own.',
    '',
    `Unsubscribe: ${unsubUrl}`,
  ].join('\n');

  return { subject: CONFIRM_SUBJECT, html, text };
}

// Convenience: build + send the confirmation email. This is the sendFn the
// subscribe route injects into subscribeEmail(); tests inject a mock instead
// (so Resend is NEVER called from a test). The unsub link also rides in a
// List-Unsubscribe header (RFC 2369) for deliverability; RFC 8058 one-click
// (List-Unsubscribe-Post) is wired in Phase N2.
export async function sendConfirmationEmail({ to, email, confirmUrl, unsubUrl } = {}) {
  // Accept BOTH `to` and `email` for the recipient. lib/newsletter.js's
  // documented sendFn contract is `sendFn({ email, confirmUrl, unsubUrl })`,
  // but this adapter historically destructured only `to` — so every real
  // confirmation send posted `to: [null]` and Resend rejected it with a 422
  // ("The `to` field must be a `string`."). The DI mocks in the verify suite
  // matched the library contract, which is exactly why this seam was never
  // caught end-to-end. Fail LOUD here if the recipient is missing rather than
  // paying a doomed round-trip to Resend.
  const recipient = to ?? email;
  if (typeof recipient !== 'string' || !recipient) {
    const e = new Error('confirmation_email_missing_recipient');
    e.code = 'invalid_recipient';
    throw e;
  }
  const { subject, html, text } = confirmationEmail({ confirmUrl, unsubUrl });
  return sendEmail({
    to: recipient,
    subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
  });
}
