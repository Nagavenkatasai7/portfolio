// /api/newsletter/unsubscribe?token=... — the emailed opt-out link.
//
//   GET  (a human clicks the link in a mail client)  -> 303 to the
//        /newsletter/unsubscribed landing page.
//   POST (RFC 8058 List-Unsubscribe one-click, sent by mail clients — Phase N2
//        wires the List-Unsubscribe-Post header that triggers it) -> 200 JSON.
//
// Same unsubscribe logic for both; it NEVER errors to the user (a missing /
// unknown / already-unsubscribed token still resolves to a friendly result).
import { json, originFromRequest } from '@/lib/http';
import { unsubscribeToken } from '@/lib/newsletter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function doUnsub(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  await unsubscribeToken(token);
}

export async function GET(request) {
  await doUnsub(request);
  return new Response(null, {
    status: 303,
    headers: { Location: `${originFromRequest(request)}/newsletter/unsubscribed` },
  });
}

export async function POST(request) {
  await doUnsub(request);
  return json({ ok: true }, 200);
}
