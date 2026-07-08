// ============================================================
// lib/analytics_aggregate.js — PURE aggregation of analytics_event rows.
//
// No DB, no server-only: the /admin/analytics page AND the verification script
// both import this, so the numbers the dashboard shows are the exact numbers a
// plain-Node test can assert. Presentation lives in the page; the math is here.
// ============================================================

// UTC day key (YYYY-MM-DD) for a timestamp.
export function dayKey(ts) {
  try { return new Date(ts).toISOString().slice(0, 10); } catch { return ''; }
}

// The last `n` UTC day keys, oldest -> newest (inclusive of today).
export function lastNDays(n, now = new Date()) {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// events:   [{ content_id, kind, path, created_at }]
// contentMeta: { [id]: { title, type, source } }
export function aggregateAnalytics(events, contentMeta = {}, { days = 30, now = new Date() } = {}) {
  const views = (Array.isArray(events) ? events : []).filter((e) => (e && (e.kind || 'view') === 'view'));

  const perPost = new Map();
  const perSource = new Map();
  const perType = new Map();
  const dayList = lastNDays(days, now);
  const perDay = new Map(dayList.map((d) => [d, 0]));

  for (const e of views) {
    const id = e.content_id || 'unknown';
    perPost.set(id, (perPost.get(id) || 0) + 1);
    const meta = contentMeta[id] || {};
    const src = meta.source || 'unknown';
    const typ = meta.type || 'unknown';
    perSource.set(src, (perSource.get(src) || 0) + 1);
    perType.set(typ, (perType.get(typ) || 0) + 1);
    const dk = dayKey(e.created_at);
    if (perDay.has(dk)) perDay.set(dk, perDay.get(dk) + 1);
  }

  const posts = Array.from(perPost.entries())
    .map(([id, count]) => ({
      id,
      count,
      title: contentMeta[id]?.title ?? null,
      type: contentMeta[id]?.type ?? null,
      source: contentMeta[id]?.source ?? null,
    }))
    .sort((a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id)));

  const timeline = dayList.map((d) => ({ day: d, count: perDay.get(d) || 0 }));
  const last7 = timeline.slice(-7).reduce((s, x) => s + x.count, 0);

  const asList = (m) => Array.from(m.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));

  return {
    total: views.length,
    last7,
    postsTracked: perPost.size,
    posts,
    bySource: asList(perSource),
    byType: asList(perType),
    timeline,
    top: posts[0] || null,
    peakDay: timeline.reduce((mx, x) => (x.count > mx ? x.count : mx), 0),
  };
}
