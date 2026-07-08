// POST /api/newsletter/webhook — Resend delivery events (Phase N2).
//
// Verifies the Svix signature HAND-ROLLED with node:crypto (no `svix` dep — see
// lib/email/svix.js), then updates the delivery ledger:
//   email.delivered  -> send row 'delivered'
//   email.bounced    -> send row 'bounced'    + PERMANENTLY suppress subscriber
//   email.complained -> send row 'complained' + PERMANENTLY suppress subscriber
//   (any other type) -> 200, ignored
//
// Fail-closed + dormant: 503 when RESEND_WEBHOOK_SECRET is unset (or malformed),
// 401 on a bad / missing / stale signature. Rows are matched by Resend's
// data.email_id (the provider_message_id recorded when the row was sent).
//
// runtime=nodejs (service-role Supabase). We read the RAW body (request.text())
// because the signature is over the exact bytes, not a re-serialized object.
//
// Relative (not "@/") imports so scripts/newsletter-issues-verify.mjs can import
// this handler directly in plain Node and exercise the real 503/401/200 behavior
// without a server — the same testability convention the cron routes use.
import { json } from '../../../../lib/http.js';
import { verifyResendWebhook } from '../../../../lib/email/svix.js';
import { updateSendByProviderId, suppressSubscriber } from '../../../../lib/newsletter_issues.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A malformed/absent secret is a server config problem (503); anything about the
// REQUEST's signature is a client auth failure (401).
const CONFIG_ERRORS = new Set(['not_configured', 'bad_secret']);

export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'webhook_not_configured' }, 503);

  const body = await request.text();
  const verdict = verifyResendWebhook({
    secret,
    svixId: request.headers.get('svix-id'),
    svixTimestamp: request.headers.get('svix-timestamp'),
    signatureHeader: request.headers.get('svix-signature'),
    body,
  });
  if (!verdict.ok) {
    return json({ error: 'invalid_signature', reason: verdict.error }, CONFIG_ERRORS.has(verdict.error) ? 503 : 401);
  }

  let event;
  try { event = JSON.parse(body); } catch { return json({ error: 'invalid_json' }, 400); }
  const type = event?.type;
  const emailId = event?.data?.email_id;

  try {
    if (type === 'email.delivered') {
      await updateSendByProviderId(emailId, { status: 'delivered' });
    } else if (type === 'email.bounced') {
      const row = await updateSendByProviderId(emailId, { status: 'bounced' });
      if (row?.subscriber_id) await suppressSubscriber(row.subscriber_id, 'bounced');
    } else if (type === 'email.complained') {
      const row = await updateSendByProviderId(emailId, { status: 'complained' });
      if (row?.subscriber_id) await suppressSubscriber(row.subscriber_id, 'complained');
    } else {
      return json({ ok: true, ignored: type || 'unknown' }, 200);
    }
    return json({ ok: true, type }, 200);
  } catch (e) {
    // Best-effort: don't make Resend retry-storm on a transient DB hiccup.
    console.error('[newsletter-webhook] handler error:', e?.message || e);
    return json({ ok: false, error: 'handler_error' }, 200);
  }
}

export function GET() { return json({ error: 'method_not_allowed' }, 405); }
