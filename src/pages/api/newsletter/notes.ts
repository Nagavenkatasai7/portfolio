export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adminGate, json } from '../../../lib/http';
import { addNote } from '../../../lib/issues';

const NoteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  url: z.string().max(500).optional().nullable(),
});

// Owner "notes inbox" — jot links/ideas during the week for the next issue.
export const POST: APIRoute = async (context) => {
  const auth = await adminGate(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation' }, 400);

  try {
    const note = await addNote(parsed.data.content, parsed.data.url ?? null);
    return json({ ok: true, note });
  } catch {
    return json({ error: 'save failed' }, 500);
  }
};
