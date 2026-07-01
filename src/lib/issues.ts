/**
 * Newsletter issue + notes data access. All queries parameterized.
 */
import { sql } from './db';

export type IssueStatus =
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'sent'
  | 'failed';

export interface Issue {
  id: string;
  iso_week: string;
  subject: string | null;
  preheader: string | null;
  body_html: string | null;
  body_text: string | null;
  owner_notes: string | null;
  ai_sources: unknown;
  status: IssueStatus;
  resend_broadcast_id: string | null;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
}

export interface NoteRow {
  id: string;
  content: string;
  url: string | null;
  used: boolean;
  created_at: string;
}

export async function getIssueByWeek(isoWeek: string): Promise<Issue | null> {
  const rows = await sql`SELECT * FROM newsletter_issues WHERE iso_week = ${isoWeek} LIMIT 1`;
  return (rows[0] as unknown as Issue) ?? null;
}

export async function listIssues(): Promise<Issue[]> {
  return (await sql`
    SELECT * FROM newsletter_issues ORDER BY created_at DESC`) as unknown as Issue[];
}

export async function getIssueById(id: string): Promise<Issue | null> {
  const rows = await sql`SELECT * FROM newsletter_issues WHERE id = ${id} LIMIT 1`;
  return (rows[0] as unknown as Issue) ?? null;
}

export interface NewIssue {
  iso_week: string;
  subject: string | null;
  preheader: string | null;
  body_html: string | null;
  body_text: string | null;
  owner_notes: string | null;
  ai_sources: unknown;
}

export async function createIssue(i: NewIssue): Promise<Issue> {
  const rows = await sql`
    INSERT INTO newsletter_issues
      (iso_week, subject, preheader, body_html, body_text, owner_notes, ai_sources, status)
    VALUES
      (${i.iso_week}, ${i.subject}, ${i.preheader}, ${i.body_html}, ${i.body_text},
       ${i.owner_notes}, ${JSON.stringify(i.ai_sources ?? null)}::jsonb, 'pending_review')
    RETURNING *`;
  return rows[0] as unknown as Issue;
}

export async function updateIssueContent(
  id: string,
  c: { subject: string; preheader: string; body_html: string; body_text: string }
): Promise<Issue | null> {
  const rows = await sql`
    UPDATE newsletter_issues SET
      subject = ${c.subject},
      preheader = ${c.preheader},
      body_html = ${c.body_html},
      body_text = ${c.body_text},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return (rows[0] as unknown as Issue) ?? null;
}

export async function approveIssue(id: string): Promise<void> {
  await sql`UPDATE newsletter_issues SET status = 'approved', approved_at = now(), updated_at = now() WHERE id = ${id}`;
}

export async function markIssueSent(id: string, broadcastId: string): Promise<void> {
  await sql`
    UPDATE newsletter_issues
    SET status = 'sent', sent_at = now(), resend_broadcast_id = ${broadcastId}, updated_at = now()
    WHERE id = ${id}`;
}

export async function markIssueFailed(id: string): Promise<void> {
  await sql`UPDATE newsletter_issues SET status = 'failed', updated_at = now() WHERE id = ${id}`;
}

export async function listUnusedNotes(): Promise<NoteRow[]> {
  return (await sql`
    SELECT * FROM newsletter_notes WHERE used = false ORDER BY created_at ASC`) as unknown as NoteRow[];
}

export async function listAllNotes(): Promise<NoteRow[]> {
  return (await sql`
    SELECT * FROM newsletter_notes ORDER BY created_at DESC LIMIT 100`) as unknown as NoteRow[];
}

export async function markNotesUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`UPDATE newsletter_notes SET used = true WHERE id = ANY(${ids}::uuid[])`;
}

export async function addNote(content: string, url: string | null): Promise<NoteRow> {
  const rows = await sql`
    INSERT INTO newsletter_notes (content, url) VALUES (${content}, ${url}) RETURNING *`;
  return rows[0] as unknown as NoteRow;
}
