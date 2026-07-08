// /admin — the authed dashboard. Independently verifies the session server-side
// (never trusts the page shell), lists content rows of ALL statuses from the
// DB, shows session info, and offers logout. No composer yet (next phase).
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';
import { adminCss, Chip } from './ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin | Naga Venkata Sai Chennu', robots: { index: false, follow: false } };

function fmt(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toISOString().replace('T', ' ').replace('.000Z', 'Z').slice(0, 19) + 'Z';
  } catch {
    return String(ts);
  }
}

async function loadRows() {
  const supabase = getServiceClient();
  if (!supabase) return { rows: null, error: 'db_not_configured' };
  const { data, error } = await supabase
    .from('content')
    .select('id, source, external_id, type, status, title, published_at, updated_at, deleted_at')
    .order('published_at', { ascending: false })
    .limit(200);
  if (error) return { rows: null, error: 'db_error' };
  return { rows: data || [], error: null };
}

export default async function AdminPage() {
  // Fail-closed: unconfigured auth => cannot be admin => send to login.
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  const { rows, error } = await loadRows();

  return (
    <div className="adm">
      <style>{adminCss}</style>
      <div className="wrap">
        <div className="mark">NC</div>
        <p className="eyebrow">Admin dashboard</p>
        <h1>Content</h1>

        <div className="row-actions">
          <a className="btn" href="/blog">View /blog</a>
          <a className="btn" href="/">Portfolio</a>
          {/* Mutating => real form POST so the strict-sameSite cookie + Origin
              check apply. */}
          <form method="POST" action="/api/auth/logout" style={{ margin: 0 }}>
            <button className="btn" type="submit">Log out</button>
          </form>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <p className="eyebrow" style={{ marginTop: 0 }}>Session</p>
          <p className="meta">
            github_id={String(session.sub)} · issued={fmt(session.iat ? session.iat * 1000 : null)} ·
            expires={fmt(session.exp ? session.exp * 1000 : null)}
          </p>
        </div>

        {error === 'db_not_configured' && (
          <div className="card">
            <p style={{ margin: 0 }}>
              The database isn&apos;t connected on this deployment yet
              (<span className="meta">SUPABASE_URL</span> / <span className="meta">SUPABASE_SERVICE_ROLE_KEY</span>).
              Once the Supabase resource is connected, content rows appear here.
            </p>
          </div>
        )}
        {error === 'db_error' && (
          <div className="card"><p style={{ margin: 0 }}>Could not load content from the database.</p></div>
        )}

        {rows && rows.length === 0 && (
          <div className="card"><p style={{ margin: 0 }}>No content yet. Ingest something via <span className="meta">POST /api/ingest</span>.</p></div>
        )}

        {rows && rows.length > 0 && (
          <div className="card scroll">
            <table>
              <thead>
                <tr>
                  <th>Status</th><th>Type</th><th>Source</th><th>Title</th>
                  <th>Published (UTC)</th><th>Updated (UTC)</th><th>External id</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Chip kind={r.deleted_at ? 'removed' : r.status}>{r.deleted_at ? 'deleted' : r.status}</Chip></td>
                    <td>{r.type}</td>
                    <td className="mono">{r.source}</td>
                    <td>{r.title || <span className="meta">(untitled)</span>}</td>
                    <td className="mono">{fmt(r.published_at)}</td>
                    <td className="mono">{fmt(r.updated_at)}</td>
                    <td className="mono" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.external_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
