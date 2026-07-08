// ============================================================
// scripts/linkedin-backfill.mjs — one-shot historical import (owner-run).
//
//   npm run linkedin:backfill
//   (equivalently: node --conditions=react-server scripts/linkedin-backfill.mjs)
//
// Pulls ALL rows from the FGB contract view (no time window) through the SAME
// ingestion gate as the scheduled cron sync, for the initial import. This is
// how the owner seeds /blog with their existing LinkedIn history.
//
// DORMANT unless FGB_READONLY_DATABASE_URL is set. READ-ONLY against FGB. Fully
// idempotent — the gate upserts on (source, external_id), so running it twice
// (or after the cron has already synced) creates no duplicates. See
// RUNBOOK-LINKEDIN.md for the exact enable steps.
// ============================================================
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env.local — env comes from the shell / `vercel env pull` */
  }
}
loadEnvLocal();

if (!process.env.FGB_READONLY_DATABASE_URL) {
  console.error(
    'FGB_READONLY_DATABASE_URL is not set.\n' +
      'The LinkedIn sync is DORMANT until you enable it. Follow RUNBOOK-LINKEDIN.md to\n' +
      'create the least-privilege read-only role + contract view in FGB, export the\n' +
      'read-only connection string, then re-run this backfill.',
  );
  process.exit(2);
}

const hasSupabase =
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!hasSupabase) {
  console.error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Cannot write content.');
  process.exit(2);
}

const { runLinkedinSync } = await import('../lib/linkedin_sync.js');

console.log('LinkedIn backfill: pulling ALL posts from the FGB contract view (read-only)…');
const result = await runLinkedinSync({ all: true });
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  console.error('\nBackfill FAILED. The sync recorded the error in sync_state.last_error (visible on /admin).');
  process.exit(1);
}
if (result.skipped) {
  console.error(`\nBackfill did not run (skipped: ${result.skipped}).`);
  process.exit(1);
}
console.log(`\nBackfill complete: synced=${result.synced} created=${result.created} updated=${result.updated}.`);
console.log('Verify on /blog and check sync health on /admin.');
process.exit(0);
