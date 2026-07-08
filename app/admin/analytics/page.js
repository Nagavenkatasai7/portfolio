// /admin/analytics — OUR OWN, privacy-friendly view analytics (requireAdmin).
//
// Server-rendered from analytics_event (service_role). No third-party/platform
// metrics (those need paid APIs). No client JS: the chart is inline SVG with
// native <title> hover tooltips, so it stays clean under the strict /admin
// nonce CSP. The math lives in lib/analytics_aggregate.js (unit-tested by the
// phase-e verify); this file is presentation only.
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';
import { adminCss, SourceChip } from '../ui';
import { aggregateAnalytics } from '@/lib/analytics_aggregate';
import { TYPE_LABEL } from '@/lib/post';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Analytics | Naga Venkata Sai Chennu',
  robots: { index: false, follow: false },
};

const DAYS = 30;

async function loadAnalytics() {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'db_not_configured' };

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from('analytics_event')
    .select('content_id, kind, path, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20000);
  if (error) return { error: 'db_error' };

  const ids = Array.from(new Set((events || []).map((e) => e.content_id).filter(Boolean)));
  const meta = {};
  if (ids.length) {
    const { data: rows } = await supabase
      .from('content')
      .select('id, title, type, source, status, deleted_at')
      .in('id', ids);
    for (const r of rows || []) {
      meta[r.id] = { title: r.title, type: r.type, source: r.source, status: r.status, deleted: Boolean(r.deleted_at) };
    }
  }
  return { agg: aggregateAnalytics(events || [], meta, { days: DAYS }), meta };
}

// ---- inline SVG, single-series (views/day) bar chart ------------------------
function TimelineChart({ timeline, peak }) {
  const W = 760;
  const H = 190;
  const padL = 34;
  const padR = 8;
  const padT = 14;
  const padB = 26;
  const n = timeline.length;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const max = Math.max(peak, 1);
  const slot = chartW / n;
  const barW = Math.max(3, slot - 3);
  const baseY = padT + chartH;

  // Two recessive gridlines: max and half-max.
  const gridVals = [max, Math.round(max / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  return (
    <svg className=" chart-svg" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Views per day over the last ${n} days. Peak ${max} in a single day.`} preserveAspectRatio="xMidYMid meet">
      {/* gridlines + y labels */}
      {gridVals.map((v) => {
        const y = baseY - (v / max) * chartH;
        return (
          <g key={`g${v}`}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} className="grid" />
            <text x={padL - 6} y={y + 3} className="ytick" textAnchor="end">{v}</text>
          </g>
        );
      })}
      {/* baseline */}
      <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} className="axis" />
      {/* bars */}
      {timeline.map((d, i) => {
        const h = d.count > 0 ? Math.max(2, (d.count / max) * chartH) : 0;
        const x = padL + i * slot + (slot - barW) / 2;
        const y = baseY - h;
        const isLast = i === n - 1;
        return (
          <g key={d.day}>
            {h > 0 && (
              <rect x={x} y={y} width={barW} height={h} rx="2" className={`bar${isLast ? ' bar-today' : ''}`} />
            )}
            <rect x={x} y={padT} width={barW} height={chartH} fill="transparent">
              <title>{`${d.day}: ${d.count} view${d.count === 1 ? '' : 's'}`}</title>
            </rect>
          </g>
        );
      })}
      {/* x labels: first, ~weekly, last */}
      {timeline.map((d, i) => {
        if (!(i === 0 || i === n - 1 || i % 7 === 0)) return null;
        const x = padL + i * slot + slot / 2;
        return <text key={`x${d.day}`} x={x} y={H - 8} className="xtick" textAnchor="middle">{d.day.slice(5)}</text>;
      })}
    </svg>
  );
}

function Bars({ rows, labeler, total }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="barrow" key={r.key}>
          <div className="barlabel">{labeler(r.key)}</div>
          <div className="bartrack"><div className="barfill" style={{ width: `${Math.max(3, (r.count / max) * 100)}%` }} /></div>
          <div className="barval num">{r.count}<span className="barpct">{total ? ` · ${Math.round((r.count / total) * 100)}%` : ''}</span></div>
        </div>
      ))}
    </div>
  );
}

const ANALYTICS_CSS = `
  .adm .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 0 0 20px; }
  @media (max-width: 720px) { .adm .tiles { grid-template-columns: repeat(2, 1fr); } }
  .adm .tile { border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); padding: 18px 18px 16px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
  .adm .tile::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--plum); opacity: .85; }
  .adm .tile.accent::after { background: var(--lime); }
  .adm .tile .k { font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; }
  .adm .tile .v { font-family: var(--serif); font-size: 40px; font-weight: 700; line-height: 1; color: var(--ink); font-variant-numeric: tabular-nums; }
  .adm .tile .sub { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .adm .num { font-variant-numeric: tabular-nums; }

  .adm .panel { border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; margin: 0 0 18px; }
  .adm .panel > .ph { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 14px; }
  .adm .panel .ph h2 { margin: 0; font-size: 19px; }
  .adm .panel .ph .note { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }

  .adm .chart-svg { width: 100%; height: auto; display: block; }
  .adm .chart-svg .bar { fill: var(--plum); }
  .adm .chart-svg .bar-today { fill: var(--coral); }
  .adm .chart-svg .grid { stroke: var(--line); stroke-width: 1; stroke-dasharray: 2 4; }
  .adm .chart-svg .axis { stroke: var(--ink); stroke-width: 1.25; opacity: .55; }
  .adm .chart-svg .ytick, .adm .chart-svg .xtick { font-family: var(--mono); font-size: 10px; fill: var(--muted); }

  .adm .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 720px) { .adm .grid2 { grid-template-columns: 1fr; } }
  .adm .bars { display: flex; flex-direction: column; gap: 11px; }
  .adm .barrow { display: grid; grid-template-columns: 120px 1fr 84px; align-items: center; gap: 12px; }
  .adm .barlabel { font-size: 12.5px; }
  .adm .bartrack { height: 12px; background: var(--paper-2); border-radius: 999px; overflow: hidden; border: 1px solid var(--line); }
  .adm .barfill { height: 100%; background: var(--plum); border-radius: 999px; }
  .adm .barval { font-family: var(--mono); font-size: 12.5px; text-align: right; color: var(--ink); }
  .adm .barpct { color: var(--muted); }
  .adm .rank { font-family: var(--mono); color: var(--muted); font-size: 12px; }
  .adm td.right, .adm th.right { text-align: right; }
  .adm .emptybox { text-align: center; padding: 40px 20px; }
  .adm .emptybox .big { font-family: var(--serif); font-size: 30px; color: var(--muted); margin-bottom: 6px; }
`;

export default async function AnalyticsPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  const { agg, meta, error } = await loadAnalytics();

  const sourceLabeler = (k) => (k === 'unknown' ? 'Unknown' : <SourceChip source={k} />);
  const typeLabeler = (k) => (k === 'unknown' ? 'Unknown' : (TYPE_LABEL[k] || k));

  return (
    <div className="adm">
      <style>{adminCss}</style>
      <style>{ANALYTICS_CSS}</style>
      <div className="wrap">
        <div className="topbar">
          <div>
            <div className="mark">NC</div>
            <p className="eyebrow">Blog analytics</p>
            <h1><span className="hl">View</span> analytics</h1>
          </div>
          <div className="row-actions">
            <a className="btn" href="/admin">← Dashboard</a>
            <a className="btn" href="/blog">View /blog</a>
          </div>
        </div>

        <p className="lede" style={{ marginTop: 18 }}>
          Our own, privacy-friendly page views — no third-party trackers, no PII. Last {DAYS} days.
          A view is one visitor, one post, per day (bots and Do-Not-Track excluded).
        </p>

        {error === 'db_not_configured' && (
          <div className="panel"><p style={{ margin: 0 }}>The database isn’t connected on this deployment yet.</p></div>
        )}
        {error === 'db_error' && (
          <div className="panel"><p style={{ margin: 0 }}>Could not load analytics from the database.</p></div>
        )}

        {agg && (
          <>
            <div className="tiles">
              <div className="tile accent">
                <p className="k">Total views</p>
                <div className="v">{agg.total.toLocaleString('en-US')}</div>
                <div className="sub">last {DAYS} days</div>
              </div>
              <div className="tile">
                <p className="k">Last 7 days</p>
                <div className="v">{agg.last7.toLocaleString('en-US')}</div>
                <div className="sub">{agg.total ? `${Math.round((agg.last7 / agg.total) * 100)}% of window` : '—'}</div>
              </div>
              <div className="tile">
                <p className="k">Posts viewed</p>
                <div className="v">{agg.postsTracked.toLocaleString('en-US')}</div>
                <div className="sub">distinct posts</div>
              </div>
              <div className="tile">
                <p className="k">Peak day</p>
                <div className="v">{agg.peakDay.toLocaleString('en-US')}</div>
                <div className="sub">views in one day</div>
              </div>
            </div>

            <div className="panel">
              <div className="ph">
                <h2>Views over time</h2>
                <span className="note">{DAYS} days · today in coral</span>
              </div>
              {agg.total === 0 ? (
                <div className="emptybox">
                  <div className="big">▁▁▁</div>
                  <p className="meta" style={{ margin: 0 }}>No views recorded yet. They’ll appear here as people read <a href="/blog" style={{ textDecoration: 'underline', fontWeight: 700 }}>/blog</a> posts.</p>
                </div>
              ) : (
                <TimelineChart timeline={agg.timeline} peak={agg.peakDay} />
              )}
            </div>

            {agg.total > 0 && (
              <div className="grid2">
                <div className="panel" style={{ margin: 0 }}>
                  <div className="ph"><h2>By source</h2><span className="note">where it was posted</span></div>
                  <Bars rows={agg.bySource} labeler={sourceLabeler} total={agg.total} />
                </div>
                <div className="panel" style={{ margin: 0 }}>
                  <div className="ph"><h2>By type</h2><span className="note">kind of content</span></div>
                  <Bars rows={agg.byType} labeler={typeLabeler} total={agg.total} />
                </div>
              </div>
            )}

            {agg.posts.length > 0 && (
              <div className="tablewrap" style={{ marginTop: 18 }}>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 44 }}>#</th>
                        <th>Post</th>
                        <th>Source</th>
                        <th>Type</th>
                        <th className="right">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.posts.map((p, i) => {
                        const m = meta[p.id] || {};
                        const title = m.title || p.title || '(untitled)';
                        return (
                          <tr key={p.id || `u${i}`}>
                            <td className="rank">{i + 1}</td>
                            <td>
                              <div className="title-cell">
                                {p.id ? <a href={`/blog/${p.id}`} style={{ textDecoration: 'underline' }}>{title}</a> : <span className="meta">Unknown / removed</span>}
                                {m.deleted && <span className="meta"> · removed</span>}
                                {m.status === 'draft' && <span className="meta"> · draft</span>}
                              </div>
                            </td>
                            <td>{p.source ? <SourceChip source={p.source} /> : <span className="meta">—</span>}</td>
                            <td className="mono">{p.type ? (TYPE_LABEL[p.type] || p.type) : '—'}</td>
                            <td className="right num" style={{ fontWeight: 800 }}>{p.count.toLocaleString('en-US')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
