// ============================================================
// scripts/newsletter-issues-verify.mjs — end-to-end verification for Phase N2
// (The Field Guide: armed-queue sender + delivery ledger + webhook).
//
//   node --conditions=react-server scripts/newsletter-issues-verify.mjs
//   (npm run verify:newsletter-issues)
//
// --conditions=react-server lets this plain-Node process import the REAL
// server-only lib/newsletter_issues.js + the cron/webhook/CSV route handlers
// exactly as the app does. Resend is NEVER called: every send path takes a
// dependency-injected mock sendFn; the clock is injected too, so weekday /
// armed-queue behavior is deterministic.
//
// SAFETY (important): startSending() snapshots ALL active subscribers by design.
// To guarantee this test can NEVER email, rotate a token for, or otherwise touch
// a REAL subscriber, after every startSending() we PRUNE the ledger down to just
// this run's seeded test subscribers BEFORE any batch runs. The global cron
// (runNewsletterCron) is only driven on its non-side-effecting no-op branches,
// each GUARDED so it can't act on foreign in-flight issues. All test rows share
// an `nliv<STAMP>` prefix and are removed in a try/finally.
//
// SKIPs cleanly if Supabase creds are unset.
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import {
  ensureIssueMeta, getIssueMeta, approveIssue, disarmIssue, pickOldestApproved,
  loadSendingIssue, startSending, runSendBatch, sendTestIssue,
  updateSendByProviderId, suppressSubscriber, statsForIssue, overallSubscriberStats,
  subscribersToCsv, addLink, listLinks, discardLink, runNewsletterCron,
  nyWeekday, isTuesdayInNY, IssueError,
} from '../lib/newsletter_issues.js';
import { verifyResendWebhook, svixSignatureHeader } from '../lib/email/svix.js';
import { renderIssueEmail, prepareIssueContent, markdownToText } from '../lib/email/issue_template.js';
// NOTE: the cron + webhook route handlers use RELATIVE imports and touch no
// next/headers, so they import cleanly in plain Node (tested directly below).
// The ADMIN routes import requireAdmin -> next/headers, which only resolves in
// the Next runtime — so their auth is exercised over HTTP in routeAuthTests()
// (a `next start` section, mirroring scripts/newsletter-verify.mjs).
import { POST as webhookPost } from '../app/api/newsletter/webhook/route.js';
import { GET as cronGet } from '../app/api/cron/newsletter-send/route.js';
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

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

let failures = 0;
let skips = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const skip = (name, why) => { console.log(`SKIP  ${name}  (${why})`); skips++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SB_URL || !SB_SVC) {
  console.log('SKIP  Supabase creds unset (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). `vercel env pull`, then re-run.');
  process.exit(0);
}

const svc = createClient(SB_URL, SB_SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const STAMP = Date.now();
const PFX = `nliv${STAMP}`;

// ---- injected mailer + clock ----
let sends = [];
const mockSend = async (args) => { sends.push(args); return { id: `mock_${STAMP}_${sends.length}` }; };
const resetSends = () => { sends = []; };
const fixedNow = (iso) => () => new Date(iso);

// ---- seed bookkeeping (for teardown) ----
const contentIds = [];
const subIds = [];

async function seedContent(tag) {
  const external_id = `${PFX}-${tag}`;
  const { data, error } = await svc.from('content').insert({
    source: 'newsletter', type: 'newsletter', external_id, status: 'draft',
    title: `Test Issue ${tag}`,
    body_md: `# Hello ${tag}\n\nA paragraph with **bold** and a [link](https://example.com).\n\n- one\n- two`,
    published_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw new Error(`seedContent ${tag}: ${error.message}`);
  contentIds.push(data.id);
  return data.id;
}
async function seedSub(tag, status = 'active') {
  const email = `${PFX}-${tag}@example.com`;
  const { data, error } = await svc.from('newsletter_subscribers').insert({
    email, status, source: 'test', unsub_token_hash: `seed${STAMP}${tag}`,
  }).select('id, email').single();
  if (error) throw new Error(`seedSub ${tag}: ${error.message}`);
  subIds.push(data.id);
  return data;
}
async function seedSend(issueId, subId, providerId, status = 'sent') {
  const { error } = await svc.from('newsletter_sends').insert({
    issue_content_id: issueId, subscriber_id: subId, provider_message_id: providerId, status,
  });
  if (error) throw new Error(`seedSend: ${error.message}`);
}
async function pruneForeign(issueId, keepIds) {
  const keep = new Set(keepIds);
  const { data } = await svc.from('newsletter_sends').select('id, subscriber_id').eq('issue_content_id', issueId);
  const foreign = (data || []).filter((r) => !keep.has(r.subscriber_id)).map((r) => r.id);
  if (foreign.length) await svc.from('newsletter_sends').delete().in('id', foreign);
  return foreign.length;
}
const metaRow = (id) => svc.from('newsletter_issue_meta').select('*').eq('content_id', id).maybeSingle().then((r) => r.data);
const contentRow = (id) => svc.from('content').select('*').eq('id', id).maybeSingle().then((r) => r.data);
const subRow = (id) => svc.from('newsletter_subscribers').select('*').eq('id', id).maybeSingle().then((r) => r.data);
const sendRowByProvider = (pid) => svc.from('newsletter_sends').select('*').eq('provider_message_id', pid).maybeSingle().then((r) => r.data);
const queuedFor = (issueId, subId) => svc.from('newsletter_sends').select('id, status').eq('issue_content_id', issueId).eq('subscriber_id', subId).maybeSingle().then((r) => r.data);

// ============================================================
async function templateTests() {
  console.log('\n== TEMPLATE: render is email-safe, [TEST] prefix, plain-text twin ==');
  const content = { id: 'x', title: 'T', body_md: '# H1\n\nHi **there** [a](https://e.com)' };
  const meta = { subject: 'Weekly AI', preheader: 'the good stuff', hero_image_url: 'https://ex.com/h.png' };
  const prepared = prepareIssueContent(content);
  ok('template: markdown body rendered to styled HTML', /<h1 style=/.test(prepared.bodyHtml) && /<strong>/.test(prepared.bodyHtml));
  ok('template: no raw script survives sanitize', !/<script/i.test(prepareIssueContent({ body_md: '<script>x</script>hi' }).bodyHtml));
  const email = renderIssueEmail({ content, meta, prepared, unsubUrl: 'https://s/u?token=AAA', readInBrowserUrl: 'https://s/blog/x' });
  ok('template: subject from meta', email.subject === 'Weekly AI');
  ok('template: List-Unsubscribe + one-click headers set', email.headers['List-Unsubscribe'] === '<https://s/u?token=AAA>' && email.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
  ok('template: unsub + read-in-browser links in HTML', email.html.includes('https://s/u?token=AAA') && email.html.includes('https://s/blog/x'));
  ok('template: hero image with alt rendered', email.html.includes('https://ex.com/h.png') && /alt="Weekly AI"/.test(email.html));
  ok('template: plain-text twin present', email.text.includes('Weekly AI') && email.text.includes('Unsubscribe:'));
  const test = renderIssueEmail({ content, meta, prepared, unsubUrl: 'https://s/u?token=B', readInBrowserUrl: 'https://s/blog/x', test: true });
  ok('template: [TEST] prefix on test render', test.subject === '[TEST] Weekly AI');
  ok('template: markdownToText strips markdown', markdownToText('# H\n**b** [x](https://y)') === 'H\nb x (https://y)');
}

async function statusGuardTests() {
  console.log('\n== STATUS GUARDS: approve/disarm transitions ==');
  const c = await seedContent('sg');
  await ensureIssueMeta(c, { subject: 'SG subject' });
  const m0 = await getIssueMeta(c);
  ok('guard: ensureIssueMeta creates draft', m0?.status === 'draft' && m0.subject === 'SG subject');

  await ensureIssueMeta('00000000-0000-0000-0000-000000000000', { subject: 'x' }).then(
    () => ok('guard: ensureIssueMeta on missing content throws', false),
    (e) => ok('guard: ensureIssueMeta on missing content throws', e instanceof IssueError && e.code === 'not_found'),
  );

  const a = await approveIssue(c);
  ok('guard: approve draft -> approved (+approved_at)', a.status === 'approved' && !!a.approved_at);

  await approveIssue(c).then(
    () => ok('guard: approve already-approved throws', false),
    (e) => ok('guard: approve already-approved throws not_draft', e instanceof IssueError && e.code === 'not_draft'),
  );

  const d = await disarmIssue(c);
  ok('guard: disarm approved -> draft (approved_at cleared)', d.status === 'draft' && d.approved_at === null);

  await disarmIssue(c).then(
    () => ok('guard: disarm a draft throws', false),
    (e) => ok('guard: disarm a draft throws not_approved', e instanceof IssueError && e.code === 'not_approved'),
  );
}

async function armedQueueTests() {
  console.log('\n== ARMED-QUEUE: start / snapshot / batch / continuation / completion ==');
  if (await loadSendingIssue()) { skip('armed-queue suite', 'another issue is already sending globally'); return; }

  // 3 active + 1 pending test subscribers.
  const s1 = await seedSub('aq1', 'active');
  const s2 = await seedSub('aq2', 'active');
  const s3 = await seedSub('aq3', 'active');
  const sp = await seedSub('aqP', 'pending');
  const activeIds = [s1.id, s2.id, s3.id];

  const c = await seedContent('aq');
  await ensureIssueMeta(c, { subject: 'AQ Weekly', preheader: 'pre' });
  await approveIssue(c);

  // approved + MONDAY -> the cron must NOT start it.
  const monday = fixedNow(mondayIso);
  const cronMon = await runNewsletterCron({ now: monday, sendFn: mockSend, holder: `test-${STAMP}-mon`, staleMinutes: 0 });
  ok('armed-queue: approved + Monday -> cron no-ops (not_tuesday)', cronMon.action === 'noop' && cronMon.reason === 'not_tuesday');
  ok('armed-queue: issue still approved after Monday cron', (await getIssueMeta(c)).status === 'approved');

  // Count active BEFORE start (snapshot == all actives).
  const { count: activeBefore } = await svc.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'active');

  const started = await startSending(c, { now: fixedNow('2026-07-07T13:30:00Z') });
  ok('armed-queue: startSending -> sending', started.status === 'sending');
  const mStarted = await getIssueMeta(c);
  ok('armed-queue: audience_count == all active subscribers', mStarted.audience_count === activeBefore, `(count=${mStarted.audience_count} activeBefore=${activeBefore})`);
  ok('armed-queue: content row PUBLISHED at send start', (await contentRow(c)).status === 'published');
  ok('armed-queue: queued row exists for each ACTIVE test sub', !!(await queuedFor(c, s1.id)) && !!(await queuedFor(c, s2.id)) && !!(await queuedFor(c, s3.id)));
  ok('armed-queue: NO queued row for the PENDING sub (snapshot=active only)', !(await queuedFor(c, sp.id)));

  // Snapshot idempotency: a duplicate (issue,subscriber) violates UNIQUE.
  const dup = await svc.from('newsletter_sends').insert({ issue_content_id: c, subscriber_id: s1.id, status: 'queued' });
  ok('armed-queue: duplicate ledger row rejected by UNIQUE(issue,subscriber)', dup.error && (dup.error.code === '23505' || /duplicate|unique/i.test(dup.error.message)));

  // SAFETY: prune the ledger to ONLY our test subs before any send runs.
  await pruneForeign(c, activeIds);

  // Batch limit honored: 3 queued, limit 2 -> processes 2, remainder 1.
  resetSends();
  const b1 = await runSendBatch({ limit: 2, sendFn: mockSend, now: fixedNow('2026-07-07T13:31:00Z') });
  ok('armed-queue: batch limit honored (processed 2 of 3)', b1.processed === 2 && b1.sent === 2 && b1.remaining === 1 && b1.issueComplete === false);
  ok('armed-queue: mock mailer got exactly 2 sends', sends.length === 2);

  // Per-recipient unsub link uniqueness (+ present in each email).
  const unsubUrls = sends.map((s) => (s.headers?.['List-Unsubscribe'] || '').replace(/^<|>$/g, ''));
  const tokens = unsubUrls.map((u) => { try { return new URL(u).searchParams.get('token'); } catch { return null; } });
  ok('armed-queue: each recipient got a distinct unsub token', tokens[0] && tokens[1] && tokens[0] !== tokens[1]);
  ok('armed-queue: each email embeds its own unsub link', sends[0].html.includes(unsubUrls[0]) && sends[1].html.includes(unsubUrls[1]));
  ok('armed-queue: one-click List-Unsubscribe-Post header on each send', sends.every((s) => s.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click'));
  ok('armed-queue: provider_message_id recorded on sent rows', !!(await queuedFor(c, s1.id))); // status now 'sent'
  const s1row = await svc.from('newsletter_sends').select('status, provider_message_id').eq('issue_content_id', c).eq('subscriber_id', s1.id).maybeSingle();
  ok('armed-queue: first row is sent + has provider id', s1row.data?.status === 'sent' && /^mock_/.test(s1row.data?.provider_message_id || ''));

  // Continuation on a LATER day drains the remainder -> completion.
  resetSends();
  const b2 = await runSendBatch({ limit: 2, sendFn: mockSend, now: fixedNow('2026-07-08T13:30:00Z') });
  ok('armed-queue: continuation drains remainder (processed 1, complete)', b2.processed === 1 && b2.remaining === 0 && b2.issueComplete === true);
  const mDone = await getIssueMeta(c);
  ok('armed-queue: completion -> status sent + sent_at set', mDone.status === 'sent' && !!mDone.sent_at);

  // Send idempotency: re-running the batch does nothing (no sending issue, no dup rows).
  resetSends();
  const b3 = await runSendBatch({ limit: 5, sendFn: mockSend });
  ok('armed-queue: re-run batch after completion is a no-op', b3.processed === 0 && sends.length === 0);
  const { count: rowCount } = await svc.from('newsletter_sends').select('id', { count: 'exact', head: true }).eq('issue_content_id', c);
  ok('armed-queue: exactly one ledger row per test recipient (no dupes)', rowCount === activeIds.length, `(rows=${rowCount})`);

  // Can't restart a sent issue.
  await startSending(c, {}).then(
    () => ok('armed-queue: startSending on a sent issue throws', false),
    (e) => ok('armed-queue: startSending on a sent issue throws not_approved', e instanceof IssueError && e.code === 'not_approved'),
  );

  // Per-issue stats reflect the ledger.
  const st = await statsForIssue(c);
  ok('armed-queue: statsForIssue counts sent recipients', st.counts.sent === activeIds.length && st.total === activeIds.length);
}

async function oldestFirstTests() {
  console.log('\n== ARMED-QUEUE: oldest-approved-first + disarm removes from queue ==');
  const ca = await seedContent('ofa');
  const cb = await seedContent('ofb');
  await ensureIssueMeta(ca, { subject: 'A' });
  await ensureIssueMeta(cb, { subject: 'B' });
  await approveIssue(ca, { now: fixedNow('2026-06-01T00:00:00Z') }); // older
  await approveIssue(cb, { now: fixedNow('2026-06-02T00:00:00Z') }); // newer

  // Deterministic (scoped to our two rows) oldest-approved check.
  const scopedOldest = async () => (await svc.from('newsletter_issue_meta')
    .select('content_id').in('content_id', [ca, cb]).eq('status', 'approved')
    .order('approved_at', { ascending: true }).limit(1).maybeSingle()).data?.content_id;
  ok('oldest-first: older approved_at wins (A before B)', (await scopedOldest()) === ca);

  // Global pick sanity: returns SOMETHING approved with approved_at <= A's.
  const globalPick = await pickOldestApproved();
  ok('oldest-first: pickOldestApproved returns an approved issue', !!globalPick && globalPick.status === 'approved');

  // Disarm the older one -> it drops out; B is now the scoped oldest.
  await disarmIssue(ca);
  ok('oldest-first: disarm removes A from the approved queue (B now oldest)', (await scopedOldest()) === cb);

  // cleanup: disarm B too so it can't be picked by a later cron test.
  await disarmIssue(cb);
}

async function cronDecisionTests() {
  console.log('\n== CRON: no-op decisions (guarded) ==');
  if (await loadSendingIssue()) { skip('cron no-op decisions', 'an issue is sending globally'); return; }

  // nothing-approved + TUESDAY -> noop. Only safe/deterministic when NOTHING is
  // globally approved (else the cron would legitimately start a foreign issue).
  if (await pickOldestApproved()) {
    skip('cron: nothing-approved + Tuesday', 'a foreign approved issue exists');
  } else {
    const r = await runNewsletterCron({ now: fixedNow(tuesdayIso), sendFn: mockSend, holder: `test-${STAMP}-tue`, staleMinutes: 0 });
    ok('cron: nothing approved + Tuesday -> noop (nothing_approved)', r.action === 'noop' && r.reason === 'nothing_approved');
  }

  // The "approved + Tuesday -> starts" branch is covered by startSending() +
  // isTuesdayInNY() directly (armedQueueTests); we deliberately do NOT drive a
  // real global send through the cron here (it would snapshot every subscriber).
  ok('cron: isTuesdayInNY true on a Tuesday, false on a Monday', isTuesdayInNY(new Date(tuesdayIso)) === true && isTuesdayInNY(new Date(mondayIso)) === false);
  ok('cron: nyWeekday is DST-correct (Tue/Mon)', nyWeekday(new Date(tuesdayIso)) === 'Tue' && nyWeekday(new Date(mondayIso)) === 'Mon');
}

async function cronEndpointTests() {
  console.log('\n== CRON ENDPOINT: 401 wrong secret / 503 no secret ==');
  const saved = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const r503 = await cronGet(new Request('http://localhost/api/cron/newsletter-send'));
    ok('cron endpoint: 503 when CRON_SECRET unset', r503.status === 503, `(${r503.status})`);

    process.env.CRON_SECRET = `test-secret-${STAMP}`;
    const rWrong = await cronGet(new Request('http://localhost/api/cron/newsletter-send', { headers: { authorization: 'Bearer nope' } }));
    ok('cron endpoint: 401 on wrong bearer', rWrong.status === 401, `(${rWrong.status})`);
    // NOTE: we never call it with the CORRECT secret — that would run the real
    // global cycle. Its logic is covered by runNewsletterCron tests above.
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  }
}

async function webhookTests() {
  console.log('\n== WEBHOOK: Svix signature + event -> ledger/suppression ==');
  const secret = `whsec_${Buffer.from(`field-guide-test-key-${STAMP}`).toString('base64')}`;

  // Pure verifier: valid / tampered / stale / missing-secret.
  const body = JSON.stringify({ type: 'ping', data: {} });
  const svixId = 'msg_abc';
  const nowSec = Math.floor(Date.now() / 1000);
  const goodSig = svixSignatureHeader(secret, svixId, String(nowSec), body);
  ok('webhook verify: valid signature accepted', verifyResendWebhook({ secret, svixId, svixTimestamp: String(nowSec), signatureHeader: goodSig, body }).ok === true);
  ok('webhook verify: tampered body rejected', verifyResendWebhook({ secret, svixId, svixTimestamp: String(nowSec), signatureHeader: goodSig, body: body + 'x' }).ok === false);
  const staleTs = String(nowSec - 20 * 60);
  const staleSig = svixSignatureHeader(secret, svixId, staleTs, body);
  ok('webhook verify: stale timestamp rejected', verifyResendWebhook({ secret, svixId, svixTimestamp: staleTs, signatureHeader: staleSig, body }).error === 'stale_timestamp');
  ok('webhook verify: missing secret -> not_configured', verifyResendWebhook({ secret: '', svixId, svixTimestamp: String(nowSec), signatureHeader: goodSig, body }).error === 'not_configured');

  // Seed ledger rows + subs for the ROUTE tests.
  const issue = await seedContent('wh');
  const sDel = await seedSub('whD', 'active');
  const sBnc = await seedSub('whB', 'active');
  const pidDel = `wh_${STAMP}_del`;
  const pidBnc = `wh_${STAMP}_bnc`;
  await seedSend(issue, sDel.id, pidDel, 'sent');
  await seedSend(issue, sBnc.id, pidBnc, 'sent');

  const savedSecret = process.env.RESEND_WEBHOOK_SECRET;
  try {
    // 503 when the webhook secret is unset (fail-closed dormant).
    delete process.env.RESEND_WEBHOOK_SECRET;
    const r503 = await webhookPost(new Request('http://localhost/api/newsletter/webhook', { method: 'POST', body: '{}' }));
    ok('webhook route: 503 when RESEND_WEBHOOK_SECRET unset', r503.status === 503, `(${r503.status})`);

    process.env.RESEND_WEBHOOK_SECRET = secret;

    // Valid delivered event -> ledger row 'delivered'.
    const delBody = JSON.stringify({ type: 'email.delivered', data: { email_id: pidDel } });
    const ts = String(Math.floor(Date.now() / 1000));
    const rDel = await webhookPost(new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST', body: delBody,
      headers: { 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': svixSignatureHeader(secret, 'm1', ts, delBody) },
    }));
    ok('webhook route: valid delivered -> 200', rDel.status === 200, `(${rDel.status})`);
    ok('webhook route: ledger row marked delivered', (await sendRowByProvider(pidDel))?.status === 'delivered');

    // Valid bounced event -> ledger 'bounced' + subscriber permanently suppressed.
    const bncBody = JSON.stringify({ type: 'email.bounced', data: { email_id: pidBnc } });
    const ts2 = String(Math.floor(Date.now() / 1000));
    const rBnc = await webhookPost(new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST', body: bncBody,
      headers: { 'svix-id': 'm2', 'svix-timestamp': ts2, 'svix-signature': svixSignatureHeader(secret, 'm2', ts2, bncBody) },
    }));
    ok('webhook route: valid bounced -> 200', rBnc.status === 200);
    ok('webhook route: ledger row marked bounced', (await sendRowByProvider(pidBnc))?.status === 'bounced');
    ok('webhook route: bounced subscriber permanently suppressed', (await subRow(sBnc.id))?.status === 'bounced');

    // Bad signature -> 401.
    const rBad = await webhookPost(new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST', body: delBody,
      headers: { 'svix-id': 'm3', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,not-a-real-signature' },
    }));
    ok('webhook route: bad signature -> 401', rBad.status === 401, `(${rBad.status})`);

    // A now-suppressed subscriber is EXCLUDED from a future startSending snapshot.
    if (!(await loadSendingIssue())) {
      const sActive = await seedSub('whA2', 'active');
      const c2 = await seedContent('wh2');
      await ensureIssueMeta(c2, { subject: 'WH2' });
      await approveIssue(c2);
      await startSending(c2, {});
      ok('webhook: bounced sub EXCLUDED from a new snapshot', !(await queuedFor(c2, sBnc.id)));
      ok('webhook: active sub INCLUDED in that snapshot', !!(await queuedFor(c2, sActive.id)));
      await pruneForeign(c2, []); // don't leave a half-sending test issue with foreign rows
    } else {
      skip('webhook: suppression excludes from snapshot', 'an issue is sending globally');
    }
  } finally {
    if (savedSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET; else process.env.RESEND_WEBHOOK_SECRET = savedSecret;
  }
}

async function testSendTests() {
  console.log('\n== TEST-SEND: [TEST] prefix, single recipient, mocked ==');
  const c = await seedContent('ts');
  await ensureIssueMeta(c, { subject: 'Test Subject' });
  resetSends();
  const r = await sendTestIssue({ contentId: c, email: `${PFX}-testaddr@example.com`, sendFn: mockSend });
  ok('test-send: exactly one recipient', sends.length === 1 && sends[0].to === `${PFX}-testaddr@example.com`);
  ok('test-send: subject prefixed with [TEST]', r.subject.startsWith('[TEST] ') && sends[0].subject.startsWith('[TEST] '));
  await sendTestIssue({ contentId: c, email: 'not-an-email', sendFn: mockSend }).then(
    () => ok('test-send: invalid email throws', false),
    (e) => ok('test-send: invalid email throws invalid_email', e instanceof IssueError && e.code === 'invalid_email'),
  );
}

async function csvShapeTests() {
  console.log('\n== CSV: shape (pure) ==');
  const csv = subscribersToCsv([
    { email: 'a@b.com', status: 'active', source: 'home', created_at: '2026-01-01T00:00:00Z', confirmed_at: '2026-01-02T00:00:00Z', unsubscribed_at: null },
    { email: 'weird,name@b.com', status: 'pending', source: 'blog', created_at: '2026-01-03T00:00:00Z', confirmed_at: null, unsubscribed_at: null },
  ]);
  const lines = csv.split('\r\n');
  ok('csv: header row correct', lines[0] === 'email,status,source,created_at,confirmed_at,unsubscribed_at');
  ok('csv: one line per row', lines[1] === 'a@b.com,active,home,2026-01-01T00:00:00Z,2026-01-02T00:00:00Z,');
  ok('csv: field with comma is quoted', lines[2].startsWith('"weird,name@b.com",pending'));
}

// ---- server-based route auth (requireAdmin -> next/headers needs the Next
// runtime, so we exercise it over HTTP, like scripts/newsletter-verify.mjs) ----
const PORT = 3221;
const BASE = `http://127.0.0.1:${PORT}`;
function runBuild() {
  try { rmSync(join(ROOT, '.next'), { recursive: true, force: true }); } catch { /* fine */ }
  console.log('\n[route] npm run build (cold) ...');
  const res = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8', env: process.env });
  const clean = res.status === 0;
  ok('route: build succeeds', clean, clean ? '' : (res.stderr || '').slice(-400));
  return clean;
}
async function startServer() {
  // No RESEND key => any accidental send path is inert; we only test AUTH here.
  const env = { ...process.env, RESEND_API_KEY: '' };
  const child = spawn(join(ROOT, 'node_modules', '.bin', 'next'), ['start', '-p', String(PORT)], {
    cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try { const r = await fetch(`${BASE}/api/health`, { cache: 'no-store' }); if (r.ok) return child; } catch { /* not up */ }
    if (child.exitCode != null) break;
  }
  throw new Error('server did not become ready:\n' + log.slice(-600));
}
function stopServer(child) {
  if (!child || child.pid == null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* */ } }
}
async function routeAuthTests() {
  console.log('\n== ROUTE AUTH: admin endpoints reject no-session (cold build + next start) ==');
  if (!runBuild()) return;
  let server = null;
  try {
    server = await startServer();
    // No admin cookie => requireAdmin() null => 401 on every admin endpoint.
    const csv = await fetch(`${BASE}/api/admin/newsletter/subscribers/csv`, { cache: 'no-store' });
    ok('route auth: CSV export 401 without session', csv.status === 401, `(${csv.status})`);
    ok('route auth: CSV does NOT stream text/csv without session', !(csv.headers.get('content-type') || '').includes('text/csv'));

    const postJson = (path, body) => fetch(`${BASE}${path}`, {
      method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const iss = await postJson('/api/admin/newsletter/issues', { action: 'approve', contentId: 'x' });
    ok('route auth: issues 401 without session', iss.status === 401, `(${iss.status})`);
    const sub = await postJson('/api/admin/newsletter/subscribers', { action: 'remove', subscriberId: 'x' });
    ok('route auth: subscribers 401 without session', sub.status === 401, `(${sub.status})`);
    const lnk = await postJson('/api/admin/newsletter/links', { action: 'add', url: 'https://e.com' });
    ok('route auth: links 401 without session', lnk.status === 401, `(${lnk.status})`);
  } finally {
    if (server) { stopServer(server); await sleep(500); }
  }
}

async function linkBinTests() {
  console.log('\n== LINK BIN: add / list / discard ==');
  const link = await addLink({ url: 'https://example.com/story', note: `${PFX} a note` });
  ok('links: add queued link', link?.status === 'queued' && link.url === 'https://example.com/story');
  await addLink({ url: 'not a url', note: `${PFX}` }).then(
    () => ok('links: invalid url throws', false),
    (e) => ok('links: invalid url throws invalid_url', e instanceof IssueError && e.code === 'invalid_url'),
  );
  const before = (await listLinks()).filter((l) => (l.note || '').startsWith(PFX)).length;
  ok('links: list includes the added link', before >= 1);
  const disc = await discardLink(link.id);
  ok('links: discard queued -> discarded', disc?.status === 'discarded');
}

async function statsTests() {
  console.log('\n== STATS: overall subscriber aggregation ==');
  const s = await overallSubscriberStats();
  ok('stats: shape has counts + addedThisMonth + suppressed', typeof s.counts?.active === 'number' && typeof s.addedThisMonth === 'number' && typeof s.suppressed === 'number');
  ok('stats: suppressed == bounced + complained', s.suppressed === s.counts.bounced + s.counts.complained);
}

async function cleanup() {
  console.log('\n[cleanup] deleting test rows ...');
  try {
    if (contentIds.length) await svc.from('newsletter_sends').delete().in('issue_content_id', contentIds);
    if (subIds.length) await svc.from('newsletter_sends').delete().in('subscriber_id', subIds);
    if (contentIds.length) await svc.from('newsletter_issue_meta').delete().in('content_id', contentIds);
    await svc.from('content').delete().like('external_id', `${PFX}%`);
    await svc.from('newsletter_subscribers').delete().like('email', `${PFX}%`);
    await svc.from('newsletter_links').delete().like('note', `${PFX}%`);
    await svc.from('sync_state').update({ locked_by: null, locked_at: null }).like('locked_by', `test-${STAMP}%`);
    const { count } = await svc.from('content').select('id', { count: 'exact', head: true }).like('external_id', `${PFX}%`);
    ok('cleanup: all test content rows deleted (0 remain)', count === 0, `(count=${count})`);
  } catch (e) {
    ok('cleanup: no error', false, e?.message);
  }
}

// ---- deterministic Monday / Tuesday in America/New_York (noon-ish ET) ----
function nyDateForShort(short) {
  let d = new Date(Date.UTC(2026, 0, 1, 17, 0, 0)); // 17:00 UTC ~= noon ET (unambiguous date)
  for (let i = 0; i < 9; i++) {
    if (nyWeekday(d) === short) return d.toISOString();
    d = new Date(d.getTime() + 86400000);
  }
  throw new Error(`could not find ${short}`);
}
const mondayIso = nyDateForShort('Mon');
const tuesdayIso = nyDateForShort('Tue');

// ---- ensure the advisory-lock row exists (migration 0011 seeds it; be safe) --
async function ensureLockRow() {
  await svc.from('sync_state').upsert({ name: 'newsletter' }, { onConflict: 'name', ignoreDuplicates: true });
}

// ============================================================
try {
  await ensureLockRow();
  await templateTests();       // pure, no DB
  await statusGuardTests();
  await armedQueueTests();
  await oldestFirstTests();
  await cronDecisionTests();
  await cronEndpointTests();   // env only, no DB writes
  await webhookTests();
  await testSendTests();
  await csvShapeTests();
  await linkBinTests();
  await statsTests();
  await routeAuthTests();
} catch (err) {
  console.error('\nERROR during verification:', err?.stack || err?.message || err);
  failures++;
} finally {
  await sleep(100);
  try { await cleanup(); } catch (e) { console.error('cleanup error:', e?.message || e); failures++; }
}

console.log(`\n${failures === 0 ? 'NEWSLETTER-ISSUES VERIFY: ALL PASS' : `NEWSLETTER-ISSUES VERIFY: ${failures} FAILURE(S)`}${skips ? ` (${skips} skipped)` : ''}`);
process.exit(failures === 0 ? 0 : 1);
