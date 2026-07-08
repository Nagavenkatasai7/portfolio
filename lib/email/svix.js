// ============================================================
// lib/email/svix.js — HAND-ROLLED Svix webhook signature verification (Phase N2).
//
// Resend signs delivery webhooks with the Svix scheme. Rather than add the
// `svix` npm dependency, we verify with node:crypto only. The scheme:
//
//   signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
//   key           = base64-decode(RESEND_WEBHOOK_SECRET without its 'whsec_')
//   expected      = base64( HMAC-SHA256(key, signedContent) )
//   svix-signature header = space-separated list of `v1,<base64sig>` candidates
//                           (there can be several during a secret rotation)
//
// A webhook is valid iff some `v1` candidate equals `expected` (constant-time)
// AND the timestamp is within ±5 minutes (replay defense). Pure + dependency-
// injectable (`now`) so the verify script can build valid / invalid / stale
// requests without a live endpoint.
// ============================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TOLERANCE_SEC = 5 * 60; // ±5 minutes

// base64-decode the signing key. Resend/Svix secrets look like `whsec_<base64>`;
// the key is the base64 AFTER the prefix. (Defensive: if no prefix, treat the
// whole value as base64.) Returns a Buffer, or null if it can't be decoded.
export function parseWhsecKey(secret) {
  if (typeof secret !== 'string' || !secret) return null;
  const b64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    const buf = Buffer.from(b64, 'base64');
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

// base64 HMAC-SHA256 of `content` under `keyBytes` (a Buffer).
export function svixSign(keyBytes, content) {
  return createHmac('sha256', keyBytes).update(content, 'utf8').digest('base64');
}

// Build a valid `svix-signature` header value for a payload — used by tests.
export function svixSignatureHeader(secret, svixId, svixTimestamp, body) {
  const key = parseWhsecKey(secret);
  if (!key) return '';
  return `v1,${svixSign(key, `${svixId}.${svixTimestamp}.${body}`)}`;
}

function constEq(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try { return timingSafeEqual(ba, bb); } catch { return false; }
}

// Verify a Resend/Svix webhook. Returns { ok:true } or { ok:false, error }.
//   error: 'not_configured' | 'bad_secret' | 'missing_headers' | 'bad_timestamp'
//        | 'stale_timestamp' | 'bad_signature'
export function verifyResendWebhook({
  secret,
  svixId,
  svixTimestamp,
  signatureHeader,
  body,
  now = Date.now,
  toleranceSec = DEFAULT_TOLERANCE_SEC,
} = {}) {
  if (!secret) return { ok: false, error: 'not_configured' };
  const key = parseWhsecKey(secret);
  if (!key) return { ok: false, error: 'bad_secret' };
  if (!svixId || !svixTimestamp || !signatureHeader) return { ok: false, error: 'missing_headers' };

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: 'bad_timestamp' };
  const nowSec = Math.floor((typeof now === 'function' ? now() : now) / 1000);
  if (Math.abs(nowSec - ts) > toleranceSec) return { ok: false, error: 'stale_timestamp' };

  const expected = svixSign(key, `${svixId}.${svixTimestamp}.${body}`);
  for (const candidate of String(signatureHeader).split(' ')) {
    const comma = candidate.indexOf(',');
    if (comma < 0) continue;
    const scheme = candidate.slice(0, comma);
    if (scheme !== 'v1') continue; // only the v1 HMAC scheme
    const sig = candidate.slice(comma + 1);
    if (constEq(sig, expected)) return { ok: true };
  }
  return { ok: false, error: 'bad_signature' };
}
