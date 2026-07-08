// ============================================================
// scripts/gate-verify.mjs — verification for the ingestion gate.
//
//   node scripts/gate-verify.mjs
//
// Part A (always runs, no DB): URL canonicalization + item normalization —
//   proves "same URL with different tracking params => one identity".
// Part B (runs only when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set):
//   live dedupe against the real Supabase — re-ingest updates, not duplicates,
//   and a draft stays out of public_content. Temp rows are deleted afterward.
// ============================================================
import { readFileSync } from 'node:fs';
import { canonicalizeUrl, normalizeItem, GateError } from '../lib/canonical.js';

let failures = 0;
function ok(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}
function throws(name, fn, code) {
  try { fn(); ok(name, false); }
  catch (e) { ok(name, e instanceof GateError && e.code === code); }
}

// Load .env.local (if present) so Part B can pick up pulled creds.
function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* no .env.local — fine */ }
}

console.log('\n== Part A: canonicalization + normalization (no DB) ==');

// Same post, different tracking params + www + trailing slash + fragment => same id.
const a = canonicalizeUrl('https://www.linkedin.com/posts/foo?utm_source=nl&utm_medium=email&ref=home#top');
const b = canonicalizeUrl('https://linkedin.com/posts/foo/');
ok('linkedin: tracking/www/slash/fragment collapse to one id', a === b && a === 'https://linkedin.com/posts/foo');

// x/twitter share params s & t are tracking.
const x1 = canonicalizeUrl('https://x.com/naga/status/123?s=20&t=abcdef');
const x2 = canonicalizeUrl('https://x.com/naga/status/123');
ok('x.com: strips s/t share params', x1 === x2 && x1 === 'https://x.com/naga/status/123');

// Meaningful query params survive and are order-normalized.
const q1 = canonicalizeUrl('https://ex.com/a?b=2&a=1&utm_source=x');
ok('keeps real params, drops utm_, sorts', q1 === 'https://ex.com/a?a=1&b=2');

// Non-URL slug passes through untouched.
ok('slug passthrough', canonicalizeUrl('my-first-post') === 'my-first-post');

// Uppercase host lowercased, default port dropped.
ok('host lowercased + default port dropped',
  canonicalizeUrl('HTTPS://Example.COM:443/Path/') === 'https://example.com/Path');

// normalizeItem: two items, same post, different tracking => identical external_id.
const n1 = normalizeItem({ source: 'linkedin_manual', type: 'text', url: 'https://x.com/n/status/9?s=09', published_at: '2026-01-02T03:04:05Z' });
const n2 = normalizeItem({ source: 'linkedin_manual', type: 'text', url: 'https://x.com/n/status/9?t=zzz&s=77', published_at: '2026-06-06T00:00:00Z' });
ok('normalizeItem: dedupe identity matches across tracking params', n1.p_external_id === n2.p_external_id);
ok('normalizeItem: published_at normalized to UTC ISO', n1.p_published_at === '2026-01-02T03:04:05.000Z');

// Validation failures are typed GateErrors.
throws('rejects unknown source', () => normalizeItem({ source: 'tiktok', type: 't', published_at: '2026-01-01' }), 'invalid_source');
throws('rejects missing type', () => normalizeItem({ source: 'blog', published_at: '2026-01-01' }), 'invalid_type');
throws('rejects missing published_at', () => normalizeItem({ source: 'blog', type: 'blog', slug: 's' }), 'missing_published_at');
throws('rejects bad published_at', () => normalizeItem({ source: 'blog', type: 'blog', slug: 's', published_at: 'not-a-date' }), 'invalid_published_at');
throws('rejects missing external id', () => normalizeItem({ source: 'blog', type: 'blog', published_at: '2026-01-01' }), 'missing_external_id');

// ---- Part B: live dedupe against real Supabase (guarded) --------------------
async function partB() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log('\n== Part B: live dedupe (real Supabase) ==');
  if (!url || !serviceKey) {
    console.log('SKIP  Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset). Connect the resource, `vercel env pull`, then re-run.');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
  const stamp = `verify-${Date.now()}`;

  const pub = normalizeItem({ source: 'x_manual', type: 'text', url: `https://x.com/verify/status/${stamp}?s=20`, title: 'pub', published_at: '2026-01-01T00:00:00Z' });
  const pubAgain = normalizeItem({ source: 'x_manual', type: 'text', url: `https://x.com/verify/status/${stamp}?t=xyz`, title: 'pub-edited', published_at: '2026-05-05T00:00:00Z' });
  const draft = normalizeItem({ source: 'blog', type: 'blog', slug: `${stamp}-draft`, status: 'draft', title: 'draft', body_md: 'secret', published_at: '2026-01-01T00:00:00Z' });

  try {
    const r1 = await svc.rpc('ingest_content', pub);
    const r2 = await svc.rpc('ingest_content', pubAgain);
    const created1 = r1.data?.[0]?.created, id1 = r1.data?.[0]?.id;
    const created2 = r2.data?.[0]?.created, id2 = r2.data?.[0]?.id;
    ok('first ingest creates', r1.error == null && created1 === true);
    ok('second ingest (diff tracking) UPDATES, same row', r2.error == null && created2 === false && id1 === id2);

    const { count } = await svc.from('content').select('id', { count: 'exact', head: true })
      .eq('source', 'x_manual').eq('external_id', pub.p_external_id);
    ok('exactly one row for the dedupe key', count === 1);

    // published_at not reset on conflict.
    const { data: row } = await svc.from('content').select('published_at,title').eq('id', id1).single();
    ok('published_at preserved on update', row?.published_at?.startsWith('2026-01-01'));
    ok('content fields updated on conflict', row?.title === 'pub-edited');

    await svc.rpc('ingest_content', draft);
    if (anonKey) {
      const anon = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data: pubView } = await anon.from('public_content').select('id,title').eq('id', id1);
      ok('published row visible via public_content (anon)', Array.isArray(pubView) && pubView.length === 1);
      const { data: draftView } = await anon.from('public_content').select('id').eq('source', 'blog').eq('type', 'blog').ilike('title', 'draft');
      ok('draft NOT visible via public_content (anon)', Array.isArray(draftView) && draftView.length === 0);
    } else {
      console.log('SKIP  anon-view checks (SUPABASE_ANON_KEY unset)');
    }
  } finally {
    // Cleanup temp rows.
    await svc.from('content').delete().eq('source', 'x_manual').eq('external_id', pub.p_external_id);
    await svc.from('content').delete().eq('source', 'blog').eq('external_id', draft.p_external_id);
    console.log('cleanup: temp rows deleted');
  }
}

await partB();

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
