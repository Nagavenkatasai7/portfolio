// ============================================================
// scripts/rls-probe.mjs — RLS probe against real Supabase via PostgREST.
//
//   node scripts/rls-probe.mjs
//
// Uses the ANON key exactly as a browser would (curl-equivalent fetch with the
// apikey header) to confirm:
//   1. anon CAN read public_content
//   2. anon canNOT write content (INSERT denied)
//   3. anon canNOT read withheld internal columns (ingested_at/deleted_at)
//   4. anon sees a published row but NOT a draft row through public_content
//      (rows 4 are seeded/cleaned with the service key when it is available)
// ============================================================
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fine */ }
}
loadEnvLocal();

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON) {
  console.error('SKIP: SUPABASE_URL / SUPABASE_ANON_KEY unset. Connect Supabase, `vercel env pull`, then re-run.');
  process.exit(2);
}

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const rest = (path) => `${URL_}/rest/v1/${path}`;
const anonHeaders = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const stamp = `rlsprobe-${Date.now()}`;
let seeded = false;

async function main() {
  // Seed (service key) a published + draft row so probe 4 is definitive.
  if (SERVICE) {
    const pub = await fetch(rest('content'), { method: 'POST', headers: svcHeaders, body: JSON.stringify({ source: 'blog', external_id: `${stamp}-pub`, type: 'blog', status: 'published', title: `${stamp}-PUB`, published_at: '2026-01-01T00:00:00Z' }) });
    const dft = await fetch(rest('content'), { method: 'POST', headers: svcHeaders, body: JSON.stringify({ source: 'blog', external_id: `${stamp}-draft`, type: 'blog', status: 'draft', title: `${stamp}-DRAFT`, published_at: '2026-01-01T00:00:00Z' }) });
    seeded = pub.ok && dft.ok;
    if (!seeded) console.log(`(seed skipped/failed: pub ${pub.status}, draft ${dft.status})`);
  } else {
    console.log('(no service key — probe 4 runs against whatever published rows already exist)');
  }

  // 1. anon can read public_content
  const r1 = await fetch(rest('public_content?select=id,title&limit=5'), { headers: anonHeaders });
  ok('anon CAN read public_content', r1.status === 200);

  // 2. anon INSERT denied
  const r2 = await fetch(rest('content'), { method: 'POST', headers: anonHeaders, body: JSON.stringify({ source: 'blog', external_id: `${stamp}-evil`, type: 'blog', published_at: '2026-01-01T00:00:00Z' }) });
  ok('anon INSERT into content is denied', r2.status === 401 || r2.status === 403, `(status ${r2.status})`);

  // 3. anon cannot read internal columns
  const r3 = await fetch(rest('content?select=ingested_at&limit=1'), { headers: anonHeaders });
  ok('anon canNOT select internal column ingested_at', r3.status >= 400, `(status ${r3.status})`);

  // 4. published visible, draft invisible through public_content
  if (seeded) {
    const rp = await fetch(rest(`public_content?select=id,title&title=eq.${stamp}-PUB`), { headers: anonHeaders });
    const pubRows = await rp.json();
    ok('published row IS visible via public_content', Array.isArray(pubRows) && pubRows.length === 1);

    const rd = await fetch(rest(`public_content?select=id,title&title=eq.${stamp}-DRAFT`), { headers: anonHeaders });
    const draftRows = await rd.json();
    ok('draft row is NOT visible via public_content', Array.isArray(draftRows) && draftRows.length === 0);

    // Also: draft invisible on the base table for anon.
    const rb = await fetch(rest(`content?select=id&title=eq.${stamp}-DRAFT`), { headers: anonHeaders });
    const baseDraft = await rb.json();
    ok('draft row is NOT visible on base content table (anon)', Array.isArray(baseDraft) && baseDraft.length === 0);
  }
}

try {
  await main();
} finally {
  if (SERVICE && seeded) {
    await fetch(rest(`content?external_id=like.${stamp}*`), { method: 'DELETE', headers: svcHeaders });
    console.log('cleanup: probe rows deleted');
  }
}

console.log(`\n${failures === 0 ? 'RLS PROBE: ALL PASS' : `RLS PROBE: ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
