// ============================================================
// lib/newsletter_issues.js — the single chokepoint for SENDING "The Field Guide"
// (Phase N2). Mirrors lib/gate.js / lib/newsletter.js discipline: server-only,
// every DB access via the service-role client, all business logic funneled
// through a few functions so the cron + admin routes stay thin. Everything that
// does IO takes INJECTED deps ({ sendFn, now }) so the verify script can drive
// the real write path with a mocked mailer and a fixed clock.
//
// THE ARMED-QUEUE MODEL (the owner's core requirement, enforced here in code):
//   draft -> approved ("armed", approved_at) -> sending -> sent.
//   * The scheduled job sends ONLY issues the owner explicitly APPROVED.
//   * Draft is never sendable. Nothing approved => the job does NOTHING, silently.
//   * The owner can Disarm (approved -> draft) any time before sending starts,
//     and can bank several approved issues — the job takes the OLDEST approved
//     one, one per Tuesday.
//   * At most ONE issue is ever in 'sending' at a time; a send drains over one or
//     more days in batches (free-tier friendly), continuing ANY day until done.
//
// Single-flight: the cron + the admin "Send now" both run under the 0007
// sync_state advisory lock, reused with the DISTINCT name 'newsletter' (seeded by
// migration 0011) — the same dead-man's-switch surface the LinkedIn sync uses.
// ============================================================
import 'server-only';
import { getServiceClient } from './supabase/server.js';
import { moderateContent } from './gate.js';
import { issueUnsubUrlFor } from './newsletter.js';
import { siteBaseUrl } from './site.js';
import { sendEmail } from './email/send.js';
import { prepareIssueContent, renderIssueEmail } from './email/issue_template.js';

const META = 'newsletter_issue_meta';
const SENDS = 'newsletter_sends';
const LINKS = 'newsletter_links';
const SUBS = 'newsletter_subscribers';
const CONTENT = 'content';

export const LOCK_NAME = 'newsletter';
export const SEND_BATCH_LIMIT = 80;      // free-tier friendly default batch size
export const STALE_LOCK_MINUTES = 30;    // reclaim a lock held at least this long
const SUPPRESSED = new Set(['bounced', 'complained']);

export class IssueError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'IssueError';
    this.code = code;
    this.detail = detail;
  }
}

function svc() {
  const supabase = getServiceClient();
  if (!supabase) throw new IssueError('server_not_configured');
  return supabase;
}
function nowIso(now) {
  const d = typeof now === 'function' ? now() : now || new Date();
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

// ---- issue meta + armed-queue lifecycle ------------------------------------

// Ensure a content row is a sendable issue: it must exist AND be type
// 'newsletter'. Creates the meta row (draft) if missing, else updates the
// editable fields (subject/preheader/hero) WITHOUT touching the lifecycle. The
// subject is required. Returns the meta row.
export async function ensureIssueMeta(contentId, { subject, preheader = null, heroImageUrl = null } = {}) {
  if (typeof contentId !== 'string' || !contentId) throw new IssueError('invalid_id');
  const subj = typeof subject === 'string' ? subject.trim() : '';
  if (!subj) throw new IssueError('subject_required');
  const supabase = svc();

  const { data: content, error: cErr } = await supabase
    .from(CONTENT).select('id, type').eq('id', contentId).maybeSingle();
  if (cErr) throw new IssueError('db_error', cErr.message);
  if (!content) throw new IssueError('not_found');
  if (content.type !== 'newsletter') throw new IssueError('not_newsletter');

  const patch = {
    content_id: contentId,
    subject: subj.slice(0, 300),
    preheader: preheader ? String(preheader).slice(0, 300) : null,
    hero_image_url: heroImageUrl ? String(heroImageUrl).slice(0, 1000) : null,
  };
  // Upsert on the content_id PK — never disturbs status/approved_at/etc.
  const { data, error } = await supabase
    .from(META).upsert(patch, { onConflict: 'content_id' }).select().maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data;
}

export async function getIssueMeta(contentId) {
  const supabase = svc();
  const { data, error } = await supabase.from(META).select('*').eq('content_id', contentId).maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data || null;
}

// draft -> approved ("arm"). Any other current status throws.
export async function approveIssue(contentId, { now } = {}) {
  const supabase = svc();
  const { data, error } = await supabase
    .from(META)
    .update({ status: 'approved', approved_at: nowIso(now) })
    .eq('content_id', contentId).eq('status', 'draft')
    .select().maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  if (!data) {
    const meta = await getIssueMeta(contentId);
    if (!meta) throw new IssueError('not_found');
    throw new IssueError('not_draft', `status=${meta.status}`);
  }
  return data;
}

// approved -> draft ("disarm"). Only valid while still approved (before sending).
export async function disarmIssue(contentId) {
  const supabase = svc();
  const { data, error } = await supabase
    .from(META)
    .update({ status: 'draft', approved_at: null })
    .eq('content_id', contentId).eq('status', 'approved')
    .select().maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  if (!data) {
    const meta = await getIssueMeta(contentId);
    if (!meta) throw new IssueError('not_found');
    throw new IssueError('not_approved', `status=${meta.status}`);
  }
  return data;
}

// The armed-queue pick: the OLDEST approved issue (by approved_at). null if none.
export async function pickOldestApproved() {
  const supabase = svc();
  const { data, error } = await supabase
    .from(META).select('*').eq('status', 'approved')
    .order('approved_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data || null;
}

// The single issue currently in 'sending' (there is never more than one). null
// if none. Oldest send_started_at wins if the invariant were ever violated.
export async function loadSendingIssue() {
  const supabase = svc();
  const { data, error } = await supabase
    .from(META).select('*').eq('status', 'sending')
    .order('send_started_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data || null;
}

// Begin sending an APPROVED issue: atomically flip approved -> sending, snapshot
// the ACTIVE subscriber set into queued ledger rows (idempotent via the UNIQUE
// constraint), record audience_count, and PUBLISH the content row so the email's
// "read in browser" link works from the very first batch.
export async function startSending(issue, { now } = {}) {
  const contentId = typeof issue === 'string' ? issue : issue?.content_id;
  if (typeof contentId !== 'string' || !contentId) throw new IssueError('invalid_id');
  const supabase = svc();

  // Atomic guard: only approved -> sending, so two callers can't both start.
  const { data: started, error: upErr } = await supabase
    .from(META)
    .update({ status: 'sending', send_started_at: nowIso(now) })
    .eq('content_id', contentId).eq('status', 'approved')
    .select().maybeSingle();
  if (upErr) throw new IssueError('db_error', upErr.message);
  if (!started) {
    const meta = await getIssueMeta(contentId);
    if (!meta) throw new IssueError('not_found');
    throw new IssueError('not_approved', `status=${meta.status}`);
  }

  // Snapshot the recipient set = ACTIVE subscribers at start.
  const { data: actives, error: subErr } = await supabase
    .from(SUBS).select('id').eq('status', 'active');
  if (subErr) throw new IssueError('db_error', subErr.message);
  const audienceCount = actives ? actives.length : 0;

  await supabase.from(META).update({ audience_count: audienceCount }).eq('content_id', contentId);

  if (audienceCount > 0) {
    const rows = actives.map((s) => ({ issue_content_id: contentId, subscriber_id: s.id, status: 'queued' }));
    // Idempotent: UNIQUE(issue,subscriber) — a re-snapshot inserts nothing new.
    const { error: insErr } = await supabase
      .from(SENDS).upsert(rows, { onConflict: 'issue_content_id,subscriber_id', ignoreDuplicates: true });
    if (insErr) throw new IssueError('db_error', insErr.message);
  }

  // Publish the content row (idempotent) so /blog/[id] resolves for recipients.
  try {
    await moderateContent(contentId, { status: 'published' });
  } catch (e) {
    // Non-fatal: the issue is already snapshotted + sending; a publish hiccup
    // only affects the browser link, not delivery. Surface it in the detail.
    console.error('[newsletter] startSending publish failed:', e?.message || e);
  }

  return { ok: true, contentId, status: 'sending', audienceCount, queued: audienceCount, meta: started };
}

// ---- the batch sender -------------------------------------------------------
// Take up to `limit` queued rows of the currently-sending issue, render ONCE,
// send per-recipient (each email carries its OWN unsubscribe link + headers),
// record provider_message_id + status per row; failures -> 'failed' (+ note),
// never throw. When zero queued remain, flip the issue to 'sent'. Returns counts.
export async function runSendBatch({ limit = SEND_BATCH_LIMIT, sendFn = sendEmail, now } = {}) {
  const supabase = svc();
  const issue = await loadSendingIssue();
  if (!issue) return { ok: true, sending: false, processed: 0, sent: 0, failed: 0, remaining: 0, issueComplete: false };
  const contentId = issue.content_id;

  const { data: content, error: cErr } = await supabase
    .from(CONTENT).select('id, title, body_md, media, type').eq('id', contentId).maybeSingle();
  if (cErr) throw new IssueError('db_error', cErr.message);
  if (!content) throw new IssueError('not_found');

  const { data: queued, error: qErr } = await supabase
    .from(SENDS).select('id, subscriber_id')
    .eq('issue_content_id', contentId).eq('status', 'queued')
    .order('created_at', { ascending: true }).limit(Math.max(1, Math.floor(limit)));
  if (qErr) throw new IssueError('db_error', qErr.message);

  if (!queued || queued.length === 0) {
    await markIssueSentIfDrained(supabase, contentId, now);
    const done = await getIssueMeta(contentId);
    return { ok: true, sending: false, processed: 0, sent: 0, failed: 0, remaining: 0, issueComplete: done?.status === 'sent', contentId };
  }

  // Resolve recipient emails + current status (skip anyone suppressed/unsub'd
  // between snapshot and now).
  const subIds = queued.map((q) => q.subscriber_id);
  const { data: subs, error: sErr } = await supabase
    .from(SUBS).select('id, email, status').in('id', subIds);
  if (sErr) throw new IssueError('db_error', sErr.message);
  const subById = new Map((subs || []).map((s) => [s.id, s]));

  // Render the expensive markdown -> HTML/text exactly once for the whole batch.
  const prepared = prepareIssueContent(content);
  const readInBrowserUrl = `${siteBaseUrl()}/blog/${contentId}`;

  let sent = 0;
  let failed = 0;
  for (const row of queued) {
    const sub = subById.get(row.subscriber_id);
    if (!sub) { await failRow(supabase, row.id, 'subscriber_missing'); failed++; continue; }
    if (sub.status !== 'active') { await failRow(supabase, row.id, `recipient_${sub.status}`); failed++; continue; }

    // Per-recipient unsubscribe link (mints + stores a fresh token hash).
    const unsubUrl = await issueUnsubUrlFor(sub.id);
    const email = renderIssueEmail({ content, meta: issue, prepared, unsubUrl, readInBrowserUrl });
    // Deterministic idempotency key (issue + subscriber). If the process dies
    // after Resend accepted this send but before the ledger row flipped to
    // 'sent', the next batch re-sends the SAME key and Resend dedupes it — no
    // duplicate email. The injected mock sendFn simply ignores the extra field.
    const idempotencyKey = `${contentId}:${row.subscriber_id}`;
    try {
      const res = await sendFn({ to: sub.email, subject: email.subject, html: email.html, text: email.text, headers: email.headers, idempotencyKey });
      const providerId = res && (res.id || res.messageId || res.message_id) ? (res.id || res.messageId || res.message_id) : null;
      const { error: uErr } = await supabase
        .from(SENDS).update({ status: 'sent', provider_message_id: providerId, error_note: null }).eq('id', row.id);
      if (uErr) { await failRow(supabase, row.id, `ledger_${uErr.code || 'error'}`); failed++; }
      else sent++;
    } catch (err) {
      await failRow(supabase, row.id, String(err?.code || err?.message || err).slice(0, 500));
      failed++;
    }
  }

  // Drained? (no queued rows left for this issue) -> mark the issue sent.
  const { count: remaining } = await supabase
    .from(SENDS).select('id', { count: 'exact', head: true })
    .eq('issue_content_id', contentId).eq('status', 'queued');
  let issueComplete = false;
  if ((remaining || 0) === 0) { await markIssueSentIfDrained(supabase, contentId, now); issueComplete = true; }

  return { ok: true, sending: true, contentId, processed: queued.length, sent, failed, remaining: remaining || 0, issueComplete };
}

async function failRow(supabase, id, note) {
  await supabase.from(SENDS).update({ status: 'failed', error_note: String(note).slice(0, 500) }).eq('id', id);
}
async function markIssueSentIfDrained(supabase, contentId, now) {
  await supabase.from(META).update({ status: 'sent', sent_at: nowIso(now) })
    .eq('content_id', contentId).eq('status', 'sending');
}

// ---- test send (single recipient, [TEST] prefix, runtime key) ---------------
export async function sendTestIssue({ contentId, email, sendFn = sendEmail, now } = {}) {
  if (typeof contentId !== 'string' || !contentId) throw new IssueError('invalid_id');
  const to = typeof email === 'string' ? email.trim() : '';
  if (!to || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(to)) throw new IssueError('invalid_email');
  const supabase = svc();

  const { data: content, error: cErr } = await supabase
    .from(CONTENT).select('id, title, body_md, media, type').eq('id', contentId).maybeSingle();
  if (cErr) throw new IssueError('db_error', cErr.message);
  if (!content) throw new IssueError('not_found');
  const meta = await getIssueMeta(contentId);
  if (!meta) throw new IssueError('not_found');

  const readInBrowserUrl = `${siteBaseUrl()}/blog/${contentId}`;
  // A test send gets an unusable placeholder unsub link (we do NOT mint/rotate a
  // real subscriber token for a one-off test address).
  const unsubUrl = `${siteBaseUrl()}/api/newsletter/unsubscribe?token=test`;
  const rendered = renderIssueEmail({ content, meta, unsubUrl, readInBrowserUrl, test: true });
  const res = await sendFn({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, headers: rendered.headers });
  return { ok: true, to, subject: rendered.subject, providerMessageId: res?.id || null };
}

// ---- delivery webhook helpers ----------------------------------------------

// Record a Resend delivery event against the ledger row bearing this message id.
// Returns the updated row ({ id, subscriber_id, issue_content_id, status }) or
// null when no row matches (unknown/foreign message id).
export async function updateSendByProviderId(providerMessageId, { status } = {}) {
  if (typeof providerMessageId !== 'string' || !providerMessageId) return null;
  if (!['sent', 'delivered', 'bounced', 'complained', 'failed'].includes(status)) {
    throw new IssueError('invalid_status', String(status));
  }
  const supabase = svc();
  const { data, error } = await supabase
    .from(SENDS).update({ status })
    .eq('provider_message_id', providerMessageId)
    .select('id, subscriber_id, issue_content_id, status').maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data || null;
}

// Permanent suppression (a hard bounce or a spam complaint). N1's subscribeEmail
// already refuses to reactivate these, so this is one-way.
export async function suppressSubscriber(subscriberId, status) {
  if (typeof subscriberId !== 'string' || !subscriberId) return null;
  if (!SUPPRESSED.has(status)) throw new IssueError('invalid_status', String(status));
  const supabase = svc();
  const { data, error } = await supabase
    .from(SUBS).update({ status }).eq('id', subscriberId)
    .select('id, status').maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data || null;
}

// ---- stats ------------------------------------------------------------------
async function countWhere(supabase, table, filters) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count } = await q;
  return count || 0;
}

export async function statsForIssue(contentId) {
  const supabase = svc();
  const meta = await getIssueMeta(contentId);
  const STATES = ['queued', 'sent', 'delivered', 'bounced', 'complained', 'failed'];
  const counts = {};
  await Promise.all(STATES.map(async (s) => {
    counts[s] = await countWhere(supabase, SENDS, { issue_content_id: contentId, status: s });
  }));
  const total = STATES.reduce((a, s) => a + counts[s], 0);
  return { contentId, meta, counts, total };
}

export async function overallSubscriberStats() {
  const supabase = svc();
  const STATES = ['active', 'pending', 'unsubscribed', 'bounced', 'complained'];
  const counts = {};
  await Promise.all(STATES.map(async (s) => { counts[s] = await countWhere(supabase, SUBS, { status: s }); }));
  // added this (UTC) month
  const d = new Date();
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const { count: addedThisMonth } = await supabase
    .from(SUBS).select('id', { count: 'exact', head: true }).gte('created_at', monthStart);
  const total = STATES.reduce((a, s) => a + counts[s], 0);
  return { counts, total, addedThisMonth: addedThisMonth || 0, suppressed: counts.bounced + counts.complained };
}

// ---- admin listings ---------------------------------------------------------

// All issues for the admin table: meta joined with the content row's title +
// public status. Newest content first.
export async function listIssues({ limit = 200 } = {}) {
  const supabase = svc();
  const { data: metas, error } = await supabase
    .from(META).select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new IssueError('db_error', error.message);
  if (!metas || metas.length === 0) return [];
  const ids = metas.map((m) => m.content_id);
  const { data: contents } = await supabase
    .from(CONTENT).select('id, title, status, published_at').in('id', ids);
  const byId = new Map((contents || []).map((c) => [c.id, c]));
  return metas.map((m) => ({ ...m, content: byId.get(m.content_id) || null }));
}

// Newsletter-type content rows that do NOT yet have an issue meta — the "pick a
// content row to turn into an issue" list for the new-issue flow.
export async function listIssuableContent({ limit = 100 } = {}) {
  const supabase = svc();
  const { data: rows, error } = await supabase
    .from(CONTENT).select('id, title, status, published_at, updated_at')
    .eq('type', 'newsletter').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new IssueError('db_error', error.message);
  const { data: metas } = await supabase.from(META).select('content_id');
  const have = new Set((metas || []).map((m) => m.content_id));
  return (rows || []).map((r) => ({ ...r, hasMeta: have.has(r.id) }));
}

// One issue's full detail: meta + content + the per-recipient ledger (joined
// with subscriber email/status), for the admin detail view.
export async function getIssueDetail(contentId, { ledgerLimit = 1000 } = {}) {
  const supabase = svc();
  const meta = await getIssueMeta(contentId);
  if (!meta) return null;
  const { data: content } = await supabase
    .from(CONTENT).select('id, title, status, body_md, published_at').eq('id', contentId).maybeSingle();
  const { data: sends } = await supabase
    .from(SENDS).select('id, subscriber_id, provider_message_id, status, error_note, updated_at')
    .eq('issue_content_id', contentId).order('updated_at', { ascending: false }).limit(ledgerLimit);
  const subIds = [...new Set((sends || []).map((s) => s.subscriber_id))];
  let subById = new Map();
  if (subIds.length) {
    const { data: subs } = await supabase.from(SUBS).select('id, email, status').in('id', subIds);
    subById = new Map((subs || []).map((s) => [s.id, s]));
  }
  const ledger = (sends || []).map((s) => ({ ...s, email: subById.get(s.subscriber_id)?.email || '(removed)' }));
  const stats = await statsForIssue(contentId);
  return { meta, content: content || null, ledger, stats };
}

// ---- subscribers admin ------------------------------------------------------
export async function listSubscribers({ q = '', limit = 2000 } = {}) {
  const supabase = svc();
  let query = supabase.from(SUBS)
    .select('id, email, status, source, created_at, confirmed_at, unsubscribed_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (q && typeof q === 'string') query = query.ilike('email', `%${q.replace(/[%_]/g, '')}%`);
  const { data, error } = await query;
  if (error) throw new IssueError('db_error', error.message);
  return data || [];
}

// Owner manual remove: set unsubscribed (never a hard delete — keeps the ledger
// + suppression history intact).
export async function removeSubscriber(subscriberId, { now } = {}) {
  if (typeof subscriberId !== 'string' || !subscriberId) throw new IssueError('invalid_id');
  const supabase = svc();
  const { data, error } = await supabase
    .from(SUBS).update({ status: 'unsubscribed', unsubscribed_at: nowIso(now) })
    .eq('id', subscriberId).select('id, status').maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  if (!data) throw new IssueError('not_found');
  return data;
}

// Pure: rows -> RFC-4180 CSV text. Exported for a direct unit test.
//
// CSV-formula-injection hardening: a cell whose FIRST character is a formula
// trigger (= + - @) or a tab/CR is prefixed with a leading apostrophe so
// Excel/Sheets/LibreOffice treat it as literal text instead of executing it
// (e.g. `=HYPERLINK(...)`, `+cmd`, `@SUM`). The apostrophe is applied BEFORE the
// RFC-4180 quote-escaping so a dangerous-and-quoted value (e.g. `=a,b`) stays
// both neutralized and well-formed.
export function subscribersToCsv(rows) {
  const cols = ['email', 'status', 'source', 'created_at', 'confirmed_at', 'unsubscribed_at'];
  const FORMULA_LEAD = /^[=+\-@\t\r]/;
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (FORMULA_LEAD.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows || []) lines.push(cols.map((c) => cell(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

// ---- link bin (CRUD; Phase N3's drafter consumes these) ---------------------
export async function addLink({ url, note = null } = {}) {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!/^https?:\/\//i.test(u)) throw new IssueError('invalid_url');
  const supabase = svc();
  const { data, error } = await supabase
    .from(LINKS).insert({ url: u.slice(0, 2000), note: note ? String(note).slice(0, 500) : null, status: 'queued' })
    .select().maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data;
}
export async function listLinks({ limit = 500 } = {}) {
  const supabase = svc();
  const { data, error } = await supabase
    .from(LINKS).select('*').order('added_at', { ascending: false }).limit(limit);
  if (error) throw new IssueError('db_error', error.message);
  return data || [];
}
export async function discardLink(id) {
  if (typeof id !== 'string' || !id) throw new IssueError('invalid_id');
  const supabase = svc();
  const { data, error } = await supabase
    .from(LINKS).update({ status: 'discarded' }).eq('id', id).eq('status', 'queued')
    .select().maybeSingle();
  if (error) throw new IssueError('db_error', error.message);
  return data || null;
}

// Flip QUEUED links to used, stamping which issue consumed them (Phase N3's
// drafter, after it writes an issue draft from them). Atomic per-row guard
// (.eq('status','queued')) mirrors discardLink: only rows still queued flip.
// Idempotent-safe: ids that are already used/discarded/unknown are reported
// back in `skipped` instead of failing the whole batch, so re-running this
// after a partial failure (or a retry) never errors.
export async function markLinksUsed(ids, issueContentId) {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string' && id))] : [];
  if (!list.length) throw new IssueError('invalid_id');
  if (typeof issueContentId !== 'string' || !issueContentId) throw new IssueError('invalid_id');
  const supabase = svc();
  const { data, error } = await supabase
    .from(LINKS)
    .update({ status: 'used', used_in_issue: issueContentId })
    .in('id', list).eq('status', 'queued')
    .select('id, url, note, status, used_in_issue');
  if (error) throw new IssueError('db_error', error.message);
  const updated = data || [];
  const updatedIds = new Set(updated.map((r) => r.id));
  const skipped = list.filter((id) => !updatedIds.has(id));
  return { updated, skipped };
}

// ---- advisory lock (reuses the 0007 sync_state RPCs, name 'newsletter') -----
function makeHolder() {
  const region = process.env.VERCEL_REGION || 'local';
  return `${region}:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}
async function acquireLock(supabase, holder, staleMinutes) {
  const { data, error } = await supabase.rpc('sync_try_acquire', {
    p_name: LOCK_NAME, p_holder: holder, p_stale_minutes: staleMinutes,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: data === true };
}
async function releaseLock(supabase, holder, { success, error = null, synced = 0, created = 0, updated = 0 }) {
  try {
    await supabase.rpc('sync_finish', {
      p_name: LOCK_NAME, p_holder: holder, p_success: success, p_error: error,
      p_synced: synced, p_created: created, p_updated: updated, p_window_days: null,
    });
  } catch (e) { console.error('[newsletter] releaseLock failed:', e?.message || e); }
}

export async function getNewsletterHealth() {
  const supabase = getServiceClient();
  if (!supabase) return null;
  const { data } = await supabase.from('sync_state').select('*').eq('name', LOCK_NAME).maybeSingle();
  return data || null;
}

// ---- weekday (America/New_York, DST-correct via Intl) -----------------------
export function nyWeekday(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(date);
}
export function isTuesdayInNY(date = new Date()) {
  return nyWeekday(date) === 'Tue';
}

// ---- the cron cycle (fail-safe; NEVER throws) -------------------------------
// If an issue is 'sending' -> drain a batch (ANY day). Else if it's Tuesday in
// New York -> pick the oldest approved issue, start it, send the first batch.
// Else no-op. Records health in sync_state (dead-man's-switch) and always
// releases the lock. Returns a plain result object.
export async function runNewsletterCron({
  now = () => new Date(),
  sendFn = sendEmail,
  limit = SEND_BATCH_LIMIT,
  holder = makeHolder(),
  staleMinutes = STALE_LOCK_MINUTES,
} = {}) {
  const supabase = getServiceClient();
  if (!supabase) return { ok: false, error: 'server_not_configured' };

  const lock = await acquireLock(supabase, holder, staleMinutes);
  if (lock.error) return { ok: false, error: 'lock_error', detail: lock.error };
  if (!lock.ok) return { ok: true, skipped: 'locked' };

  // Lock HELD — release EXACTLY ONCE in `finally` (acquire + its early returns
  // stay above the try) so a throw between here and completion can never leave
  // the 'newsletter' advisory lock stranded until the 30-min stale reclaim.
  let outcome;
  let release = { success: false, error: 'cron_incomplete' };
  try {
    const sending = await loadSendingIssue();
    if (sending) {
      const batch = await runSendBatch({ limit, sendFn, now });
      outcome = { ok: true, action: 'continue', ...batch };
    } else if (isTuesdayInNY(now())) {
      const issue = await pickOldestApproved();
      if (issue) {
        await startSending(issue, { now });
        const batch = await runSendBatch({ limit, sendFn, now });
        outcome = { ok: true, action: 'started', contentId: issue.content_id, ...batch };
      } else {
        outcome = { ok: true, action: 'noop', reason: 'nothing_approved' };
      }
    } else {
      outcome = { ok: true, action: 'noop', reason: 'not_tuesday', day: nyWeekday(now()) };
    }
    release = { success: true, synced: outcome.processed || 0, created: outcome.sent || 0, updated: outcome.failed || 0 };
  } catch (err) {
    const detail = String(err?.detail || err?.message || err).slice(0, 1000);
    const code = err?.code || 'send_failed';
    release = { success: false, error: `${code}: ${detail}` };
    outcome = { ok: false, error: code, detail };
  } finally {
    await releaseLock(supabase, holder, release);
  }
  return outcome;
}

// ---- "Send now" (admin): start + drain immediately, regardless of weekday ----
export async function sendNow({
  contentId,
  now = () => new Date(),
  sendFn = sendEmail,
  limit = SEND_BATCH_LIMIT,
  holder = makeHolder(),
  staleMinutes = STALE_LOCK_MINUTES,
} = {}) {
  if (typeof contentId !== 'string' || !contentId) throw new IssueError('invalid_id');
  const supabase = getServiceClient();
  if (!supabase) return { ok: false, error: 'server_not_configured' };

  const lock = await acquireLock(supabase, holder, staleMinutes);
  if (lock.error) return { ok: false, error: 'lock_error', detail: lock.error };
  if (!lock.ok) return { ok: false, error: 'locked' };

  // The lock is now HELD. Release it EXACTLY ONCE in `finally` so it can never
  // strand on an early throw or an unexpected error — the acquire + its two
  // early returns stay ABOVE the try so the finally only runs for a lock we
  // actually hold. `release` carries the health stats the finally records; the
  // atomic approved->sending guard lives in startSending and is untouched.
  let result;
  let release = { success: false, error: 'send_incomplete' };
  try {
    const sending = await loadSendingIssue();
    if (sending && sending.content_id !== contentId) {
      throw new IssueError('another_sending', sending.content_id);
    }
    if (!sending) {
      const meta = await getIssueMeta(contentId);
      if (!meta) throw new IssueError('not_found');
      if (meta.status !== 'approved') throw new IssueError('not_approved', `status=${meta.status}`);
      await startSending(contentId, { now });
    }
    const batch = await runSendBatch({ limit, sendFn, now });
    release = { success: true, synced: batch.processed || 0, created: batch.sent || 0, updated: batch.failed || 0 };
    result = { ok: true, ...batch };
  } catch (err) {
    const detail = String(err?.detail || err?.message || err).slice(0, 1000);
    const code = err?.code || 'send_failed';
    release = { success: false, error: `${code}: ${detail}` };
    result = { ok: false, error: code, detail };
  } finally {
    await releaseLock(supabase, holder, release);
  }
  return result;
}

// ---- optional: import a Resend Audience as subscribers ----------------------
// Runtime-only. Upserts contacts as active/source='resend-import', idempotent on
// lower(email). NEVER downgrades an existing status and NEVER reactivates a
// suppressed/unsubscribed address. Returns counts. Fail-soft: any Resend hiccup
// returns { ok:false, error } rather than throwing.
export async function importResendAudience() {
  const key = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!key || !audienceId) return { ok: false, error: 'not_configured' };
  const supabase = getServiceClient();
  if (!supabase) return { ok: false, error: 'server_not_configured' };

  let contacts = [];
  try {
    const res = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { ok: false, error: `resend_${res.status}` };
    const body = await res.json().catch(() => ({}));
    contacts = Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
  } catch (e) {
    return { ok: false, error: 'resend_fetch_failed', detail: String(e?.message || e) };
  }

  let imported = 0;
  let upgraded = 0;
  let skipped = 0;
  for (const c of contacts) {
    const email = typeof c?.email === 'string' ? c.email.trim().toLowerCase() : '';
    if (!email || /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) === false) { skipped++; continue; }
    if (c?.unsubscribed === true) { skipped++; continue; }
    const { data: existing } = await supabase.from(SUBS).select('id, status').eq('email', email).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from(SUBS).insert({
        email, status: 'active', source: 'resend-import', confirmed_at: new Date().toISOString(),
      });
      if (error) skipped++; else imported++;
    } else if (existing.status === 'pending') {
      // Only a safe UPGRADE (pending -> active); never touch active/suppressed/unsub.
      await supabase.from(SUBS).update({ status: 'active', confirmed_at: new Date().toISOString() }).eq('id', existing.id);
      upgraded++;
    } else {
      skipped++;
    }
  }
  return { ok: true, imported, upgraded, skipped, total: contacts.length };
}
