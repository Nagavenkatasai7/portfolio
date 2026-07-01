/**
 * Subscriber data access for the double opt-in newsletter.
 *
 * Tokens: a raw 256-bit token goes in the email link; only its SHA-256 hash is
 * stored (bytea). Confirmation looks up by an indexed equality on the hash.
 * The unsubscribe token is separate and never reused for confirmation.
 */
import { sql } from './db';
import { makeToken, hashTokenHex } from './tokens';

export type SubscriberStatus =
  | 'pending'
  | 'confirmed'
  | 'unsubscribed'
  | 'bounced'
  | 'complained';

export interface Subscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  resend_contact_id: string | null;
  last_confirm_sent_at: string | null;
  confirm_send_count: number;
  token_expires_at: string | null;
}

const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESEND_COOLDOWN_MS = 10 * 60 * 1000; // 10 min between confirmation emails
const MAX_CONFIRM_SENDS = 5;

export interface SignupContext {
  ip: string | null;
  userAgent: string | null;
  source: string;
  consentText: string;
}

export type StartResult =
  | { action: 'sent'; token: string }
  | { action: 'already_confirmed' }
  | { action: 'throttled' };

export async function getByEmail(email: string): Promise<Subscriber | null> {
  const rows = await sql`
    SELECT id, email, status, resend_contact_id, last_confirm_sent_at,
           confirm_send_count, token_expires_at
    FROM subscribers WHERE email = ${email} LIMIT 1`;
  return (rows[0] as unknown as Subscriber) ?? null;
}

/**
 * Begin (or resume) a subscription. Returns a raw confirmation token to email,
 * or a non-sending outcome (already confirmed / throttled) so the caller can
 * respond identically to the user ("check your inbox") without leaking state or
 * enabling email-bombing.
 */
export async function startSubscription(
  email: string,
  ctx: SignupContext
): Promise<StartResult> {
  const existing = await getByEmail(email);
  if (existing?.status === 'confirmed') return { action: 'already_confirmed' };

  if (existing && existing.status === 'pending') {
    const last = existing.last_confirm_sent_at
      ? new Date(existing.last_confirm_sent_at).getTime()
      : 0;
    if (
      existing.confirm_send_count >= MAX_CONFIRM_SENDS ||
      Date.now() - last < RESEND_COOLDOWN_MS
    ) {
      return { action: 'throttled' };
    }
  }

  const token = makeToken();
  const tokenHash = hashTokenHex(token);
  const expires = new Date(Date.now() + CONFIRM_TTL_MS).toISOString();

  await sql`
    INSERT INTO subscribers
      (email, status, token_hash, token_expires_at, last_confirm_sent_at,
       confirm_send_count, signup_ip, signup_user_agent, signup_source, consent_text)
    VALUES
      (${email}, 'pending', ${tokenHash}, ${expires}, now(), 1,
       ${ctx.ip}, ${ctx.userAgent}, ${ctx.source}, ${ctx.consentText})
    ON CONFLICT (email) DO UPDATE SET
      status = CASE WHEN subscribers.status = 'unsubscribed' THEN 'pending' ELSE subscribers.status END,
      token_hash = ${tokenHash},
      token_expires_at = ${expires},
      last_confirm_sent_at = now(),
      confirm_send_count = subscribers.confirm_send_count + 1,
      signup_ip = ${ctx.ip},
      signup_user_agent = ${ctx.userAgent},
      signup_source = ${ctx.source},
      consent_text = ${ctx.consentText},
      updated_at = now()`;

  return { action: 'sent', token };
}

export async function setResendContactId(
  email: string,
  contactId: string
): Promise<void> {
  await sql`UPDATE subscribers SET resend_contact_id = ${contactId}, updated_at = now() WHERE email = ${email}`;
}

export interface ConfirmResult {
  result: 'confirmed' | 'already' | 'invalid';
  email?: string;
  resendContactId?: string | null;
}

/** Confirm a pending subscriber by raw token. Single-use and idempotent-ish. */
export async function confirmByToken(
  token: string,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<ConfirmResult> {
  const tokenHash = hashTokenHex(token);
  const rows = await sql`
    SELECT id, status, email, resend_contact_id, token_expires_at
    FROM subscribers WHERE token_hash = ${tokenHash} LIMIT 1`;
  const row = rows[0] as unknown as
    | (Subscriber & { email: string })
    | undefined;
  if (!row) return { result: 'invalid' };
  if (row.status === 'confirmed') return { result: 'already', email: row.email };
  if (row.status !== 'pending') return { result: 'invalid' };
  if (
    row.token_expires_at &&
    new Date(row.token_expires_at).getTime() < Date.now()
  ) {
    return { result: 'invalid' };
  }

  const unsubHash = hashTokenHex(makeToken());
  await sql`
    UPDATE subscribers SET
      status = 'confirmed',
      confirmed_at = now(),
      confirm_ip = ${ctx.ip},
      confirm_user_agent = ${ctx.userAgent},
      token_hash = NULL,
      unsub_token_hash = ${unsubHash},
      updated_at = now()
    WHERE id = ${row.id}`;

  return {
    result: 'confirmed',
    email: row.email,
    resendContactId: row.resend_contact_id,
  };
}

export interface UnsubResult {
  result: 'unsubscribed' | 'already' | 'invalid';
  email?: string;
  resendContactId?: string | null;
}

/** Sync a subscriber's status from an external event (Resend webhook). */
export async function setStatusByEmail(
  email: string,
  status: SubscriberStatus
): Promise<void> {
  await sql`
    UPDATE subscribers SET
      status = ${status},
      unsubscribed_at = CASE WHEN ${status} = 'unsubscribed' THEN now() ELSE unsubscribed_at END,
      updated_at = now()
    WHERE email = ${email}`;
}

export interface SubscriberRow {
  id: string;
  email: string;
  status: SubscriberStatus;
  signup_source: string | null;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

export async function listSubscribers(): Promise<SubscriberRow[]> {
  return (await sql`
    SELECT id, email, status, signup_source, created_at, confirmed_at, unsubscribed_at
    FROM subscribers ORDER BY created_at DESC LIMIT 1000`) as unknown as SubscriberRow[];
}

/** GDPR erasure: hard-delete a subscriber; returns the Resend contact id to clean up. */
export async function deleteByEmail(
  email: string
): Promise<{ deleted: boolean; resendContactId: string | null }> {
  const rows = await sql`DELETE FROM subscribers WHERE email = ${email} RETURNING resend_contact_id`;
  const row = rows[0] as unknown as { resend_contact_id: string | null } | undefined;
  return { deleted: Boolean(row), resendContactId: row?.resend_contact_id ?? null };
}

export async function unsubscribeByToken(token: string): Promise<UnsubResult> {
  const h = hashTokenHex(token);
  const rows = await sql`
    SELECT id, status, email, resend_contact_id
    FROM subscribers WHERE unsub_token_hash = ${h} LIMIT 1`;
  const row = rows[0] as unknown as
    | { id: string; status: SubscriberStatus; email: string; resend_contact_id: string | null }
    | undefined;
  if (!row) return { result: 'invalid' };
  if (row.status === 'unsubscribed')
    return { result: 'already', email: row.email };

  await sql`
    UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    WHERE id = ${row.id}`;
  return {
    result: 'unsubscribed',
    email: row.email,
    resendContactId: row.resend_contact_id,
  };
}
