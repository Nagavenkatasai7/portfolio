export const prerender = false;

import type { APIRoute } from 'astro';
import { adminGate, json } from '../../../lib/http';
import { isoWeek } from '../../../lib/week';
import {
  getIssueByWeek,
  createIssue,
  listUnusedNotes,
  markNotesUsed,
} from '../../../lib/issues';
import { generateDraft } from '../../../lib/ai';

// Manual "Generate now" — same pipeline as the cron, admin-triggered.
export const POST: APIRoute = async (context) => {
  const auth = await adminGate(context);
  if (auth instanceof Response) return auth;

  const week = isoWeek(new Date());
  try {
    const existing = await getIssueByWeek(week);
    if (existing) return json({ ok: true, week, issueId: existing.id, existed: true });
  } catch {
    return json({ error: 'db unavailable' }, 503);
  }

  const notes = await listUnusedNotes().catch(() => []);
  let draft;
  let sources: unknown[] = [];
  try {
    const gen = await generateDraft(
      week,
      notes.map((n) => ({ content: n.content, url: n.url }))
    );
    draft = gen.draft;
    sources = gen.sources;
  } catch {
    return json({ error: 'generation failed' }, 502);
  }

  try {
    const issue = await createIssue({
      iso_week: week,
      subject: draft.subject,
      preheader: draft.preheader,
      body_html: draft.html,
      body_text: draft.plaintext,
      owner_notes: notes.length ? notes.map((n) => n.content).join('\n') : null,
      ai_sources: sources,
    });
    if (notes.length) await markNotesUsed(notes.map((n) => n.id)).catch(() => {});
    return json({ ok: true, week, issueId: issue.id });
  } catch {
    return json({ error: 'save failed' }, 500);
  }
};
