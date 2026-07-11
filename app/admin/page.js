// /admin — the authed dashboard. Independently verifies the session server-side
// (never trusts the page shell), lists content rows of ALL statuses
// (published/draft/removed) from the DB with per-row actions (edit, publish/
// unpublish toggle, remove-to-tombstone / restore), shows session identity, and
// offers logout + a link to the composer. All mutations are same-origin form
// POSTs to /api/content/moderate (which re-checks requireAdmin independently).
//
// Scaling: the row list is PAGINATED server-side (offset .range, PAGE_SIZE per
// page) and FILTERABLE by status / type / source / title — so the dashboard no
// longer silently hides content past a fixed cap. The Published/Draft/Removed
// tallies (and the X-drafts count) come from real COUNT(*) queries over ALL
// content, independent of the current page or filter, so they never undercount.
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';
import { getSyncHealth, syncStaleness, isFgbConfigured } from '@/lib/linkedin_sync';
import { adminCss, StatusChip, SourceChip } from './ui';
import LocalTime from './LocalTime';
import ConfirmForm from './ConfirmForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin | Naga Venkata Sai Chennu', robots: { index: false, follow: false } };

const PAGE_SIZE = 50;

const TYPE_LABEL = { blog: 'Blog', newsletter: 'Newsletter', video: 'Video', image: 'Image', text: 'Post', thread: 'Thread', link: 'Link' };
const TYPE_KEYS = new Set(Object.keys(TYPE_LABEL));

// Source values the dashboard filters by (matches lib/canonical.js SOURCES).
const SOURCE_LABEL = {
  blog: 'Blog', newsletter: 'Newsletter', video: 'Video', image: 'Image',
  linkedin_manual: 'LinkedIn (manual)', x_manual: 'X (manual)',
  linkedin_auto: 'LinkedIn (auto)', x_auto: 'X (auto)',
};
const SOURCE_KEYS = new Set(Object.keys(SOURCE_LABEL));
const STATUS_KEYS = new Set(['published', 'draft', 'removed']);

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

// Apply the status filter to a query, matching the row-chip logic exactly:
// a row counts as "removed" when it has a tombstone (deleted_at) OR status
// 'removed'; "published"/"draft" require a NULL tombstone.
function applyStatus(query, status) {
  if (status === 'published') return query.eq('status', 'published').is('deleted_at', null);
  if (status === 'draft') return query.eq('status', 'draft').is('deleted_at', null);
  if (status === 'removed') return query.or('deleted_at.not.is.null,status.eq.removed');
  return query;
}

// Load ONE page of rows for the current filter + the GLOBAL status tallies.
// The tallies are COUNT(*) over all content (not the truncated page), so they
// stay correct no matter how much content exists.
async function loadDashboard({ status, type, source, q, page }) {
  const supabase = getServiceClient();
  if (!supabase) return { rows: null, error: 'db_not_configured', total: 0, tallies: null };

  const COLS = 'id, source, external_id, type, status, title, published_at, updated_at, deleted_at';
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from('content').select(COLS, { count: 'exact' });
  query = applyStatus(query, status);
  if (type) query = query.eq('type', type);
  if (source) query = query.eq('source', source);
  if (q) query = query.ilike('title', `%${q}%`);
  query = query
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) return { rows: null, error: 'db_error', total: 0, tallies: null };

  // Global tallies — COUNT(*) head queries, independent of the active filter/page.
  const head = () => supabase.from('content').select('id', { count: 'exact', head: true });
  const [pub, dr, rm, xc] = await Promise.all([
    head().eq('status', 'published').is('deleted_at', null),
    head().eq('status', 'draft').is('deleted_at', null),
    head().or('deleted_at.not.is.null,status.eq.removed'),
    head().eq('source', 'x_auto'),
  ]);
  const tallies = {
    published: pub.count || 0,
    draft: dr.count || 0,
    removed: rm.count || 0,
    xAuto: xc.count || 0,
  };
  tallies.total = tallies.published + tallies.draft + tallies.removed;

  return { rows: data || [], total: count || 0, tallies, error: null };
}

// Build a stable /admin href that preserves the active filter (dropping page 1).
function buildHref({ status, type, source, q, page }) {
  const usp = new URLSearchParams();
  if (status) usp.set('status', status);
  if (type) usp.set('type', type);
  if (source) usp.set('source', source);
  if (q) usp.set('q', q);
  if (page && page > 1) usp.set('page', String(page));
  const s = usp.toString();
  return s ? `/admin?${s}` : '/admin';
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
        <ConfirmForm
          action="/api/content/moderate"
          fields={{ id: r.id, action: 'remove' }}
          confirm="Remove this from /blog? It will be tombstoned — you can restore it later."
          className="btn sm danger"
          title="Remove from blog (tombstone)"
        >Remove</ConfirmForm>
      )}
    </div>
  );
}

// Dead-man's-switch surface for the READ-ONLY LinkedIn sync (Phase F). Shows
// last success / last error / staleness so a broken or missed sync is visible.
// The sync stays DORMANT until FGB_READONLY_DATABASE_URL is set on the
// deployment; until then this card says "not enabled".
function SyncHealthCard({ health, enabled }) {
  const s = syncStaleness(health);
  const LABEL = {
    ok: 'Healthy', stale: 'STALE — check the sync', error: 'ERROR — last run failed',
    unknown: enabled ? 'Enabled, no successful run yet' : 'Not enabled',
  };
  const COLOR = { ok: '#1f7a4d', stale: '#b06a00', error: '#b4231b', unknown: '#756b62' };
  const level = enabled ? s.level : 'unknown';
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <p className="eyebrow" style={{ margin: '0 0 10px' }}>LinkedIn sync (read-only)</p>
      <div className="stat-row" style={{ marginBottom: 10, alignItems: 'center' }}>
        <div className="stat">
          <b style={{ color: COLOR[level] }}>●</b>
          <span style={{ fontWeight: 700, color: COLOR[level] }}>{LABEL[level]}</span>
        </div>
        <div className="stat"><b>{health?.synced_count ?? 0}</b><span>Last synced</span></div>
        <div className="stat"><b>{health?.created_count ?? 0}</b><span>New</span></div>
        <div className="stat"><b>{health?.updated_count ?? 0}</b><span>Updated</span></div>
      </div>
      <p className="meta" style={{ margin: 0 }}>
        last_success={fmtUtc(health?.last_success_at)} · last_run={fmtUtc(health?.last_run_at)}
        {health?.locked_by ? ' · running now' : ''}
        {!enabled && ' · dormant until FGB_READONLY_DATABASE_URL is set (see RUNBOOK-LINKEDIN.md)'}
      </p>
      {health?.last_error && (
        <p className="meta" style={{ margin: '6px 0 0', color: '#b4231b' }}>
          last_error: {String(health.last_error).slice(0, 200)} ({fmtUtc(health.last_error_at)})
        </p>
      )}
    </div>
  );
}

// The server-side filter bar: a plain GET <form> (no client JS) whose selects +
// title search rewrite /admin?…; submitting resets to page 1.
function FilterBar({ status, type, source, q }) {
  const active = Boolean(status || type || source || q);
  return (
    <form method="get" action="/admin" className="card" style={{ marginBottom: 18 }}>
      <p className="eyebrow" style={{ margin: '0 0 10px' }}>Filter</p>
      <div className="row-actions" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div className="field" style={{ margin: 0, minWidth: 150 }}>
          <label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" defaultValue={status || ''}>
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="removed">Removed</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 150 }}>
          <label htmlFor="f-type">Type</label>
          <select id="f-type" name="type" defaultValue={type || ''}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 170 }}>
          <label htmlFor="f-source">Source</label>
          <select id="f-source" name="source" defaultValue={source || ''}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <label htmlFor="f-q">Title search</label>
          <input id="f-q" type="text" name="q" defaultValue={q} placeholder="Search titles…" />
        </div>
        <div className="row-actions" style={{ margin: 0 }}>
          <button className="btn sm primary" type="submit">Apply</button>
          {active && <a className="btn sm" href="/admin">Clear</a>}
        </div>
      </div>
    </form>
  );
}

export default async function AdminPage({ searchParams }) {
  // Fail-closed: unconfigured auth => cannot be admin => send to login.
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  const sp = searchParams ? await searchParams : {};
  const modError = typeof sp?.e === 'string' ? MOD_ERRORS[sp.e] : null;

  const status = typeof sp?.status === 'string' && STATUS_KEYS.has(sp.status) ? sp.status : null;
  const type = typeof sp?.type === 'string' && TYPE_KEYS.has(sp.type) ? sp.type : null;
  const source = typeof sp?.source === 'string' && SOURCE_KEYS.has(sp.source) ? sp.source : null;
  const q = (typeof sp?.q === 'string' ? sp.q.trim().slice(0, 200) : '').replace(/[%_]/g, '');
  const page = Math.max(1, Number.parseInt(sp?.page, 10) || 1);

  const { rows, total, tallies, error } = await loadDashboard({ status, type, source, q, page });
  const syncHealth = await getSyncHealth();
  const fgbEnabled = isFgbConfigured();

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const hasFilter = Boolean(status || type || source || q);
  const startIdx = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endIdx = Math.min(total, page * PAGE_SIZE);

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
            <a className="btn" href="/admin/newsletter">✉ Newsletter</a>
            <a className="btn" href="/admin/analytics">Analytics</a>
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
            <div className="stat"><b>{tallies?.published ?? '—'}</b><span>Published</span></div>
            <div className="stat"><b>{tallies?.draft ?? '—'}</b><span>Draft</span></div>
            <div className="stat"><b>{tallies?.removed ?? '—'}</b><span>Removed</span></div>
            <div className="stat"><b>{tallies?.xAuto ?? '—'}</b><span>X drafts</span></div>
          </div>
          <p className="meta" style={{ margin: 0 }}>
            github_id={String(session.sub)} · issued={fmtUtc(session.iat ? session.iat * 1000 : null)} ·
            expires={fmtUtc(session.exp ? session.exp * 1000 : null)}
          </p>
        </div>

        <SyncHealthCard health={syncHealth} enabled={fgbEnabled} />

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

        {rows && <FilterBar status={status} type={type} source={source} q={q} />}

        {rows && total === 0 && !hasFilter && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <h2 style={{ marginBottom: 6 }}>No content yet</h2>
            <p className="meta" style={{ marginBottom: 18 }}>Create your first post with the composer.</p>
            <a className="btn primary" href="/admin/compose">+ New post</a>
          </div>
        )}

        {rows && total === 0 && hasFilter && (
          <div className="card">
            <p style={{ margin: 0 }}>No content matches this filter. <a href="/admin" style={{ textDecoration: 'underline', fontWeight: 700 }}>Clear the filter →</a></p>
          </div>
        )}

        {rows && total > 0 && (
          <>
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
                    {rows.map((r) => (
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

            <div className="row-actions" style={{ marginTop: 14, justifyContent: 'space-between' }}>
              <span className="meta">
                Showing {startIdx}–{endIdx} of {total}{hasFilter ? ' (filtered)' : ''} · page {page} of {totalPages}
              </span>
              <div className="row-actions" style={{ margin: 0 }}>
                {page > 1 && <a className="btn sm" href={buildHref({ status, type, source, q, page: page - 1 })}>← Prev</a>}
                {page < totalPages && <a className="btn sm" href={buildHref({ status, type, source, q, page: page + 1 })}>Next →</a>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
