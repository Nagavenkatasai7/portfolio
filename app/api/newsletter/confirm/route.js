// GET /api/newsletter/confirm?token=... — the emailed double-opt-in link.
// Confirms the subscription (idempotent) and 303-redirects to a friendly
// landing page. A bad / expired / already-used-with-a-rotated token lands on
// /newsletter/pending?state=expired (offer to re-send), never an error screen.
import { originFromRequest } from '@/lib/http';
import { confirmToken } from '@/lib/newsletter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function seeOther(request, path) {
  return new Response(null, { status: 303, headers: { Location: `${originFromRequest(request)}${path}` } });
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const result = await confirmToken(token);
  if (result.ok) return seeOther(request, '/newsletter/confirmed');
  return seeOther(request, '/newsletter/pending?state=expired');
}
