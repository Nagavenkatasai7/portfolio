'use client';
// Edit an existing item's title / body / (video URL) via /api/content/update,
// which preserves the row's dedupe identity + original published_at and
// re-writes through the ingestion gate. Status changes happen on the dashboard
// (publish/unpublish/remove), not here.
import { useState } from 'react';

const ERR_MSG = {
  unauthorized: 'Your session expired — sign in again.',
  not_found: 'That item no longer exists.',
  bad_video_url: 'That video URL isn’t a supported YouTube, Vimeo, or direct link.',
  server_not_configured: 'The server isn’t fully configured yet.',
};
const friendly = (c) => ERR_MSG[c] || 'Could not save. Please try again.';

export default function EditForm({ row }) {
  const [title, setTitle] = useState(row.title || '');
  const [body, setBody] = useState(row.body_md || '');
  const [videoUrl, setVideoUrl] = useState(row.payload?.video?.url || '');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setOk(false);
    const payload = { id: row.id, title, body_md: body };
    if (row.type === 'video') payload.videoUrl = videoUrl;
    try {
      const res = await fetch('/api/content/update', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(friendly(data.error)); setBusy(false); return; }
      setOk(true);
    } catch { setError('Network error. Please try again.'); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate>
      {ok && <div className="banner ok">Saved. <a href="/admin">Back to dashboard</a>{' · '}<a href="/blog">View /blog</a></div>}
      {error && <div className="banner err">{error}</div>}

      <div className="field">
        <label htmlFor="t">Title</label>
        <input id="t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {row.type === 'video' && (
        <div className="field">
          <label htmlFor="v">Video URL</label>
          <input id="v" type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
          <p className="hint">YouTube / Vimeo / direct .mp4/.webm.</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="b">Body <span className="opt">— markdown</span></label>
        <textarea id="b" value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="hint mono">Sanitized server-side on render.</p>
      </div>

      <div className="row-actions">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Saving…</> : 'Save changes'}</button>
        <a className="btn" href="/admin">Cancel</a>
      </div>
    </form>
  );
}
