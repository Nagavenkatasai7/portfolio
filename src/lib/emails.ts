/**
 * Email templates (inline-styled, table-safe HTML + matching plaintext).
 * No <script>, no external CSS — email clients strip those anyway.
 */
import { NEWSLETTER_POSTAL_ADDRESS } from './env';

const INK = '#0f0f12';
const MUTED = '#5a5a62';

function footer(): string {
  const addr = NEWSLETTER_POSTAL_ADDRESS
    ? `<p style="margin:8px 0 0;color:#8a8a92;font-size:12px">${NEWSLETTER_POSTAL_ADDRESS}</p>`
    : '';
  return `
    <p style="margin:24px 0 0;color:#8a8a92;font-size:12px">
      You are receiving this because you asked to confirm your subscription at
      chennunagavenkatasai.com. If this wasn't you, ignore this email — no
      subscription is created until you confirm.
    </p>${addr}`;
}

export function confirmationEmail(confirmUrl: string): {
  html: string;
  text: string;
} {
  const html = `<!doctype html>
<html><body style="margin:0;background:#fafaf7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf7">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e3db;border-radius:12px">
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px;color:${INK};font-size:22px">Confirm your subscription</h1>
          <p style="margin:0 0 20px;color:${MUTED};font-size:15px;line-height:1.6">
            Thanks for signing up for the weekly newsletter — tech tutorials and a
            curated links roundup. Please confirm your email to start receiving it.
          </p>
          <p style="margin:0 0 24px">
            <a href="${confirmUrl}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:15px">Confirm subscription</a>
          </p>
          <p style="margin:0;color:#8a8a92;font-size:13px;word-break:break-all">
            Or paste this link into your browser:<br />${confirmUrl}
          </p>
          ${footer()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    'Confirm your subscription',
    '',
    'Thanks for signing up for the weekly newsletter (tech tutorials + a curated links roundup).',
    'Confirm your email to start receiving it:',
    confirmUrl,
    '',
    "If this wasn't you, ignore this email — no subscription is created until you confirm.",
    NEWSLETTER_POSTAL_ADDRESS,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}
