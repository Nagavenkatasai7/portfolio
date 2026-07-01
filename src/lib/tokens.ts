/**
 * Opaque-token helpers for double opt-in and unsubscribe.
 *
 * Design: generate a high-entropy random token, hand the RAW token to the user
 * (in the email link), and store only its SHA-256 hash. Confirmation looks the
 * subscriber up by an indexed equality on the hash (a DB compare — no useful
 * timing side-channel). `safeEqual` is for in-app secret comparisons (e.g. the
 * cron bearer) where a constant-time compare matters.
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** 256-bit URL-safe token. Give this to the user; never store it. */
export function makeToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 of a token as raw bytes, suitable for a Postgres `bytea` column. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Hex form of the hash, if a text column / debugging is preferred. */
export function hashTokenHex(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time equality for two secrets. Guards length first (timingSafeEqual throws on mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
