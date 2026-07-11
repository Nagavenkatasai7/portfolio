'use client';
// The composer — one clean form with a type selector that creates every content
// type through the admin-gated /api/content/create route (which routes to the
// single ingestion gate). Media uploads are PRESIGNED + DIRECT-TO-STORAGE: the
// browser asks /api/media/sign for a signed URL, PUTs the bytes straight to
// Supabase Storage (never through a function), then /api/media/finalize
// content-sniffs the object server-side before its public URL is attached.
import { useCallback, useRef, useState } from 'react';
import { useUnsavedGuard } from './useUnsavedGuard';
import { fetchWithTimeout, isTimeout } from './fetchWithTimeout';

const KINDS = [
  { id: 'blog', label: 'Blog post', ic: '✎' },
  { id: 'newsletter', label: 'Newsletter', ic: '✉' },
  { id: 'video', label: 'Video', ic: '▶' },
  { id: 'image', label: 'Image', ic: '❏' },
  { id: 'paste', label: 'Paste URL', ic: '🔗' },
];

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

const ERR_MSG = {
  unauthorized: 'Your session expired — sign in again.',
  bad_origin: 'Blocked cross-origin request.',
  title_required: 'A title is required.',
  body_required: 'A body is required for this type.',
  bad_video_url: 'That video URL isn’t a supported YouTube, Vimeo, or direct .mp4/.webm link.',
  image_required: 'Attach at least one image.',
  unrecognized_paste_url: 'Paste a LinkedIn or X/Twitter post URL.',
  invalid_published_at: 'That publish date is invalid.',
  future_publish_date: 'You can’t publish now with a future date. Clear the date, or uncheck “Publish now” to keep it a draft.',
  svg_rejected: 'SVG files are not allowed.',
  unsupported_type: 'That file type isn’t allowed.',
  image_too_large: 'Image exceeds the 10 MB limit.',
  video_too_large: 'Video exceeds the 200 MB limit.',
  content_sniff_failed: 'The uploaded file failed a content check.',
  server_not_configured: 'The server isn’t fully configured yet.',
  timed_out: 'The request timed out. Check your connection and try again.',
};

function friendly(code) { return ERR_MSG[code] || 'Something went wrong. Please try again.'; }

// Upload one file: sign -> raw PUT to Storage -> finalize (server sniff). Each
// step has an AbortController timeout (the raw PUT gets a generous window since
// large videos legitimately take a while); a timeout throws 'timed_out'.
async function uploadOne(file) {
  const signRes = await fetchWithTimeout('/api/media/sign', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  }, 30000);
  const sign = await signRes.json().catch(() => ({}));
  if (!signRes.ok) throw new Error(sign.error || 'sign_failed');

  const put = await fetchWithTimeout(sign.uploadUrl, {
    method: 'PUT', headers: { 'content-type': file.type || sign.mime, 'x-upsert': 'true' }, body: file,
  }, 180000);
  if (!put.ok) throw new Error('upload_failed');

  const finRes = await fetchWithTimeout('/api/media/finalize', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: sign.path }),
  }, 30000);
  const fin = await finRes.json().catch(() => ({}));
  if (!finRes.ok) throw new Error(fin.error || 'finalize_failed');
  return fin; // { url, type, kind, width, height, bytes }
}

export default function Composer() {
  const [kind, setKind] = useState('blog');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [publishNow, setPublishNow] = useState(false);
  const [publishedAt, setPublishedAt] = useState('');
  const [items, setItems] = useState([]); // {id, name, localUrl, isVideo, status, descriptor?, error?}
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false); // 401 -> offer a Sign in link
  const [hot, setHot] = useState(false);
  const fileRef = useRef(null);

  const uploading = items.some((i) => i.status === 'uploading');

  // Warn before losing typed-but-unsaved content. reset() empties every field on
  // a successful create, so `dirty` falls back to false automatically after save.
  const dirty = Boolean(title.trim() || body.trim() || videoUrl.trim() || pasteUrl.trim() || items.length > 0);
  useUnsavedGuard(dirty);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
        setItems((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, localUrl: null, isVideo: false, status: 'error', error: 'SVG not allowed' }]);
        continue;
      }
      const id = crypto.randomUUID();
      const localUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      setItems((prev) => [...prev, { id, name: file.name, localUrl, isVideo, status: 'uploading' }]);
      uploadOne(file).then(
        (descriptor) => setItems((prev) => prev.map((it) => it.id === id ? { ...it, status: 'done', descriptor } : it)),
        (err) => setItems((prev) => prev.map((it) => it.id === id ? { ...it, status: 'error', error: isTimeout(err) ? friendly('timed_out') : friendly(err.message) } : it)),
      );
    }
  }, []);

  const removeItem = (id) => setItems((prev) => {
    const it = prev.find((x) => x.id === id);
    if (it?.localUrl) URL.revokeObjectURL(it.localUrl);
    return prev.filter((x) => x.id !== id);
  });

  const reset = () => {
    setTitle(''); setBody(''); setVideoUrl(''); setPasteUrl('');
    setPublishNow(false); setPublishedAt('');
    items.forEach((it) => it.localUrl && URL.revokeObjectURL(it.localUrl));
    setItems([]);
  };

  async function submit(e) {
    e.preventDefault();
    setError(null); setResult(null); setExpired(false);
    if (uploading) { setError('Wait for uploads to finish.'); return; }
    setBusy(true);
    const media = items.filter((i) => i.status === 'done').map((i) => i.descriptor);
    // datetime-local is timezone-naive; interpret it in the BROWSER's local zone
    // and send a real UTC ISO so the stored published_at matches the owner's intent.
    let publishedIso;
    if (publishedAt) { const d = new Date(publishedAt); if (!Number.isNaN(d.getTime())) publishedIso = d.toISOString(); }
    const payload = {
      kind, title, body_md: body, videoUrl, url: pasteUrl,
      publishNow, published_at: publishedIso, media,
    };
    try {
      const res = await fetchWithTimeout('/api/content/create', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      }, 30000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setExpired(data.error === 'unauthorized'); setError(friendly(data.error)); setBusy(false); return; }
      setResult({ status: data.status, created: data.created });
      reset();
    } catch (e) {
      setError(isTimeout(e) ? friendly('timed_out') : 'Network error. Please try again.');
    }
    setBusy(false);
  }

  const bodyRequired = kind === 'blog' || kind === 'newsletter';
  const showUploader = kind === 'image' || kind === 'blog' || kind === 'newsletter' || kind === 'paste';

  return (
    <form onSubmit={submit} noValidate>
      {result && (
        <div className="banner ok">
          {result.status === 'published' ? 'Published to /blog. ' : 'Saved as a draft. '}
          <a href="/admin">Back to dashboard</a>{' · '}<a href="/blog">View /blog</a>
        </div>
      )}
      {error && (
        <div className="banner err">
          {error}
          {expired && <> <a href="/admin/login" target="_blank" rel="noopener noreferrer">Sign in ↗</a> — your draft stays here.</>}
        </div>
      )}

      <div className="field">
        <label>Content type</label>
        <div className="seg" role="group" aria-label="Content type">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setError(null); }}>
              <span className="ic" aria-hidden>{k.ic}</span>{k.label}
            </button>
          ))}
        </div>
      </div>

      {kind === 'paste' && (
        <div className="field">
          <label htmlFor="paste">Post URL <span className="opt">— LinkedIn or X/Twitter</span></label>
          <input id="paste" type="url" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="https://www.linkedin.com/posts/…  or  https://x.com/…/status/…" />
          <p className="hint">The source (LinkedIn / X) is detected automatically; the canonical URL is the dedupe key.</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="title">
          Title {kind === 'paste' ? <span className="opt">— optional</span> : null}
        </label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'paste' ? 'Optional headline for this post' : 'A clear, specific title'} />
      </div>

      {kind === 'video' && (
        <div className="field">
          <label htmlFor="video">Video URL</label>
          <input id="video" type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtu.be/…  ·  https://vimeo.com/…  ·  https://…/clip.mp4" />
          <p className="hint">YouTube &amp; Vimeo render as privacy-friendly embeds; direct .mp4/.webm as a &lt;video&gt;.</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="body">
          {kind === 'paste' || kind === 'video' || kind === 'image' ? <>Note / caption <span className="opt">— optional, markdown</span></> : <>Body <span className="opt">— markdown</span></>}
        </label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={bodyRequired ? '# Heading\n\nWrite in **markdown** — sanitized on render.' : 'Optional markdown note…'} />
        <p className="hint mono">Sanitized server-side: formatting only, no raw HTML/script/iframe/svg.</p>
      </div>

      {showUploader && (
        <div className="field">
          <label>
            {kind === 'image' ? 'Images' : <>Attach images <span className="opt">— optional</span></>}
          </label>
          <div
            className={`drop${hot ? ' hot' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setHot(true); }}
            onDragLeave={() => setHot(false)}
            onDrop={(e) => { e.preventDefault(); setHot(false); addFiles(e.dataTransfer.files); }}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          >
            <div className="big">Drop images here or click to browse</div>
            <div className="hint mono">jpeg · png · webp · gif — up to 10 MB each. No SVG.</div>
          </div>
          <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} multiple hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          {items.length > 0 && (
            <div className="thumbs">
              {items.map((it) => (
                <div key={it.id} className={`thumb${it.status === 'error' ? ' err' : ''}`}>
                  <button type="button" className="rm" title="Remove" onClick={() => removeItem(it.id)}>×</button>
                  {/* localUrl is always a locally-generated blob: URL from
                      URL.createObjectURL; guard enforces that invariant. */}
                  {it.localUrl && it.localUrl.startsWith('blob:') && (it.isVideo
                    ? <video src={it.localUrl} muted />
                    : <img src={it.localUrl} alt="" />)}
                  <div className="st">
                    {it.status === 'uploading' && <><span className="spin" /> uploading…</>}
                    {it.status === 'done' && <>✓ {it.descriptor?.width ? `${it.descriptor.width}×${it.descriptor.height}` : 'stored'}</>}
                    {it.status === 'error' && (it.error || 'failed')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <hr className="divider" />

      <div className="field">
        <div className="check">
          <input id="pub" type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
          <div>
            <label htmlFor="pub">Publish now</label>
            <div className="sub">Leave unchecked to save as a draft (hidden from /blog until you publish).</div>
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="pat">Publish date <span className="opt">— optional, defaults to now (stored UTC)</span></label>
        <input id="pat" type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
      </div>

      <div className="row-actions">
        <button className="btn primary" type="submit" disabled={busy || uploading}>
          {busy ? <><span className="spin" /> Saving…</> : (publishNow ? 'Create & publish' : 'Save draft')}
        </button>
        <a className="btn" href="/admin">Cancel</a>
        {uploading && <span className="hint" style={{ margin: 0 }}>Uploading media…</span>}
      </div>
    </form>
  );
}
