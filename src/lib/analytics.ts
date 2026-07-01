/**
 * Domain analytics into the analytics_events table. General page views are
 * handled client-side by Vercel Web Analytics; this captures the events that
 * matter for the newsletter (subscribe/confirm/unsubscribe, sends, opens/clicks).
 * All writes are best-effort and never throw into the request path.
 */
import { sql } from './db';

export type AnalyticsEventType =
  | 'page_view'
  | 'subscribe'
  | 'confirm'
  | 'unsubscribe'
  | 'contact_submit'
  | 'newsletter_sent'
  | 'email_open'
  | 'email_click'
  | 'bounce'
  | 'complaint';

export async function logEvent(
  eventType: AnalyticsEventType,
  opts: {
    path?: string | null;
    referrer?: string | null;
    subscriberId?: string | null;
    issueId?: string | null;
    meta?: unknown;
  } = {}
): Promise<void> {
  try {
    await sql`
      INSERT INTO analytics_events (event_type, path, referrer, subscriber_id, issue_id, meta)
      VALUES (${eventType}, ${opts.path ?? null}, ${opts.referrer ?? null},
              ${opts.subscriberId ?? null}, ${opts.issueId ?? null},
              ${JSON.stringify(opts.meta ?? null)}::jsonb)`;
  } catch {
    /* best-effort */
  }
}

export interface Stats {
  confirmed: number;
  pending: number;
  unsubscribed: number;
  totalSubs: number;
  issuesSent: number;
  opens30: number;
  clicks30: number;
  messages: number;
}

export async function getStats(): Promise<Stats> {
  const rows = await sql`
    SELECT
      (SELECT count(*)::int FROM subscribers WHERE status = 'confirmed')    AS confirmed,
      (SELECT count(*)::int FROM subscribers WHERE status = 'pending')      AS pending,
      (SELECT count(*)::int FROM subscribers WHERE status = 'unsubscribed') AS unsubscribed,
      (SELECT count(*)::int FROM subscribers)                               AS total_subs,
      (SELECT count(*)::int FROM newsletter_issues WHERE status = 'sent')   AS issues_sent,
      (SELECT count(*)::int FROM analytics_events
         WHERE event_type = 'email_open' AND created_at > now() - interval '30 days') AS opens30,
      (SELECT count(*)::int FROM analytics_events
         WHERE event_type = 'email_click' AND created_at > now() - interval '30 days') AS clicks30,
      (SELECT count(*)::int FROM contact_messages)                          AS messages`;
  const r = (rows[0] ?? {}) as Record<string, number>;
  return {
    confirmed: r.confirmed ?? 0,
    pending: r.pending ?? 0,
    unsubscribed: r.unsubscribed ?? 0,
    totalSubs: r.total_subs ?? 0,
    issuesSent: r.issues_sent ?? 0,
    opens30: r.opens30 ?? 0,
    clicks30: r.clicks30 ?? 0,
    messages: r.messages ?? 0,
  };
}
