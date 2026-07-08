// GET/POST /api/cron/newsletter-send — the scheduled ARMED-QUEUE issue sender.
//
// Guarded by CRON_SECRET (the SAME shared secret Vercel sends to every cron on
// this project): `Authorization: Bearer $CRON_SECRET`. Layers of inertness so it
// is safe to ship BEFORE the owner enables sending:
//   * CRON_SECRET unset            -> 503 (can't authenticate; never runs).
//   * bearer missing / wrong       -> 401.
//   * Nothing approved + not mid-send -> the cycle no-ops silently (200 ok).
//   * RESEND_API_KEY unset         -> a send ATTEMPT fails, is recorded as a
//     failed ledger row, and the cycle returns fail-safe (200 {ok:false}); no
//     issue is ever half-published without a way to see it in /admin.
//
// The whole cycle lives in lib/newsletter_issues.js#runNewsletterCron (single-
// flight advisory lock on 'newsletter', Tuesday-in-New-York pick, batch drain,
// health recorded in sync_state). It NEVER throws; on any internal error it
// returns { ok:false } and this route answers 200 so the dead-man's-switch card
// (not a 500 alert storm) is the signal — exactly like the LinkedIn cron.
//
// runtime=nodejs (service-role Supabase + Resend fetch). Relative imports so the
// verify script can import this handler directly and exercise auth in plain Node.
import { timingSafeEqual } from 'node:crypto';
import { json } from '../../../../lib/http.js';
import { runNewsletterCron } from '../../../../lib/newsletter_issues.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Constant-time bearer check (matches app/api/cron/linkedin-sync/route.js).
function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function handle(request) {
  if (!process.env.CRON_SECRET) return json({ error: 'cron_not_configured' }, 503);
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);

  const result = await runNewsletterCron();

  // Fail-safe: internal errors return 200 {ok:false} (recorded in sync_state
  // health) so the admin card is the signal, not a paging 5xx.
  const status = result.ok === false && result.error === 'server_not_configured' ? 503 : 200;
  return json(result, status);
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
