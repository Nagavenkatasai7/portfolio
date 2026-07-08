// GET/POST /api/cron/linkedin-sync — the scheduled READ-ONLY LinkedIn ingestion.
//
// Guarded by CRON_SECRET: Vercel sends `Authorization: Bearer $CRON_SECRET` to
// cron invocations when the env var is set, and this route rejects anything
// without the exact secret. Layers of inertness so it is safe to ship BEFORE
// the owner enables anything:
//   * If CRON_SECRET is unset -> 503 (can't authenticate; never runs).
//   * If the bearer is missing/wrong -> 401.
//   * If FGB_READONLY_DATABASE_URL is unset -> the sync no-ops with a clear
//     "not configured" 200 (dormant on deploy until the owner enables it).
//   * Vercel runs crons only on PRODUCTION, so previews never fire it anyway.
//
// runtime=nodejs because the sync uses the `pg` driver (not edge-compatible).
//
// Relative (not "@/") imports so scripts/phase-f-verify.mjs can import this
// handler directly in plain Node and exercise the real auth + no-op behavior
// without spinning up a server.
import { json } from '../../../../lib/http.js';
import { runLinkedinSync } from '../../../../lib/linkedin_sync.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Bearer check. Length-guarded equality; not constant-time, which is adequate
// for a high-entropy shared secret behind Vercel's edge.
function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && header === expected;
}

async function handle(request) {
  // Fail closed: no secret configured on this deployment => inert by design.
  if (!process.env.CRON_SECRET) {
    return json({ error: 'cron_not_configured' }, 503);
  }
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);

  const result = await runLinkedinSync();

  if (result.skipped === 'not_configured') {
    return json(
      { ok: true, skipped: 'not_configured', message: 'FGB_READONLY_DATABASE_URL unset — sync dormant.' },
      200,
    );
  }
  if (result.skipped === 'locked') {
    return json({ ok: true, skipped: 'locked' }, 200);
  }
  if (!result.ok) {
    return json({ ok: false, error: result.error, detail: result.detail || null }, 500);
  }
  return json({ ok: true, synced: result.synced, created: result.created, updated: result.updated }, 200);
}

export async function GET(request) {
  return handle(request);
}
export async function POST(request) {
  return handle(request);
}
