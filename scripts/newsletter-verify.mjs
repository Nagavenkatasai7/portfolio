// ============================================================
// scripts/newsletter-verify.mjs — end-to-end verification for Phase N1
// (The Field Guide newsletter: public signup + double opt-in).
//
//   node --conditions=react-server scripts/newsletter-verify.mjs
//   (npm run verify:newsletter)
//
// --conditions=react-server lets this plain-Node process import the REAL
// server-only lib/newsletter.js exactly as the app does, so we exercise the
// true double-opt-in write path — not a re-implementation. Resend is NEVER
// called: subscribeEmail's sendFn is dependency-injected with a mock that just
// records the confirm/unsub URLs (from which we recover the raw tokens).
//
// What it does (SKIPs cleanly if Supabase creds are unset):
//   1. LIB level (in-process, real Supabase + mock sendFn): new -> pending +
//      token (hash-only) + email; confirm -> active; repeat confirm -> already;
//      unsub -> unsubscribed; re-subscribe after unsub -> pending again;
//      active re-subscribe -> ok, NO email; complained/bounced re-subscribe ->
//      ok, NO email; pending re-send throttle (<=1/hour); token expiry;
//      enumeration shape (identical response new vs existing) + invalid email.
//   2. RLS probe: anon (PostgREST) canNOT select or insert newsletter_subscribers.
//   3. ROUTE level (cold build + `next start` with RESEND_API_KEY unset):
//      subscribe -> 503 (dormant gate); a burst trips 429 (rate limit);
//      honeypot -> 200 ok with NO row created.
//   Cleans up every test row (+ rate-limit rows) in a try/finally.
// ============================================================
import { readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { subscribeEmail, confirmToken, unsubscribeToken } from '../lib/newsletter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3220;
const BASE = `http://127.0.0.1:${PORT}`;
const TABLE = 'newsletter_subscribers';
const RL_ROUTE = 'newsletter:subscribe';

// ---- env ----
function loadEnvLocal() {
  try {
    const txt = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fine */ }
}
loadEnvLocal();

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SB_ORIGIN = (SB_URL || '').replace(/\/+$/, '');

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokenFromUrl = (u) => new URL(u).searchParams.get('token');

if (!SB_URL || !SB_SVC) {
  console.log('SKIP  Supabase creds unset (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). `vercel env pull`, then re-run.');
  process.exit(0);
}

const svc = createClient(SB_URL, SB_SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const STAMP = Date.now();
const E = (tag) => `nlv${STAMP}${tag}@example.com`; // all test emails share the nlv<STAMP> prefix
const row = async (email) => (await svc.from(TABLE).select('*').eq('email', email).maybeSingle()).data;

// A mock sendFn: records the call, NEVER touches Resend.
let sends = [];
const mockSend = async (args) => { sends.push(args); };
const resetSends = () => { sends = []; };

// ---- server lifecycle (route-level tests) ----
function runBuild() {
  try { rmSync(join(ROOT, '.next'), { recursive: true, force: true }); } catch { /* fine */ }
  console.log('\n[route] npm run build (cold) ...');
  const res = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8', env: process.env });
  const clean = res.status === 0;
  ok('route: build succeeds', clean, clean ? '' : (res.stderr || '').slice(-400));
  return clean;
}

async function startServerNoResend() {
  // RESEND_API_KEY='' (present but empty) so @next/env will NOT override it from
  // .env.local — the server sees email as unconfigured and the subscribe route
  // fails closed (503). No real email can be sent.
  const env = { ...process.env, RESEND_API_KEY: '' };
  const child = spawn(join(ROOT, 'node_modules', '.bin', 'next'), ['start', '-p', String(PORT)], {
    cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try {
      const r = await fetch(`${BASE}/api/health`, { cache: 'no-store' });
      if (r.ok) return child;
    } catch { /* not up yet */ }
    if (child.exitCode != null) break;
  }
  throw new Error('server did not become ready:\n' + log.slice(-600));
}

function stopServer(child) {
  if (!child || child.pid == null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* */ } }
}

async function subscribePost(body) {
  return fetch(`${BASE}/api/newsletter/subscribe`, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ============================================================
async function libTests() {
  console.log('\n== LIB level: double-opt-in lifecycle (real Supabase, mock sendFn) ==');

  // 1. NEW -> pending + hashed token + one confirm email.
  resetSends();
  const eNew = E('new');
  const r1 = await subscribeEmail({ email: eNew, source: 'test', ipHash: 'iphash123', sendFn: mockSend });
  ok('new: returns generic ok', r1.ok === true);
  ok('new: exactly one confirm email sent', sends.length === 1 && sends[0].email === eNew);
  const rowNew = await row(eNew);
  ok('new: row exists and is pending', !!rowNew && rowNew.status === 'pending');
  ok('new: source + ip_hash stored', rowNew?.source === 'test' && rowNew?.ip_hash === 'iphash123');
  ok('new: confirm_token_hash is a 64-char sha256 hex', /^[0-9a-f]{64}$/.test(rowNew?.confirm_token_hash || ''));
  ok('new: unsub_token_hash present', !!rowNew?.unsub_token_hash);
  const rawConfirm = tokenFromUrl(sends[0].confirmUrl);
  const rawUnsub = tokenFromUrl(sends[0].unsubUrl);
  ok('new: emailed raw confirm token hashes to the STORED hash (raw never stored)',
    sha256hex(rawConfirm) === rowNew?.confirm_token_hash);
  ok('new: raw token is NOT the stored value', rawConfirm !== rowNew?.confirm_token_hash);

  // 2. CONFIRM -> active.
  const c1 = await confirmToken(rawConfirm);
  ok('confirm: ok (not already)', c1.ok === true && !c1.already);
  const rowC = await row(eNew);
  ok('confirm: status active + confirmed_at set', rowC?.status === 'active' && !!rowC?.confirmed_at);

  // 3. REPEAT confirm -> already (idempotent).
  const c2 = await confirmToken(rawConfirm);
  ok('repeat confirm: { ok, already:true }', c2.ok === true && c2.already === true);

  // 4. ACTIVE re-subscribe -> ok, NO email.
  resetSends();
  const r2 = await subscribeEmail({ email: eNew, sendFn: mockSend });
  ok('active re-subscribe: ok', r2.ok === true);
  ok('active re-subscribe: NO email sent', sends.length === 0);

  // 5. UNSUB -> unsubscribed (using the unsub token from the initial email).
  const u1 = await unsubscribeToken(rawUnsub);
  ok('unsub: ok', u1.ok === true);
  const rowU = await row(eNew);
  ok('unsub: status unsubscribed + unsubscribed_at set', rowU?.status === 'unsubscribed' && !!rowU?.unsubscribed_at);

  // 6. RE-SUBSCRIBE after unsub -> pending again + email.
  resetSends();
  const r3 = await subscribeEmail({ email: eNew, sendFn: mockSend });
  ok('re-subscribe after unsub: ok', r3.ok === true);
  ok('re-subscribe after unsub: one email sent', sends.length === 1);
  const rowR = await row(eNew);
  ok('re-subscribe after unsub: pending again, unsubscribed_at cleared',
    rowR?.status === 'pending' && rowR?.unsubscribed_at === null);

  // 7. Permanent suppression: complained + bounced -> ok, NO email, not resurrected.
  const eComp = E('comp');
  await svc.from(TABLE).insert({ email: eComp, status: 'complained', unsub_token_hash: `comp${STAMP}` });
  resetSends();
  const rc = await subscribeEmail({ email: eComp, sendFn: mockSend });
  ok('complained re-subscribe: ok', rc.ok === true);
  ok('complained re-subscribe: NO email sent', sends.length === 0);
  ok('complained: still complained (not resurrected)', (await row(eComp))?.status === 'complained');

  const eBounced = E('bounce');
  await svc.from(TABLE).insert({ email: eBounced, status: 'bounced', unsub_token_hash: `bnc${STAMP}` });
  resetSends();
  const rb = await subscribeEmail({ email: eBounced, sendFn: mockSend });
  ok('bounced re-subscribe: ok + NO email sent', rb.ok === true && sends.length === 0);

  // 8. PENDING re-send throttle (<= once/hour).
  const eThrot = E('throt');
  resetSends();
  await subscribeEmail({ email: eThrot, sendFn: mockSend }); // insert pending + send #1
  ok('throttle setup: first send happened', sends.length === 1);
  resetSends();
  const t1 = await subscribeEmail({ email: eThrot, sendFn: mockSend }); // immediate re-subscribe
  ok('pending re-send within 1h: ok, NO new email', t1.ok === true && sends.length === 0);
  await svc.from(TABLE).update({ confirm_sent_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }).eq('email', eThrot);
  resetSends();
  await subscribeEmail({ email: eThrot, sendFn: mockSend }); // now > 1h -> re-send
  ok('pending re-send after 1h: email re-sent', sends.length === 1);

  // 9. TOKEN EXPIRY.
  const eExp = E('exp');
  resetSends();
  await subscribeEmail({ email: eExp, sendFn: mockSend });
  const rawExp = tokenFromUrl(sends[0].confirmUrl);
  await svc.from(TABLE).update({ confirm_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('email', eExp);
  const ce = await confirmToken(rawExp);
  ok('expiry: expired token rejected (error:expired)', ce.ok === false && ce.error === 'expired');
  ok('expiry: row stays pending (not activated)', (await row(eExp))?.status === 'pending');

  // 10. ENUMERATION shape: identical response for a brand-new vs an existing address.
  resetSends();
  const enNew = await subscribeEmail({ email: E('enum'), sendFn: mockSend }); // brand new
  const enExisting = await subscribeEmail({ email: eComp, sendFn: mockSend }); // existing (complained)
  ok('enumeration: IDENTICAL response new vs existing',
    JSON.stringify(enNew) === JSON.stringify(enExisting) && enNew.ok === true);

  // invalid email -> distinguishable validation error (not an enumeration signal).
  const inv = await subscribeEmail({ email: 'not-an-email', sendFn: mockSend });
  ok('invalid email -> { ok:false, invalid_email }', inv.ok === false && inv.error === 'invalid_email');
}

async function rlsProbe() {
  console.log('\n== RLS probe: anon canNOT touch newsletter_subscribers (PII) ==');
  if (!SB_ANON) { console.log('SKIP  anon key unset — cannot run the anon PostgREST probe.'); return; }
  const rest = (p) => `${SB_ORIGIN}/rest/v1/${p}`;
  const anonH = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' };

  const sel = await fetch(rest('newsletter_subscribers?select=email&limit=1'), { headers: anonH, cache: 'no-store' });
  ok('RLS: anon SELECT newsletter_subscribers denied', sel.status >= 400, `(${sel.status})`);

  const ins = await fetch(rest('newsletter_subscribers'), {
    method: 'POST', headers: anonH, body: JSON.stringify({ email: E('rls') }),
  });
  ok('RLS: anon INSERT newsletter_subscribers denied', ins.status === 401 || ins.status === 403, `(${ins.status})`);
}

async function routeTests() {
  console.log('\n== ROUTE level: dormant 503 + rate-limit burst + honeypot (RESEND unset) ==');
  if (!runBuild()) return;
  let server = null;
  try {
    server = await startServerNoResend();

    // 503 dormant gate.
    await svc.from('auth_rate_limit').delete().eq('route', RL_ROUTE);
    const r503 = await subscribePost({ email: E('r503') });
    ok('route: subscribe -> 503 when RESEND_API_KEY unset', r503.status === 503, `(${r503.status})`);

    // SAFETY: only proceed to fire more requests if the server is provably in the
    // dormant (email-disabled) state. If it isn't 503, RESEND is somehow live and
    // a burst could attempt a REAL send — refuse to continue.
    if (r503.status !== 503) {
      ok('route: ABORT burst — server not dormant, refusing to risk a real send', false);
      return;
    }

    // Rate-limit burst (limit is 5/10min): 6th+ request trips 429; the allowed
    // ones hit the 503 dormant gate (so NO email is ever attempted).
    await svc.from('auth_rate_limit').delete().eq('route', RL_ROUTE);
    let saw429 = false; let saw503 = false;
    for (let i = 0; i < 7; i++) {
      const r = await subscribePost({ email: E(`burst${i}`) });
      if (r.status === 429) saw429 = true;
      if (r.status === 503) saw503 = true;
    }
    ok('route: burst of 7 trips the 429 rate limit', saw429);
    ok('route: allowed requests hit the 503 dormant gate (no send)', saw503);

    // Honeypot: filled `website` -> generic 200 ok, NO row, no work (checked
    // before the rate limit / RESEND gate).
    const rhp = await subscribePost({ email: E('hp'), website: 'i-am-a-bot' });
    ok('route: honeypot -> 200 ok', rhp.status === 200, `(${rhp.status})`);
    const { count: hpCount } = await svc.from(TABLE).select('id', { count: 'exact', head: true }).eq('email', E('hp'));
    ok('route: honeypot created NO subscriber row', hpCount === 0, `(count=${hpCount})`);
  } finally {
    if (server) { stopServer(server); await sleep(500); }
  }
}

async function cleanup() {
  console.log('\n[cleanup] deleting test rows ...');
  await svc.from(TABLE).delete().like('email', `nlv${STAMP}%`);
  await svc.from('auth_rate_limit').delete().eq('route', RL_ROUTE);
  const { count } = await svc.from(TABLE).select('id', { count: 'exact', head: true }).like('email', `nlv${STAMP}%`);
  ok('cleanup: all test subscriber rows deleted (0 remain)', count === 0, `(count=${count})`);
}

// ---- run ----
try {
  await libTests();
  await rlsProbe();
  await routeTests();
} catch (err) {
  console.error('\nERROR during verification:', err?.message || err);
  failures++;
} finally {
  try { await cleanup(); } catch (e) { console.error('cleanup error:', e?.message || e); failures++; }
}

console.log(`\n${failures === 0 ? 'NEWSLETTER VERIFY: ALL PASS' : `NEWSLETTER VERIFY: ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
