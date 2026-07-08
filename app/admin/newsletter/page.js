// /admin/newsletter — The Field Guide studio (Phase N2). Independently verifies
// the admin session server-side (never trusts the shell), loads the subscriber
// stats + list, the issues (with per-issue delivery stats), the newsletter-type
// content rows that can become issues, the link bin, and the send cron's health
// (dead-man's-switch), then hands them to the client studio. All MUTATIONS go
// through the admin-gated JSON APIs under /api/admin/newsletter/* (each re-checks
// requireAdmin + isSameOrigin); this page only READS, via the service-role
// chokepoint lib/newsletter_issues.js.
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { isEmailConfigured } from '@/lib/email/send';
import {
  overallSubscriberStats, listSubscribers, listIssues, listIssuableContent,
  listLinks, statsForIssue, getNewsletterHealth,
} from '@/lib/newsletter_issues';
import { adminCss } from '../ui';
import NewsletterStudio from '../NewsletterStudio';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Newsletter | Naga Venkata Sai Chennu', robots: { index: false, follow: false } };

async function loadAll() {
  try {
    const [stats, subscribers, issuesRaw, issuable, links, health] = await Promise.all([
      overallSubscriberStats(),
      listSubscribers({ limit: 2000 }),
      listIssues({ limit: 200 }),
      listIssuableContent({ limit: 100 }),
      listLinks({ limit: 500 }),
      getNewsletterHealth(),
    ]);
    // Enrich issues with delivery stats (only where there are sends — a draft /
    // approved issue has none, so we skip the query and use zeros).
    const issues = await Promise.all(issuesRaw.map(async (m) => {
      const s = (m.status === 'sending' || m.status === 'sent')
        ? await statsForIssue(m.content_id)
        : { counts: { queued: 0, sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0 }, total: 0 };
      return { ...m, stats: { counts: s.counts, total: s.total } };
    }));
    return { data: { stats, subscribers, issues, issuable, links, health }, error: null };
  } catch (err) {
    return { data: null, error: err?.code === 'server_not_configured' ? 'db_not_configured' : 'db_error' };
  }
}

export default async function NewsletterAdminPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  const { data, error } = await loadAll();

  const config = {
    emailConfigured: isEmailConfigured(),
    webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    resendAudienceConfigured: Boolean(process.env.RESEND_AUDIENCE_ID && process.env.RESEND_API_KEY),
    postalConfigured: Boolean(process.env.NEWSLETTER_POSTAL_ADDRESS),
  };

  return (
    <div className="adm">
      <style>{adminCss}</style>
      <div className="wrap">
        <div className="topbar">
          <div>
            <div className="mark">NC</div>
            <p className="eyebrow">Admin · The Field Guide</p>
            <h1><span className="hl">Newsletter</span> studio</h1>
          </div>
          <div className="row-actions">
            <a className="btn" href="/admin">← Dashboard</a>
            <a className="btn" href="/admin/compose">+ New post</a>
            <a className="btn" href="/blog">View /blog</a>
          </div>
        </div>

        {error === 'db_not_configured' && (
          <div className="card" style={{ marginTop: 18 }}>
            <p style={{ margin: 0 }}>
              The database isn’t connected on this deployment yet
              (<span className="meta">SUPABASE_URL</span> / <span className="meta">SUPABASE_SERVICE_ROLE_KEY</span>).
              Once Supabase is connected, the studio populates here.
            </p>
          </div>
        )}
        {error === 'db_error' && (
          <div className="card" style={{ marginTop: 18 }}>
            <p style={{ margin: 0 }}>Could not load the newsletter studio from the database.</p>
          </div>
        )}

        {data && (
          <NewsletterStudio
            stats={data.stats}
            subscribers={data.subscribers}
            issues={data.issues}
            issuable={data.issuable}
            links={data.links}
            health={data.health}
            config={config}
          />
        )}
      </div>
    </div>
  );
}
