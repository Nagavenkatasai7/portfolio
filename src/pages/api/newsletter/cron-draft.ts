export const prerender = false;

import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { safeEqual } from '../../../lib/tokens';
import {
  getIssueByWeek,
  createIssue,
  listUnusedNotes,
  markNotesUsed,
} from '../../../lib/issues';
import { generateDraft } from '../../../lib/ai';

/** ISO-8601 week label, e.g. "2026-W27" (Vercel Cron fires in UTC). */
function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 +
    Math.round(
      (d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000)
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const GET: APIRoute = async ({ request }) => {
  // FAIL CLOSED: the secret must be configured and long enough. Vercel Cron
  // sends `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET
  // is set. Compare constant-time; never degrade to "Bearer undefined".
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return json({ error: 'not configured' }, 500);
  }
  const provided = request.headers.get('authorization') ?? '';
  if (!safeEqual(provided, `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const week = isoWeek(new Date());

  // Idempotent per ISO week — never generate twice.
  try {
    const existing = await getIssueByWeek(week);
    if (existing) return json({ ok: true, week, skipped: 'exists' });
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
    if (notes.length) {
      await markNotesUsed(notes.map((n) => n.id)).catch(() => {});
    }
    return json({ ok: true, week, issueId: issue.id });
  } catch {
    return json({ error: 'save failed' }, 500);
  }
};
