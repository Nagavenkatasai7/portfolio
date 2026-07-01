export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adminGate, json } from '../../../lib/http';
import {
  getIssueById,
  approveIssue,
  markIssueSent,
  markIssueFailed,
} from '../../../lib/issues';
import { sendBroadcast } from '../../../lib/broadcast';

const SendSchema = z.object({ id: z.string().min(1) });

export const POST: APIRoute = async (context) => {
  const auth = await adminGate(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation' }, 400);

  let issue;
  try {
    issue = await getIssueById(parsed.data.id);
  } catch {
    return json({ error: 'db unavailable' }, 503);
  }
  if (!issue) return json({ error: 'not found' }, 404);
  if (issue.status === 'sent') return json({ error: 'already sent' }, 409);
  if (!issue.subject || !issue.body_html) {
    return json({ error: 'incomplete draft' }, 400);
  }

  await approveIssue(issue.id).catch(() => {});

  const result = await sendBroadcast({
    subject: issue.subject,
    html: issue.body_html,
  });
  if ('error' in result) {
    await markIssueFailed(issue.id).catch(() => {});
    return json({ error: result.error }, 502);
  }

  try {
    await markIssueSent(issue.id, result.id);
  } catch {
    /* broadcast sent; status update is best-effort */
  }
  return json({ ok: true, broadcastId: result.id });
};
