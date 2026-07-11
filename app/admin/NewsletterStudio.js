'use client';
// The Field Guide newsletter studio (Phase N2) — a three-tab client deck over
// the admin-gated JSON APIs under /api/admin/newsletter/*. The SSR page
// (newsletter/page.js) READS everything via the service-role chokepoint and
// hands it down as props; every MUTATION here goes back through those APIs
// (each re-checks requireAdmin + isSameOrigin). After a successful mutation we
// call router.refresh() to reload the server props — the active tab and any
// open issue survive because client state is preserved across a soft refresh.
//
// Three tabs: Issues (set up / approve / send an issue, per-recipient ledger),
// Subscribers (audience stats + list, remove / import / CSV export), and the
// Link bin (queued URLs for the next issue). Sending stays DORMANT until
// RESEND_API_KEY is configured; the UI degrades to read-only hints, never a
// broken action. The strict /admin CSP forbids inline scripts, so every
// interaction is a normal React handler — no onclick strings, no innerHTML.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUnsavedGuard } from './useUnsavedGuard';
import { fetchWithTimeout, isTimeout } from './fetchWithTimeout';

// Friendly copy for the error codes the APIs return (non-2xx { error }).
const ERR_MSG = {
  unauthorized: 'Session expired — sign in again',
  bad_origin: 'Blocked cross-origin request',
  email_not_configured: 'Sending is not configured (RESEND_API_KEY unset)',
  not_approved: 'Approve the issue first',
  another_sending: 'Another issue is currently sending',
  locked: 'A send is already running — try again in a moment',
  invalid_email: 'Enter a valid email',
  not_configured: 'Audience import is not configured (RESEND_AUDIENCE_ID unset)',
  suppressed: 'That address is suppressed (a hard bounce or spam complaint) and can’t be re-added',
  unsubscribed: 'That address unsubscribed — they must re-subscribe themselves via the signup form',
  timed_out: 'The request timed out — please try again',
};
const errMsg = (c) => ERR_MSG[c] || 'Something went wrong';

// Timestamps render in UTC so the string is identical on the server and the
// client (no locale / timezone drift, no hydration mismatch).
function fmtUtc(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return String(ts);
  }
}

// Two distinct pill palettes: an issue's lifecycle vs. a per-recipient /
// subscriber status. Note `sent` means different things in each (a fully-sent
// issue is lime; a single delivered-then-sent message is blue), so they can't
// share one map. Rendered as inline colors on the shared .chip class.
const FALLBACK_PILL = { background: '#f3ead8', color: '#756b62' };
const ISSUE_PILL = {
  draft: { background: '#f3ead8', color: '#756b62' },
  approved: { background: '#d7ad52', color: '#241d09' },
  sending: { background: '#4db6aa', color: '#06231f' },
  sent: { background: '#caff60', color: '#171411' },
};
const STATUS_PILL = {
  active: { background: '#caff60', color: '#171411' },
  delivered: { background: '#caff60', color: '#171411' },
  pending: { background: '#f3ead8', color: '#756b62' },
  queued: { background: '#f3ead8', color: '#756b62' },
  sent: { background: '#dfe9ff', color: '#123' },
  unsubscribed: { background: '#eee', color: '#756b62' },
  bounced: { background: '#f0d6cd', color: '#7a2f18' },
  complained: { background: '#f0d6cd', color: '#7a2f18' },
  failed: { background: '#f0d6cd', color: '#7a2f18' },
};
const LINK_PILL = {
  queued: { background: '#f3ead8', color: '#756b62' },
  used: { background: '#dfe9ff', color: '#123' },
  discarded: { background: '#eee', color: '#756b62' },
};
const issuePillStyle = (s) => ISSUE_PILL[s] || FALLBACK_PILL;
const statusPillStyle = (s) => STATUS_PILL[s] || FALLBACK_PILL;

function Pill({ style, children }) {
  return <span className="chip" style={{ ...style, borderColor: style.color }}>{children}</span>;
}

// Delivery health of the send cron (dead-man's-switch, mirrors the dashboard's
// SyncHealthCard but inline + simpler). `now` is null until mount so the SSR
// and first client render agree; the staleness refinement lights up after.
function healthState(health, now) {
  if (!health || (!health.last_success_at && !health.last_run_at && !health.last_error)) {
    return { label: 'No run yet', color: '#756b62' };
  }
  if (health.last_error) return { label: 'ERROR — last run failed', color: '#b4231b' };
  if (!health.last_success_at) return { label: 'No successful run yet', color: '#756b62' };
  if (now != null) {
    const age = now - new Date(health.last_success_at).getTime();
    if (age > 26 * 3600 * 1000) return { label: 'Stale — no recent run', color: '#b06a00' };
  }
  return { label: 'Healthy', color: '#1f7a4d' };
}

// A subscriber whose status is one of these is already off the list, so it has
// no "Remove" action (shows a muted dash instead).
const SUPPRESSED = new Set(['unsubscribed', 'bounced', 'complained']);

export default function NewsletterStudio({ stats, subscribers, issues, issuable, links, health, config }) {
  const router = useRouter();

  const [tab, setTab] = useState('issues');
  const [banner, setBanner] = useState(null); // { kind: 'ok' | 'err', text }
  const [busy, setBusy] = useState(null);      // key of the in-flight action, or null
  const [now, setNow] = useState(null);        // client clock for staleness (mount-only)

  // Subscribers tab
  const [subSearch, setSubSearch] = useState('');
  const [newSubEmail, setNewSubEmail] = useState('');

  // Issues tab — "new issue" setup
  const [newContentId, setNewContentId] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newPreheader, setNewPreheader] = useState('');
  const [newHero, setNewHero] = useState('');

  // Issues tab — selected issue detail (fetched on demand)
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [detail, setDetail] = useState(null);       // GET response { meta, content, ledger, stats }
  const [detailLoading, setDetailLoading] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editPreheader, setEditPreheader] = useState('');
  const [editHero, setEditHero] = useState('');
  const [testEmail, setTestEmail] = useState('');
  // Inline email preview (read-only iframe of the EXACT email). `previewNonce`
  // bumps to remount the iframe (reload) after the admin saves meta edits.
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewNonce, setPreviewNonce] = useState(0);

  // Link bin tab
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNote, setLinkNote] = useState('');

  useEffect(() => { setNow(Date.now()); }, []);

  // ── shared request helpers ──────────────────────────────────────────────
  // POST JSON, tolerant of empty / non-JSON bodies. Never throws (network
  // failures surface via the caller's try/catch).
  async function callApi(path, body) {
    // 65s ceiling — just over the send-now route's 60s maxDuration so a legitimate
    // full-batch send isn't aborted client-side while the server is still finishing.
    const res = await fetchWithTimeout(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, 65000);
    let data = {};
    try { data = await res.json(); } catch { /* empty / non-JSON body */ }
    return { ok: res.ok, status: res.status, data };
  }

  // The single mutation path: flip busy, POST, then either raise an error
  // banner or a success banner + router.refresh(). `opts.detail` also re-pulls
  // the open issue so its status/ledger reflect the mutation.
  async function mutate(key, path, body, opts = {}) {
    setBusy(key);
    setBanner(null);
    try {
      const { ok, data } = await callApi(path, body);
      if (!ok) {
        setBanner({ kind: 'err', text: errMsg(data.error), signin: data.error === 'unauthorized' });
        return { ok: false, data };
      }
      const text = typeof opts.ok === 'function' ? opts.ok(data) : (opts.ok || 'Done.');
      setBanner({ kind: 'ok', text });
      router.refresh();
      if (opts.detail && selectedIssueId) await refreshDetail(selectedIssueId);
      return { ok: true, data };
    } catch (e) {
      setBanner({ kind: 'err', text: isTimeout(e) ? errMsg('timed_out') : 'Network error — please try again.' });
      return { ok: false, data: {} };
    } finally {
      setBusy(null);
    }
  }

  // Re-fetch the open issue's detail WITHOUT clobbering the editor fields (so
  // an unsaved subject edit survives an Approve/Send). selectIssue is the one
  // that seeds the editor, on a fresh selection.
  async function refreshDetail(contentId) {
    try {
      const res = await fetchWithTimeout(`/api/admin/newsletter/issues?contentId=${encodeURIComponent(contentId)}`, {}, 30000);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) { setDetail(data); return; }
      // Failed refresh: drop the now-stale panel rather than show outdated
      // status/ledger numbers, and tell the owner to reopen it.
      setDetail(null);
      setBanner({ kind: 'err', text: 'Could not refresh the issue — reopen it to see the latest.' });
    } catch (e) {
      setDetail(null);
      setBanner({ kind: 'err', text: isTimeout(e) ? errMsg('timed_out') : 'Could not refresh the issue — reopen it to see the latest.' });
    }
  }

  async function selectIssue(contentId) {
    if (selectedIssueId === contentId && detail) return; // already open — don't wipe edits
    setSelectedIssueId(contentId);
    setDetail(null);
    setTestEmail('');
    setDetailLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/admin/newsletter/issues?contentId=${encodeURIComponent(contentId)}`, {}, 30000);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDetail(data);
        setEditSubject(data.meta?.subject || '');
        setEditPreheader(data.meta?.preheader || '');
        setEditHero(data.meta?.hero_image_url || '');
      } else {
        setBanner({ kind: 'err', text: errMsg(data.error), signin: data.error === 'unauthorized' });
        setSelectedIssueId(null);
      }
    } catch (e) {
      setBanner({ kind: 'err', text: isTimeout(e) ? errMsg('timed_out') : 'Network error — could not load the issue.' });
      setSelectedIssueId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedIssueId(null);
    setDetail(null);
  }

  // ── actions ─────────────────────────────────────────────────────────────
  async function createMeta() {
    if (!newSubject.trim() || !newContentId) return;
    const { ok } = await mutate('meta-new', '/api/admin/newsletter/issues', {
      action: 'meta',
      contentId: newContentId,
      subject: newSubject.trim(),
      preheader: newPreheader.trim(),
      heroImageUrl: newHero.trim(),
    }, { ok: 'Issue set up — it appears in the table below.' });
    if (ok) {
      setShowSetup(false);
      setNewContentId('');
      setNewSubject('');
      setNewPreheader('');
      setNewHero('');
    }
  }

  async function saveMeta() {
    if (!editSubject.trim() || !selectedIssueId) return;
    await mutate('meta-save', '/api/admin/newsletter/issues', {
      action: 'meta',
      contentId: selectedIssueId,
      subject: editSubject.trim(),
      preheader: editPreheader.trim(),
      heroImageUrl: editHero.trim(),
    }, { ok: 'Issue details saved.', detail: true });
  }

  function approveIssue() {
    if (!selectedIssueId) return;
    mutate('approve', '/api/admin/newsletter/issues', { action: 'approve', contentId: selectedIssueId },
      { ok: 'Issue approved — ready to send.', detail: true });
  }

  function disarmIssue() {
    if (!selectedIssueId) return;
    mutate('disarm', '/api/admin/newsletter/issues', { action: 'disarm', contentId: selectedIssueId },
      { ok: 'Issue disarmed — back to draft.', detail: true });
  }

  function sendNow() {
    if (!selectedIssueId) return;
    if (!window.confirm('Send this issue now to every active subscriber? This cannot be undone.')) return;
    mutate('send-now', '/api/admin/newsletter/issues', { action: 'send-now', contentId: selectedIssueId }, {
      ok: (d) => d.issueComplete
        ? `Issue complete — ${d.sent ?? 0} sent${d.failed ? `, ${d.failed} failed` : ''}.`
        : `Batch sent — ${d.sent ?? 0} sent, ${d.remaining ?? 0} remaining. Run again to continue.`,
      detail: true,
    });
  }

  function sendTest() {
    if (!selectedIssueId || !testEmail.trim()) return;
    mutate('test-send', '/api/admin/newsletter/issues', { action: 'test-send', contentId: selectedIssueId, email: testEmail.trim() },
      { ok: (d) => `Test sent to ${d.to || testEmail.trim()}.` });
  }

  function removeSubscriber(subscriberId) {
    mutate(`sub:${subscriberId}`, '/api/admin/newsletter/subscribers', { action: 'remove', subscriberId },
      { ok: 'Subscriber removed.' });
  }

  async function addSubscriber() {
    if (!newSubEmail.trim()) return;
    const { ok } = await mutate('add-sub', '/api/admin/newsletter/subscribers', { action: 'add', email: newSubEmail.trim() }, {
      ok: (d) => d.result === 'already_active' ? 'That address is already an active subscriber.'
        : d.result === 'activated' ? 'Subscriber re-activated.'
          : 'Subscriber added.',
    });
    if (ok) setNewSubEmail('');
  }

  // Import is special: the API can answer 200 with { ok: false, error:
  // 'not_configured' }, so we can't trust the HTTP status alone.
  async function importAudience() {
    setBusy('import');
    setBanner(null);
    try {
      const { ok, data } = await callApi('/api/admin/newsletter/subscribers', { action: 'import' });
      if (!ok || data.ok === false) {
        setBanner({ kind: 'err', text: errMsg(data.error), signin: data.error === 'unauthorized' });
        return;
      }
      setBanner({
        kind: 'ok',
        text: `Imported ${data.imported ?? 0}, upgraded ${data.upgraded ?? 0}, skipped ${data.skipped ?? 0} (audience ${data.total ?? 0}).`,
      });
      router.refresh();
    } catch (e) {
      setBanner({ kind: 'err', text: isTimeout(e) ? errMsg('timed_out') : 'Network error — please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function addLink() {
    if (!linkUrl.trim()) return;
    const { ok } = await mutate('add-link', '/api/admin/newsletter/links', { action: 'add', url: linkUrl.trim(), note: linkNote.trim() },
      { ok: 'Link added to the bin.' });
    if (ok) { setLinkUrl(''); setLinkNote(''); }
  }

  function discardLink(id) {
    mutate(`link:${id}`, '/api/admin/newsletter/links', { action: 'discard', id }, { ok: 'Link discarded.' });
  }

  // ── derived data ────────────────────────────────────────────────────────
  const counts = stats?.counts || {};
  const setupCandidates = useMemo(() => (issuable || []).filter((c) => !c.hasMeta), [issuable]);
  const queuedLinks = useMemo(() => (links || []).filter((l) => l.status === 'queued').length, [links]);

  const filteredSubs = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    if (!q) return subscribers || [];
    return (subscribers || []).filter((s) => (s.email || '').toLowerCase().includes(q));
  }, [subscribers, subSearch]);
  const shownSubs = filteredSubs.slice(0, 500);

  // queued first, then used, then discarded
  const sortedLinks = useMemo(() => {
    const order = { queued: 0, used: 1, discarded: 2 };
    return [...(links || [])].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  }, [links]);

  const csvHref = `/api/admin/newsletter/subscribers/csv${subSearch.trim() ? `?q=${encodeURIComponent(subSearch.trim())}` : ''}`;

  const deliveredPct = (it) => {
    const aud = it.audience_count;
    const del = it.stats?.counts?.delivered;
    if (!aud || aud <= 0 || del == null) return '—';
    return `${Math.round((del / aud) * 100)}%`;
  };

  const hs = healthState(health, now);
  const anyBusy = Boolean(busy);
  const metaStatus = detail?.meta?.status;

  // Unsaved-changes guard: an open issue's meta edits diverging from what was
  // loaded, or an in-progress "new issue" setup with typed content. Subjects are
  // short, but a lost preheader/subject edit is still an annoyance worth warning
  // about. After Save meta, refreshDetail re-pulls meta so these fall equal again.
  const metaDirty = Boolean(detail) && (
    editSubject !== (detail.meta?.subject || '')
    || editPreheader !== (detail.meta?.preheader || '')
    || editHero !== (detail.meta?.hero_image_url || '')
  );
  const setupDirty = showSetup && Boolean(newSubject.trim() || newPreheader.trim() || newHero.trim());
  useUnsavedGuard(metaDirty || setupDirty);

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <>
      {banner && (
        <div className={`banner ${banner.kind}`} style={{ marginTop: 18 }}>
          {banner.text}
          {banner.signin && <> <a href="/admin/login" target="_blank" rel="noopener noreferrer">Sign in ↗</a></>}
        </div>
      )}

      <div className="seg" role="group" aria-label="Studio section" style={{ margin: '18px 0' }}>
        <button type="button" aria-pressed={tab === 'issues'} onClick={() => setTab('issues')}>Issues ({(issues || []).length})</button>
        <button type="button" aria-pressed={tab === 'subscribers'} onClick={() => setTab('subscribers')}>Subscribers ({counts.active ?? 0})</button>
        <button type="button" aria-pressed={tab === 'links'} onClick={() => setTab('links')}>Link bin ({queuedLinks})</button>
      </div>

      {/* ══ ISSUES ══════════════════════════════════════════════════════ */}
      {tab === 'issues' && (
        <>
          {/* cron health */}
          <div className="card" style={{ marginBottom: 18 }}>
            <p className="eyebrow" style={{ margin: '0 0 10px' }}>Send cron health</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ color: hs.color, fontSize: 18, lineHeight: 1 }}>●</span>
              <b style={{ color: hs.color, fontFamily: 'var(--serif)', fontSize: 18 }}>{hs.label}</b>
              {health?.locked_by && (
                <span className="chip" style={{ background: '#4db6aa', color: '#06231f', borderColor: '#06231f' }}>running now</span>
              )}
            </div>
            <p className="meta" style={{ margin: 0 }}>
              last_success={fmtUtc(health?.last_success_at)} · last_run={fmtUtc(health?.last_run_at)}
            </p>
            {health?.last_error && (
              <p className="meta" style={{ margin: '6px 0 0', color: '#b4231b' }}>
                last_error: {String(health.last_error).slice(0, 200)} ({fmtUtc(health.last_error_at)})
              </p>
            )}
          </div>

          {/* new issue */}
          <div className="card">
            <p className="eyebrow" style={{ margin: '0 0 10px' }}>New issue from a draft</p>
            {setupCandidates.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                No newsletter drafts are waiting to become issues.{' '}
                <a href="/admin/compose" style={{ textDecoration: 'underline' }}>Write a new draft in the composer →</a>
              </p>
            ) : (
              <>
                <div className="row-actions">
                  <select value={newContentId} onChange={(e) => { setNewContentId(e.target.value); setShowSetup(false); }} style={{ maxWidth: 460 }}>
                    <option value="">Choose a newsletter draft…</option>
                    {setupCandidates.map((c) => (
                      <option key={c.id} value={c.id}>{(c.title || '(untitled)')} · {c.status}</option>
                    ))}
                  </select>
                  <button className="btn sm" type="button" onClick={() => setShowSetup(true)} disabled={!newContentId || anyBusy}>Set up issue</button>
                </div>

                {showSetup && newContentId && (
                  <div style={{ marginTop: 16 }}>
                    <div className="field">
                      <label htmlFor="ns-new-subject">Subject</label>
                      <input id="ns-new-subject" type="text" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="What lands in the inbox line" />
                    </div>
                    <div className="field">
                      <label htmlFor="ns-new-preheader">Preheader <span className="opt">(optional)</span></label>
                      <input id="ns-new-preheader" type="text" value={newPreheader} onChange={(e) => setNewPreheader(e.target.value)} placeholder="The grey preview text after the subject" />
                    </div>
                    <div className="field">
                      <label htmlFor="ns-new-hero">Hero image URL <span className="opt">(optional)</span></label>
                      <input id="ns-new-hero" type="url" value={newHero} onChange={(e) => setNewHero(e.target.value)} placeholder="https://…" />
                    </div>
                    <div className="row-actions">
                      <button className="btn primary" type="button" onClick={createMeta} disabled={!newSubject.trim() || anyBusy}>
                        {busy === 'meta-new' ? <><span className="spin" /> Setting up</> : 'Create issue'}
                      </button>
                      <button className="btn sm" type="button" onClick={() => setShowSetup(false)} disabled={anyBusy}>Cancel</button>
                    </div>
                  </div>
                )}

                <p className="hint" style={{ marginTop: 12 }}>
                  or <a href="/admin/compose" style={{ textDecoration: 'underline' }}>write a new draft in the composer →</a>
                </p>
              </>
            )}
          </div>

          {/* issues table */}
          <div className="card">
            <p className="eyebrow" style={{ margin: '0 0 12px' }}>Issues</p>
            {(issues || []).length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>No issues yet. Set one up from a draft above.</p>
            ) : (
              <div className="tablewrap">
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th><th>Status</th><th>Recipients</th><th>Delivered</th>
                        <th>Approved</th><th>Sent</th><th style={{ textAlign: 'right' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(issues || []).map((it) => (
                        <tr
                          key={it.content_id}
                          onClick={() => selectIssue(it.content_id)}
                          style={{ cursor: 'pointer', background: selectedIssueId === it.content_id ? 'rgba(202,255,96,.1)' : undefined }}
                        >
                          <td>
                            <div className="title-cell">{it.subject || it.content?.title || '(untitled)'}</div>
                            {it.preheader && <span className="ext">{it.preheader}</span>}
                          </td>
                          <td><Pill style={issuePillStyle(it.status)}>{it.status}</Pill></td>
                          <td className="mono">{it.audience_count ?? '—'}</td>
                          <td className="mono">{deliveredPct(it)}</td>
                          <td className="utc">{fmtUtc(it.approved_at)}</td>
                          <td className="utc">{fmtUtc(it.sent_at)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn sm" type="button" onClick={(e) => { e.stopPropagation(); selectIssue(it.content_id); }}>
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* detail panel */}
          {selectedIssueId && (
            <div className="card">
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <p className="eyebrow" style={{ margin: 0 }}>Issue detail</p>
                <button className="btn sm" type="button" onClick={closeDetail}>Close</button>
              </div>

              {detailLoading && !detail ? (
                <p className="hint" style={{ marginTop: 14 }}><span className="spin" /> Loading issue…</p>
              ) : detail ? (
                <>
                  <hr className="divider" />

                  {/* status + content reference */}
                  <div className="row-actions" style={{ marginBottom: 4 }}>
                    <Pill style={issuePillStyle(metaStatus)}>{metaStatus}</Pill>
                    {detail.content && (
                      <span className="meta">
                        Post: <a href={`/admin/edit/${detail.content.id}`} style={{ textDecoration: 'underline' }}>{detail.content.title || '(untitled)'}</a> · {detail.content.status}
                      </span>
                    )}
                  </div>

                  {/* Surface a swallowed publish failure from startSending: an issue
                      that is sending/sent whose post never went public means the
                      email's "read in browser" link won't resolve. */}
                  {(metaStatus === 'sending' || metaStatus === 'sent') && detail.content && detail.content.status !== 'published' && (
                    <div className="banner err" style={{ marginTop: 10 }}>
                      ⚠ This issue is {metaStatus}, but its post isn’t published (status: {detail.content.status}) — the email’s “read in browser” link won’t resolve. Publish it from the dashboard.
                    </div>
                  )}

                  {/* meta editor */}
                  <div className="field" style={{ marginTop: 14 }}>
                    <label htmlFor="ns-edit-subject">Subject</label>
                    <input id="ns-edit-subject" type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="ns-edit-preheader">Preheader <span className="opt">(optional)</span></label>
                    <input id="ns-edit-preheader" type="text" value={editPreheader} onChange={(e) => setEditPreheader(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="ns-edit-hero">Hero image URL <span className="opt">(optional)</span></label>
                    <input id="ns-edit-hero" type="url" value={editHero} onChange={(e) => setEditHero(e.target.value)} />
                  </div>

                  {/* actions */}
                  <div className="row-actions">
                    <button className="btn primary" type="button" onClick={saveMeta} disabled={!editSubject.trim() || anyBusy}>
                      {busy === 'meta-save' ? <><span className="spin" /> Saving</> : 'Save meta'}
                    </button>
                    {metaStatus === 'draft' && (
                      <button className="btn" type="button" onClick={approveIssue} disabled={anyBusy}>
                        {busy === 'approve' ? <><span className="spin" /> …</> : 'Approve'}
                      </button>
                    )}
                    {metaStatus === 'approved' && (
                      <button className="btn" type="button" onClick={disarmIssue} disabled={anyBusy}>
                        {busy === 'disarm' ? <><span className="spin" /> …</> : 'Disarm'}
                      </button>
                    )}
                    {(metaStatus === 'approved' || metaStatus === 'sending') && (
                      <button className="btn primary" type="button" onClick={sendNow} disabled={anyBusy || !config.emailConfigured}>
                        {busy === 'send-now' ? <><span className="spin" /> Sending</> : 'Send now'}
                      </button>
                    )}
                  </div>
                  {!config.emailConfigured && (
                    <p className="hint">Sending is dormant until RESEND_API_KEY is set.</p>
                  )}

                  {/* inline email preview — the EXACT email, rendered read-only
                      in a sandboxed same-origin iframe (no test send needed). */}
                  <hr className="divider" />
                  <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn sm"
                      aria-expanded={previewOpen}
                      onClick={() => setPreviewOpen((v) => !v)}
                    >
                      {previewOpen ? '▾ Email preview' : '▸ Email preview'}
                    </button>
                    {previewOpen && (
                      <button type="button" className="btn sm" onClick={() => setPreviewNonce((n) => n + 1)}>
                        Refresh preview
                      </button>
                    )}
                  </div>
                  {previewOpen && (
                    <>
                      <p className="hint" style={{ margin: '10px 0' }}>
                        Exactly what a subscriber receives. Edit the fields above, Save meta, then Refresh preview.
                      </p>
                      <iframe
                        title="Email preview"
                        sandbox=""
                        src={`/api/admin/newsletter/preview?contentId=${encodeURIComponent(selectedIssueId)}`}
                        style={{ width: '100%', height: '760px', border: '1px solid #ddceb8', borderRadius: '8px', background: '#f3ead8' }}
                        key={previewNonce}
                      />
                    </>
                  )}

                  {/* test send */}
                  <div className="field" style={{ marginTop: 14 }}>
                    <label htmlFor="ns-test-email">Send a test</label>
                    <div className="row-actions">
                      <input
                        id="ns-test-email"
                        type="text"
                        inputMode="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="you@example.com"
                        style={{ maxWidth: 320 }}
                      />
                      <button className="btn sm" type="button" onClick={sendTest} disabled={anyBusy || !config.emailConfigured || !testEmail.trim()}>
                        {busy === 'test-send' ? <><span className="spin" /> Sending</> : 'Send test'}
                      </button>
                    </div>
                  </div>

                  {/* delivery stats */}
                  {detail.stats?.total > 0 && (
                    <div className="stat-row" style={{ marginTop: 18 }}>
                      <div className="stat"><b>{detail.stats.counts?.queued ?? 0}</b><span>Queued</span></div>
                      <div className="stat"><b>{detail.stats.counts?.sent ?? 0}</b><span>Sent</span></div>
                      <div className="stat"><b>{detail.stats.counts?.delivered ?? 0}</b><span>Delivered</span></div>
                      <div className="stat"><b>{detail.stats.counts?.bounced ?? 0}</b><span>Bounced</span></div>
                      <div className="stat"><b>{detail.stats.counts?.complained ?? 0}</b><span>Complained</span></div>
                      <div className="stat"><b>{detail.stats.counts?.failed ?? 0}</b><span>Failed</span></div>
                    </div>
                  )}

                  {/* per-recipient ledger */}
                  <p className="eyebrow" style={{ margin: '18px 0 10px' }}>Recipients ({detail.ledger?.length ?? 0})</p>
                  {(detail.ledger || []).length === 0 ? (
                    <p className="hint" style={{ margin: 0 }}>No sends yet — the ledger fills once this issue is sent.</p>
                  ) : (
                    <div className="tablewrap">
                      <div className="scroll">
                        <table>
                          <thead>
                            <tr><th>Email</th><th>Status</th><th>Provider ID</th><th>Error</th><th>Updated</th></tr>
                          </thead>
                          <tbody>
                            {detail.ledger.slice(0, 500).map((r) => (
                              <tr key={r.id}>
                                <td>{r.email || <span className="meta">—</span>}</td>
                                <td><Pill style={statusPillStyle(r.status)}>{r.status}</Pill></td>
                                <td className="mono" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.provider_message_id || '—'}
                                </td>
                                <td className="mono" style={{ color: '#7a2f18' }}>{r.error_note || ''}</td>
                                <td className="utc">{fmtUtc(r.updated_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {(detail.ledger || []).length > 500 && (
                    <p className="meta" style={{ marginTop: 10 }}>Showing the first 500 of {detail.ledger.length}.</p>
                  )}
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* ══ SUBSCRIBERS ═════════════════════════════════════════════════ */}
      {tab === 'subscribers' && (
        <>
          <div className="card">
            <p className="eyebrow" style={{ margin: '0 0 10px' }}>Audience</p>
            <div className="stat-row">
              <div className="stat"><b>{stats?.total ?? 0}</b><span>Total</span></div>
              <div className="stat"><b>{counts.active ?? 0}</b><span>Active</span></div>
              <div className="stat"><b>{counts.pending ?? 0}</b><span>Pending</span></div>
              <div className="stat"><b>{counts.unsubscribed ?? 0}</b><span>Unsubscribed</span></div>
              <div className="stat"><b>{stats?.suppressed ?? 0}</b><span>Bounced / Complained</span></div>
              <div className="stat"><b>{stats?.addedThisMonth ?? 0}</b><span>Added this month</span></div>
            </div>
            {(!config.emailConfigured || !config.webhookConfigured) && (
              <p className="hint" style={{ marginTop: 12 }}>
                {!config.emailConfigured && 'Sending is dormant until RESEND_API_KEY is set. '}
                {!config.webhookConfigured && 'Delivery webhook dormant until RESEND_WEBHOOK_SECRET is set.'}
              </p>
            )}
            <div className="row-actions" style={{ marginTop: 14 }}>
              <a className="btn sm" href={csvHref} download>Export CSV</a>
              {config.resendAudienceConfigured && (
                <button className="btn sm" type="button" onClick={importAudience} disabled={anyBusy}>
                  {busy === 'import' ? <><span className="spin" /> Importing</> : 'Import audience'}
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="field" style={{ margin: '0 0 14px' }}>
              <label htmlFor="ns-add-sub">Add a subscriber</label>
              <div className="row-actions">
                <input id="ns-add-sub" type="email" inputMode="email" value={newSubEmail}
                  onChange={(e) => setNewSubEmail(e.target.value)} placeholder="name@example.com" style={{ maxWidth: 320 }} />
                <button className="btn sm primary" type="button" onClick={addSubscriber} disabled={!newSubEmail.trim() || anyBusy}>
                  {busy === 'add-sub' ? <><span className="spin" /> Adding</> : 'Add'}
                </button>
              </div>
              <p className="hint" style={{ marginTop: 6 }}>
                Adds a confirmed, active subscriber directly (no double opt-in). Suppressed addresses (hard bounce / spam complaint) are refused.
              </p>
            </div>
            <div className="field" style={{ margin: '0 0 14px' }}>
              <label htmlFor="ns-sub-filter">Filter</label>
              <input id="ns-sub-filter" type="text" value={subSearch} onChange={(e) => setSubSearch(e.target.value)} placeholder="Filter by email…" />
            </div>

            {shownSubs.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                {(subscribers || []).length === 0 ? 'No subscribers yet.' : 'No subscribers match that filter.'}
              </p>
            ) : (
              <>
                <div className="tablewrap">
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Email</th><th>Status</th><th>Source</th><th>Created</th><th>Confirmed</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownSubs.map((s) => (
                          <tr key={s.id}>
                            <td>{s.email}</td>
                            <td><Pill style={statusPillStyle(s.status)}>{s.status}</Pill></td>
                            <td className="mono">{s.source || '—'}</td>
                            <td className="utc">{fmtUtc(s.created_at)}</td>
                            <td className="utc">{fmtUtc(s.confirmed_at)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {SUPPRESSED.has(s.status) ? (
                                <span className="meta">—</span>
                              ) : (
                                <button className="btn sm danger" type="button" onClick={() => removeSubscriber(s.id)} disabled={anyBusy}>
                                  {busy === `sub:${s.id}` ? '…' : 'Remove'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="meta" style={{ marginTop: 10 }}>
                  Showing {shownSubs.length} of {filteredSubs.length}
                  {filteredSubs.length !== (subscribers || []).length ? ` (filtered from ${(subscribers || []).length})` : ''}
                </p>
              </>
            )}
          </div>
        </>
      )}

      {/* ══ LINK BIN ════════════════════════════════════════════════════ */}
      {tab === 'links' && (
        <>
          <div className="card">
            <p className="eyebrow" style={{ margin: '0 0 10px' }}>Add a link</p>
            <div className="field">
              <label htmlFor="ns-link-url">URL</label>
              <input id="ns-link-url" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="field">
              <label htmlFor="ns-link-note">Note <span className="opt">(optional)</span></label>
              <input id="ns-link-note" type="text" value={linkNote} onChange={(e) => setLinkNote(e.target.value)} placeholder="Why it's worth a mention" />
            </div>
            <button className="btn primary" type="button" onClick={addLink} disabled={!linkUrl.trim() || anyBusy}>
              {busy === 'add-link' ? <><span className="spin" /> Adding</> : 'Add link'}
            </button>
          </div>

          <div className="card">
            <p className="eyebrow" style={{ margin: '0 0 10px' }}>Link bin</p>
            {sortedLinks.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>No links yet. Drop interesting URLs here to queue them for the next issue.</p>
            ) : (
              <div>
                {sortedLinks.map((l) => {
                  const used = l.status === 'used';
                  const discarded = l.status === 'discarded';
                  return (
                    <div
                      key={l.id}
                      className="row-actions"
                      style={{ padding: '12px 0', borderTop: '1px solid var(--line)', opacity: discarded ? 0.55 : 1, alignItems: 'flex-start' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontWeight: 700, textDecoration: used ? 'line-through' : 'underline', wordBreak: 'break-all' }}
                        >
                          {l.url}
                        </a>
                        {l.note && <div className="meta" style={{ marginTop: 3 }}>{l.note}</div>}
                        <div className="meta" style={{ marginTop: 3 }}>
                          {fmtUtc(l.added_at)}
                          {used && l.used_in_issue && (
                            <> · <a href={`/blog/${l.used_in_issue}`} style={{ textDecoration: 'underline' }}>view issue →</a></>
                          )}
                        </div>
                      </div>
                      <div>
                        {l.status === 'queued' ? (
                          <button className="btn sm" type="button" onClick={() => discardLink(l.id)} disabled={anyBusy}>
                            {busy === `link:${l.id}` ? '…' : 'Discard'}
                          </button>
                        ) : (
                          <Pill style={LINK_PILL[l.status] || FALLBACK_PILL}>{l.status}</Pill>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
