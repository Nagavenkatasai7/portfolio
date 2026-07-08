// /admin — the authed dashboard. Independently verifies the session server-side
// (never trusts the page shell), lists content rows of ALL statuses
// (published/draft/removed) from the DB with per-row actions (edit, publish/
// unpublish toggle, remove-to-tombstone / restore), shows session identity, and
// offers logout + a link to the composer. All mutations are same-origin form
// POSTs to /api/content/moderate (which re-checks requireAdmin independently).
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';
import { adminCss, StatusChip, SourceChip } from './ui';
import LocalTime from './LocalTime';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin | Naga Venkata Sai Chennu', robots: { index: false, follow: false } };

const TYPE_LABEL = { blog: 'Blog', newsletter: 'Newsletter', video: 'Video', image: 'Image', text: 'Post', thread: 'Thread', link: 'Link' };

function fmtUtc(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch { return String(ts); }
}

const MOD_ERRORS = {
  unconfigured: 'The database isn’t configured on this deployment.',
  notfound: 'That item no longer exists.',
  failed: 'That action could not be completed. Try again.',
};

async function loadRows() {
  const supabase = getServiceClient();
  if (!supabase) return { rows: null, error: 'db_not_configured' };
  const { data, error } = await supabase
    .from('content')
    .select('id, source, external_id, type, status, title, published_at, updated_at, deleted_at')
    .order('published_at', { ascending: false })
    .limit(300);
  if (error) return { rows: null, error: 'db_error' };
  return { rows: data || [], error: null };
}

// One row's action buttons: edit, publish/unpublish toggle, remove/restore.
function RowActions({ r }) {
  const removed = Boolean(r.deleted_at) || r.status === 'removed';
  return (
    <div className="rowtools">
      <a className="btn sm" href={`/admin/edit/${r.id}`}>Edit</a>
      {!removed && r.status === 'published' && (
        <form method="POST" action="/api/content/moderate">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="action" value="draft" />
          <button className="btn sm" type="submit" title="Move back to draft (hide from /blog)">Unpublish</button>
        </form>
      )}
      {!removed && r.status === 'draft' && (
        <form method="POST" action="/api/content/moderate">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="action" value="publish" />
          <button className="btn sm primary" type="submit" title="Publish to /blog">Publish</button>
        </form>
      )}
      {removed ? (
        <form method="POST" action="/api/content/moderate">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="action" value="draft" />
          <button className="btn sm" type="submit" title="Restore as a draft">Restore</button>
        </form>
      ) : (
        <form method="POST" action="/api/content/moderate">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="action" value="remove" />
          <button className="btn sm danger" type="submit" title="Remove from blog (tombstone)">Remove</button>
        </form>
      )}
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
  // Fail-closed: unconfigured auth => cannot be admin => send to login.
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  const sp = searchParams ? await searchParams : {};
  const modError = typeof sp?.e === 'string' ? MOD_ERRORS[sp.e] : null;
  const filter = sp?.src === 'x_auto' ? 'x_auto' : null;

  const { rows, error } = await loadRows();
  const counts = { published: 0, draft: 0, removed: 0 };
  if (rows) for (const r of rows) {
    if (r.deleted_at || r.status === 'removed') counts.removed++;
    else if (r.status === 'published') counts.published++;
    else if (r.status === 'draft') counts.draft++;
  }
  // x_auto = LLM-drafted X posts from the studio. Counts stay global; the
  // filter only narrows the displayed rows (all statuses remain actionable).
  const xCount = rows ? rows.filter((r) => r.source === 'x_auto').length : 0;
  const shown = rows ? (filter === 'x_auto' ? rows.filter((r) => r.source === 'x_auto') : rows) : rows;

  return (
    <div className="adm">
      <style>{adminCss}</style>
      <div className="wrap">
        <div className="topbar">
          <div>
            <div className="mark">NC</div>
            <p className="eyebrow">Admin dashboard</p>
            <h1><span className="hl">Content</span> control</h1>
          </div>
          <div className="row-actions">
            <a className="btn primary" href="/admin/compose">+ New post</a>
            <a className="btn" href="/admin/x">✕ X studio</a>
            <a className="btn" href="/blog">View /blog</a>
            <a className="btn" href="/">Portfolio</a>
            {/* Mutating => real form POST so the strict-sameSite cookie + Origin check apply. */}
            <form method="POST" action="/api/auth/logout" style={{ margin: 0 }}>
              <button className="btn" type="submit">Log out</button>
            </form>
          </div>
        </div>

        <p className="lede" style={{ marginTop: 18 }}>
          Everything published, drafted, or removed lives here. New items start as drafts —
          you publish them explicitly. “Remove” tombstones an item so the public blog hides it.
        </p>

        {modError && <div className="banner err">{modError}</div>}

        <div className="card" style={{ marginBottom: 18 }}>
          <p className="eyebrow" style={{ margin: '0 0 10px' }}>Session</p>
          <div className="stat-row" style={{ marginBottom: 10 }}>
            <div className="stat"><b>{counts.published}</b><span>Published</span></div>
            <div className="stat"><b>{counts.draft}</b><span>Draft</span></div>
            <div className="stat"><b>{counts.removed}</b><span>Removed</span></div>
          </div>
          <p className="meta" style={{ margin: 0 }}>
            github_id={String(session.sub)} · issued={fmtUtc(session.iat ? session.iat * 1000 : null)} ·
            expires={fmtUtc(session.exp ? session.exp * 1000 : null)}
          </p>
        </div>

        {error === 'db_not_configured' && (
          <div className="card">
            <p style={{ margin: 0 }}>
              The database isn’t connected on this deployment yet
              (<span className="meta">SUPABASE_URL</span> / <span className="meta">SUPABASE_SERVICE_ROLE_KEY</span>).
              Once Supabase is connected, content rows appear here.
            </p>
          </div>
        )}
        {error === 'db_error' && (
          <div className="card"><p style={{ margin: 0 }}>Could not load content from the database.</p></div>
        )}

        {rows && rows.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <h2 style={{ marginBottom: 6 }}>No content yet</h2>
            <p className="meta" style={{ marginBottom: 18 }}>Create your first post with the composer.</p>
            <a className="btn primary" href="/admin/compose">+ New post</a>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="row-actions" style={{ margin: '0 0 14px' }}>
            <a className={`btn sm${filter ? '' : ' primary'}`} href="/admin">All ({rows.length})</a>
            <a className={`btn sm${filter === 'x_auto' ? ' primary' : ''}`} href="/admin?src=x_auto">✕ X drafts ({xCount})</a>
          </div>
        )}

        {rows && rows.length > 0 && shown.length === 0 && filter === 'x_auto' && (
          <div className="card">
            <p style={{ margin: 0 }}>No X drafts yet. <a href="/admin/x" style={{ textDecoration: 'underline', fontWeight: 700 }}>Open the X studio →</a></p>
          </div>
        )}

        {shown && shown.length > 0 && (
          <div className="tablewrap">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Status</th><th>Source</th><th>Type</th><th>Title</th>
                    <th>Published</th><th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td><StatusChip status={r.status} deleted={Boolean(r.deleted_at)} /></td>
                      <td><SourceChip source={r.source} /></td>
                      <td className="mono">{TYPE_LABEL[r.type] || r.type}</td>
                      <td>
                        <div className="title-cell">{r.title || <span className="meta">(untitled)</span>}</div>
                        <span className="ext mono">{r.external_id}</span>
                      </td>
                      <td>
                        <div className="utc">{fmtUtc(r.published_at)}</div>
                        <LocalTime iso={r.published_at} />
                      </td>
                      <td><div style={{ display: 'flex', justifyContent: 'flex-end' }}><RowActions r={r} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
