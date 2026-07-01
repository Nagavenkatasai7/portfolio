/**
 * Resend Audience/Contacts sync. Postgres is the source of truth; these calls
 * mirror consent state into Resend and are best-effort (never throw upstream).
 * No-ops when RESEND_AUDIENCE_ID is unset.
 */
import { resend } from './resend';

function audienceId(): string | null {
  return process.env.RESEND_AUDIENCE_ID ?? null;
}

/** Create the contact as UNSUBSCRIBED; we flip it to subscribed only on confirm. */
export async function createResendContact(email: string): Promise<string | null> {
  const id = audienceId();
  if (!id) return null;
  try {
    const res = await resend().contacts.create({
      email,
      unsubscribed: true,
      audienceId: id,
    });
    return res.data?.id ?? null;
  } catch {
    return null;
  }
}

export async function removeResendContact(opts: {
  email: string;
  contactId?: string | null;
}): Promise<void> {
  const id = audienceId();
  if (!id) return;
  try {
    if (opts.contactId) {
      await resend().contacts.remove({ id: opts.contactId, audienceId: id });
    } else {
      await resend().contacts.remove({ email: opts.email, audienceId: id });
    }
  } catch {
    /* best-effort */
  }
}

export async function setResendSubscribed(opts: {
  email: string;
  contactId?: string | null;
  subscribed: boolean;
}): Promise<void> {
  const id = audienceId();
  if (!id) return;
  try {
    if (opts.contactId) {
      await resend().contacts.update({
        id: opts.contactId,
        audienceId: id,
        unsubscribed: !opts.subscribed,
      });
    } else {
      await resend().contacts.update({
        email: opts.email,
        audienceId: id,
        unsubscribed: !opts.subscribed,
      });
    }
  } catch {
    /* Postgres remains the source of truth; reconcile later if needed. */
  }
}
