// ============================================================
// lib/newsletter.js — the single chokepoint for newsletter subscriptions.
//
// Mirrors lib/gate.js discipline: server-only, every DB access via the
// service-role client, all business logic funneled through a few functions so
// the API routes stay thin. This module owns the double-opt-in lifecycle:
//
//   subscribeEmail   — public signup (POST /api/newsletter/subscribe)
//   confirmToken     — the emailed confirm link (GET /api/newsletter/confirm)
//   unsubscribeToken — the emailed unsub link (GET/POST .../unsubscribe)
//
// ANTI-ENUMERATION: subscribeEmail ALWAYS returns the same generic { ok:true }
// shape for any syntactically-valid email, regardless of whether it already
// exists or what state it is in — the endpoint leaks nothing about who is on
// the list. What actually happens internally (send a confirm, re-send at most
// once/hour, or stay completely silent) is decided from the address's current
// status: none -> insert pending + confirm; pending -> throttled re-send;
// active -> nothing; unsubscribed -> re-open (pending) + confirm; bounced /
// complained -> nothing (permanent suppression, protects sender reputation).
//
// TOKENS: 32 random bytes, base64url, placed in the emailed LINK; only the
// SHA-256 hex is ever stored. The confirm token has a 7-day expiry. Because
// only the hash is stored, a re-sent confirmation mints fresh tokens (the raw
// is needed to build the link) — the unsub token therefore has no expiry but
// is rotated whenever a confirmation is (re)sent.
//
// NOTE (deliberate, documented): the confirm flow does NOT null the token hash
// on success. Single-use is enforced by the pending->active status guard (a
// repeat click is an idempotent no-op -> { ok:true, already:true }), which is
// what keeps the confirm link idempotent-friendly; nulling the hash would make
// a repeat lookup miss and a legitimate double-click look like a bad link.
// ============================================================
import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { getServiceClient } from './supabase/server.js';
import { siteBaseUrl } from './site.js';

const TABLE = 'newsletter_subscribers';
const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000; // confirm token lives 7 days
const RESEND_MIN_INTERVAL_MS = 60 * 60 * 1000;   // re-send a pending confirm at most once/hour

// Permanent suppression: keep the row but NEVER email it again (honors prior
// hard bounces + spam complaints; protects sender reputation).
const SUPPRESSED = new Set(['bounced', 'complained']);

// The generic response every caller sees, regardless of the internal branch.
const GENERIC_OK = { ok: true };

export class NewsletterError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NewsletterError';
    this.code = code;
  }
}

// A pragmatic, generous check — not a full RFC-5322 parser, just enough to
// reject obvious garbage while accepting real addresses. Trims, lowercases,
// caps at the SMTP max of 254 chars. Returns the normalized email or null.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

// A fresh token: { raw (goes in the link), hash (goes in the DB) }.
function newToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: createHash('sha256').update(raw).digest('hex') };
}
function hashToken(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  return createHash('sha256').update(raw).digest('hex');
}

function confirmUrlFor(rawToken) {
  return `${siteBaseUrl()}/api/newsletter/confirm?token=${encodeURIComponent(rawToken)}`;
}
function unsubUrlFor(rawToken) {
  return `${siteBaseUrl()}/api/newsletter/unsubscribe?token=${encodeURIComponent(rawToken)}`;
}

function isUniqueViolation(err) {
  return err?.code === '23505' || /duplicate key|unique constraint/i.test(err?.message || '');
}

// Send a confirmation, swallowing TRANSIENT failures so the HTTP response is
// identical for every valid email (zero enumeration) even during a provider
// outage — the row is already persisted and can be re-sent. A config error
// (NotConfigured) is NOT transient: rethrow it so the route fails closed (503).
async function safeSend(sendFn, args) {
  try {
    await sendFn(args);
  } catch (e) {
    if (e && (e.code === 'email_not_configured' || e.name === 'NotConfiguredError')) throw e;
    console.error('[newsletter] confirm email send failed (row persisted, re-sendable):', e?.message || e);
  }
}

// Mint fresh confirm + unsub tokens, persist their hashes on an existing row
// (plus any extra patch, e.g. status), and send the confirmation email.
async function reissueConfirmAndSend(supabase, id, extraPatch, email, sendFn) {
  const confirm = newToken();
  const unsub = newToken();
  const now = new Date();
  const { error } = await supabase
    .from(TABLE)
    .update({
      ...extraPatch,
      confirm_token_hash: confirm.hash,
      confirm_expires_at: new Date(now.getTime() + CONFIRM_TTL_MS).toISOString(),
      confirm_sent_at: now.toISOString(),
      unsub_token_hash: unsub.hash,
    })
    .eq('id', id);
  if (error) throw new NewsletterError('db_error');
  await safeSend(sendFn, {
    email,
    confirmUrl: confirmUrlFor(confirm.raw),
    unsubUrl: unsubUrlFor(unsub.raw),
  });
}

// -------------------------------------------------------------------------
// subscribeEmail({ email, source, ipHash, sendFn })
//
// sendFn is dependency-injected: the route passes the real
// lib/email/send.js#sendConfirmationEmail; tests pass a mock that records the
// call and never touches Resend. It is awaited as:
//     await sendFn({ email, confirmUrl, unsubUrl })
// only on branches that should send a confirm email. Returns the generic
// { ok:true } on success, or { ok:false, error:'invalid_email' } for a
// malformed address (a validation error is NOT an enumeration signal).
// -------------------------------------------------------------------------
export async function subscribeEmail({ email, source = null, ipHash = null, sendFn } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: 'invalid_email' };
  if (typeof sendFn !== 'function') throw new NewsletterError('missing_send_fn');

  const supabase = getServiceClient();
  if (!supabase) throw new NewsletterError('server_not_configured');

  const { data: existing, error: selErr } = await supabase
    .from(TABLE)
    .select('id, status, confirm_sent_at')
    .eq('email', normalized)
    .maybeSingle();
  if (selErr) throw new NewsletterError('db_error');

  if (existing) {
    const status = existing.status;

    // Already confirmed, or permanently suppressed (bounced/complained): send
    // NOTHING, but answer exactly as if we had.
    if (status === 'active' || SUPPRESSED.has(status)) return GENERIC_OK;

    if (status === 'pending') {
      // Re-send the confirmation at most once per hour.
      const last = existing.confirm_sent_at ? Date.parse(existing.confirm_sent_at) : 0;
      if (last && Date.now() - last < RESEND_MIN_INTERVAL_MS) return GENERIC_OK;
      await reissueConfirmAndSend(supabase, existing.id, { status: 'pending' }, normalized, sendFn);
      return GENERIC_OK;
    }

    if (status === 'unsubscribed') {
      // Opt back in: re-open as pending and send a fresh confirmation.
      await reissueConfirmAndSend(
        supabase,
        existing.id,
        { status: 'pending', unsubscribed_at: null, confirmed_at: null },
        normalized,
        sendFn,
      );
      return GENERIC_OK;
    }

    // Unknown/unexpected status — be safe, send nothing.
    return GENERIC_OK;
  }

  // Brand-new address: insert pending + send the first confirmation.
  const confirm = newToken();
  const unsub = newToken();
  const now = new Date();
  const { error: insErr } = await supabase.from(TABLE).insert({
    email: normalized,
    status: 'pending',
    confirm_token_hash: confirm.hash,
    confirm_expires_at: new Date(now.getTime() + CONFIRM_TTL_MS).toISOString(),
    confirm_sent_at: now.toISOString(),
    unsub_token_hash: unsub.hash,
    source: source || null,
    ip_hash: ipHash || null,
  });

  if (insErr) {
    // A UNIQUE(lower(email)) race (two simultaneous signups) can 409 here; the
    // other request created the row and is sending — treat as success, send
    // nothing (no double email). Any other error is real.
    if (!isUniqueViolation(insErr)) throw new NewsletterError('db_error');
    return GENERIC_OK;
  }

  await safeSend(sendFn, {
    email: normalized,
    confirmUrl: confirmUrlFor(confirm.raw),
    unsubUrl: unsubUrlFor(unsub.raw),
  });
  return GENERIC_OK;
}

// -------------------------------------------------------------------------
// confirmToken(rawToken) — the emailed confirm link.
//   valid + pending + unexpired -> status=active, confirmed_at=now -> { ok:true }
//   already active               -> { ok:true, already:true }  (idempotent)
//   expired                      -> { ok:false, error:'expired' }
//   not found / malformed / db   -> { ok:false, error:'invalid' }
// Never throws — the route maps any non-ok to the "expired" landing page.
// -------------------------------------------------------------------------
export async function confirmToken(rawToken) {
  const hash = hashToken(rawToken);
  if (!hash) return { ok: false, error: 'invalid' };

  const supabase = getServiceClient();
  if (!supabase) return { ok: false, error: 'invalid' };

  const { data: row, error } = await supabase
    .from(TABLE)
    .select('id, status, confirm_expires_at')
    .eq('confirm_token_hash', hash)
    .maybeSingle();
  if (error) return { ok: false, error: 'invalid' };
  if (!row) return { ok: false, error: 'invalid' };

  // Idempotent double-click / re-use of the same link after confirmation.
  if (row.status === 'active') return { ok: true, already: true };

  if (row.confirm_expires_at && Date.parse(row.confirm_expires_at) < Date.now()) {
    return { ok: false, error: 'expired' };
  }

  const { error: updErr } = await supabase
    .from(TABLE)
    .update({ status: 'active', confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq('id', row.id);
  if (updErr) return { ok: false, error: 'invalid' };
  return { ok: true };
}

// -------------------------------------------------------------------------
// unsubscribeToken(rawToken) — the emailed unsubscribe link. Sets
// status=unsubscribed, unsubscribed_at=now. NEVER errors to the user (a missing
// / unknown / already-unsubscribed token still resolves to a friendly ok), and
// never nulls the unsub token (it stays usable). Returns { ok:true } always.
// -------------------------------------------------------------------------
export async function unsubscribeToken(rawToken) {
  const hash = hashToken(rawToken);
  if (!hash) return { ok: true };

  const supabase = getServiceClient();
  if (!supabase) return { ok: true };

  await supabase
    .from(TABLE)
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('unsub_token_hash', hash);
  return { ok: true };
}
