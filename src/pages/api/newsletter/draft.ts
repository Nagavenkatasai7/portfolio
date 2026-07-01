export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adminGate, json } from '../../../lib/http';
import { updateIssueContent } from '../../../lib/issues';
import { sanitizeEmailHtml } from '../../../lib/sanitize';

const DraftSaveSchema = z.object({
  id: z.string().min(1),
  subject: z.string().max(200),
  preheader: z.string().max(300),
  body_html: z.string().max(200_000),
  body_text: z.string().max(200_000),
});

export const PUT: APIRoute = async (context) => {
  const auth = await adminGate(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = DraftSaveSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation' }, 400);
  const d = parsed.data;

  try {
    // Sanitize owner-edited HTML before it is stored / previewed / sent.
    const issue = await updateIssueContent(d.id, {
      subject: d.subject,
      preheader: d.preheader,
      body_html: sanitizeEmailHtml(d.body_html),
      body_text: d.body_text,
    });
    if (!issue) return json({ error: 'not found' }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: 'save failed' }, 500);
  }
};
