// ============================================================
// scripts/apply-migrations.mjs — apply supabase/migrations/*.sql with psql.
//
//   node scripts/apply-migrations.mjs
//
// Connection string is read from (in order) SUPABASE_DB_URL,
// POSTGRES_URL_NON_POOLING, POSTGRES_URL. It is GUARDED to a Supabase host:
// this project's Vercel env also carries a Neon POSTGRES_URL, so the guard
// refuses to run against anything that isn't *.supabase.co / *.supabase.com /
// *.pooler.supabase.com — you cannot accidentally migrate the Neon database.
//
// Requires the psql client on PATH (e.g. `brew install libpq`).
// ============================================================
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'supabase', 'migrations');

function loadEnvLocal() {
  try {
    const txt = readFileSync(join(here, '..', '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fine */ }
}

loadEnvLocal();

const conn =
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!conn) {
  console.error('No connection string. Set SUPABASE_DB_URL (or POSTGRES_URL_NON_POOLING) after connecting Supabase + `vercel env pull`.');
  process.exit(2);
}

let host = '';
try { host = new URL(conn).host.toLowerCase(); } catch { /* ignore */ }
const isSupabase = /(^|\.)supabase\.(co|com)$|pooler\.supabase\.com$|\.supabase\.co:|\.supabase\.com:/.test(host)
  || host.includes('supabase.');
if (!isSupabase) {
  console.error(`REFUSING to run: connection host "${host}" is not a Supabase host.`);
  console.error('This guard prevents migrating the Neon database that also lives in this project\'s env.');
  process.exit(3);
}

// psql available?
const probe = spawnSync('psql', ['--version'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error('psql not found on PATH. Install it (e.g. `brew install libpq` then add its bin to PATH).');
  process.exit(4);
}

const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
console.log(`Applying ${files.length} migration(s) to ${host}\n`);

for (const f of files) {
  const path = join(migrationsDir, f);
  console.log(`--> ${f}`);
  const res = spawnSync('psql', [conn, '-v', 'ON_ERROR_STOP=1', '-f', path], {
    encoding: 'utf8', stdio: 'inherit', env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE || 'require' },
  });
  if (res.status !== 0) {
    console.error(`\nMigration ${f} FAILED (exit ${res.status}). Stopping.`);
    process.exit(res.status || 1);
  }
}
console.log('\nAll migrations applied.');
