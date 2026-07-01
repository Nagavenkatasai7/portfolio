export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adminGate, json } from '../../../lib/http';
import { deleteByEmail } from '../../../lib/subscribers';
import { removeResendContact } from '../../../lib/audience';

const Schema = z.object({ email: z.string().min(3).max(200) });

// GDPR erasure — admin-only. Hard-deletes the subscriber and removes the
// Resend contact.
export const POST: APIRoute = async (context) => {
  const auth = await adminGate(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation' }, 400);

  const email = parsed.data.email.toLowerCase();
  try {
    const res = await deleteByEmail(email);
    await removeResendContact({ email, contactId: res.resendContactId });
    return json({ ok: true, deleted: res.deleted });
  } catch {
    return json({ error: 'delete failed' }, 500);
  }
};
