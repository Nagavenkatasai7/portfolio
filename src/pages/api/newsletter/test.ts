export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adminGate, json } from '../../../lib/http';
import { getIssueById } from '../../../lib/issues';
import { sendEmail } from '../../../lib/resend';
import { CONTACT_TO } from '../../../lib/env';

const TestSchema = z.object({ id: z.string().min(1) });

export const POST: APIRoute = async (context) => {
  const auth = await adminGate(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation' }, 400);

  let issue;
  try {
    issue = await getIssueById(parsed.data.id);
  } catch {
    return json({ error: 'db unavailable' }, 503);
  }
  if (!issue) return json({ error: 'not found' }, 404);

  // The unsubscribe token only resolves inside a real Broadcast — neutralize it
  // for the transactional test send.
  const html = (issue.body_html ?? '').replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, '#');

  try {
    const res = await sendEmail({
      to: CONTACT_TO,
      subject: `[TEST] ${issue.subject ?? 'Newsletter draft'}`,
      html,
      text: issue.body_text ?? '',
    });
    if (res.error) return json({ error: 'send failed' }, 502);
    return json({ ok: true });
  } catch {
    return json({ error: 'send unavailable' }, 502);
  }
};
