'use client';
// The X draft studio — a terminal "command deck" for drafting styled X/Twitter
// posts. Topic/tone/format -> Generate (POST /api/x/generate, OpenRouter fallback
// chain) -> 1..3 editable variants with a LIVE per-tweet character count (280,
// thread splitter) -> per-draft Save / Approve & publish / Discard, plus Copy and
// an "Open X compose" intent link (a plain twitter.com/intent/tweet URL — NOT an
// API call; posting to X is manual for now).
//
// Live counting + thread splitting reuse the SAME pure helpers the server uses
// (lib/x_draft_pure.js) so the number here matches what gets stored. Generation
// failure NEVER blocks authoring: on failure we surface a soft message and still
// give an editable blank draft so the owner can write, save, and publish by hand.
import { useCallback, useRef, useState } from 'react';
import { TWEET_LIMIT, countChars, splitIntoTweets, X_TONES } from '@/lib/x_draft_pure';
import { useUnsavedGuard } from './useUnsavedGuard';

const ERR_MSG = {
  unauthorized: 'Your session expired — sign in again.',
  bad_origin: 'Blocked cross-origin request.',
  topic_required: 'Enter a topic or seed first.',
  payload_too_large: 'That topic is too long — trim it.',
  generation_unavailable: 'The free models are busy or out of credits right now, so the draft couldn’t be generated. Write it yourself below — you can still save and publish.',
  empty_generation: 'The model returned nothing usable. Try again, tweak the topic, or write it yourself below.',
  text_required: 'Nothing to save — write some text first.',
  text_too_long: 'That draft is too long to save.',
  server_not_configured: 'The server isn’t fully configured yet.',
  not_found: 'That draft no longer exists.',
};
const friendly = (c) => ERR_MSG[c] || 'Something went wrong. Please try again.';

let SEQ = 0;
const uid = () => `v${Date.now().toString(36)}_${SEQ++}`;
// savedText snapshots the text at the last successful save, so an edit AFTER a
// save re-counts as unsaved (savedText !== text) for the unsaved-changes guard
// and the pre-regenerate confirm.
const makeVariant = (text, format, origin = 'ai') => ({ key: uid(), text, format, origin, saved: null, savedText: null, busy: false, msg: null, err: null });

// A variant holds unsaved writing when it has text that was never saved, or was
// edited since its last save. Removed drafts don't count.
const variantDirty = (v) => v.saved?.status !== 'removed' && Boolean(v.text.trim()) && (!v.saved || v.savedText !== v.text);

// Live derivation of a variant's tweets + counts (mirrors the server exactly).
function derive(v) {
  const tweets = v.format === 'thread' ? splitIntoTweets(v.text) : [v.text || ''];
  const counts = tweets.map(countChars);
  const total = countChars(v.text || '');
  const over = v.format === 'single' ? total > TWEET_LIMIT : counts.some((c) => c > TWEET_LIMIT);
  return { tweets, counts, total, over };
}
const intentHref = (firstText) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(firstText || '')}`;

function Meter({ total }) {
  const pct = Math.min(100, Math.round((total / TWEET_LIMIT) * 100));
  const cls = total > TWEET_LIMIT ? 'over' : total > TWEET_LIMIT * 0.9 ? 'warn' : '';
  const remaining = TWEET_LIMIT - total;
  return (
    <div className="meter">
      <div className="bar"><div className={`fill ${cls}`} style={{ width: `${pct}%` }} /></div>
      <div className={`num ${total > TWEET_LIMIT ? 'over' : ''}`}>{total}/{TWEET_LIMIT}{total > TWEET_LIMIT ? ` · ${remaining}` : ''}</div>
    </div>
  );
}

export default function XStudio() {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState(X_TONES[0]);
  const [format, setFormat] = useState('single');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [modelUsed, setModelUsed] = useState(null);
  const [batchTexts, setBatchTexts] = useState([]);   // provenance: the options generated
  const [variants, setVariants] = useState([]);
  const [copiedKey, setCopiedKey] = useState('');
  const copyTimer = useRef(null);

  const setV = useCallback((key, patch) => {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }, []);

  // Guard the whole deck: warn on close/reload while any draft has unsaved text.
  const anyDirty = variants.some(variantDirty);
  useUnsavedGuard(anyDirty);

  async function generate() {
    const t = topic.trim();
    if (!t) { setGenError(friendly('topic_required')); return; }
    setGenerating(true); setGenError(null);
    try {
      const res = await fetch('/api/x/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: t, tone, format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 200) {
        setGenError(friendly(data.error));
        // keep authoring possible even on a hard error
        setVariants([makeVariant('', format, 'manual')]);
        return;
      }
      if (data.ok) {
        setModelUsed(data.model_used || null);
        setBatchTexts(Array.isArray(data.variants) ? data.variants.map((v) => v.text) : []);
        setVariants((data.variants || []).map((v) => makeVariant(v.text, data.format || format, 'ai')));
        setGenError(null);
      } else {
        setGenError(friendly(data.error));
        setModelUsed(null);
        setVariants([makeVariant('', format, 'manual')]); // write-it-yourself fallback
      }
    } catch {
      setGenError('Network error — the draft couldn’t be generated. Write it yourself below.');
      setVariants([makeVariant('', format, 'manual')]);
    } finally {
      setGenerating(false);
    }
  }

  const addBlank = () => setVariants((prev) => [...prev, makeVariant('', format, 'manual')]);

  async function copy(v) {
    const d = derive(v);
    const text = v.format === 'thread' ? d.tweets.join('\n\n') : v.text;
    try { await navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
    setCopiedKey(v.key);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedKey(''), 1600);
  }

  async function save(v, action) {
    if (!v.text.trim()) { setV(v.key, { err: friendly('text_required'), msg: null }); return; }
    setV(v.key, { busy: true, err: null, msg: null });
    try {
      const res = await fetch('/api/x/save', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(), tone, format: v.format,
          model_used: v.origin === 'ai' ? (modelUsed || 'unknown') : 'manual',
          text: v.text, variants: batchTexts, action,
          // Stable per-card id => re-saving edited text UPSERTS the same row
          // (so edits to a saved draft persist on Approve/Update, no orphan).
          draftId: v.key,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setV(v.key, { busy: false, err: friendly(data.error) }); return; }
      setV(v.key, {
        busy: false,
        saved: { id: data.id, status: data.status },
        savedText: v.text, // the exact text just persisted server-side
        msg: action === 'publish' ? 'published' : 'saved as draft',
        err: null,
      });
    } catch { setV(v.key, { busy: false, err: 'Network error. Please try again.' }); }
  }

  async function discard(v) {
    if (!v.saved) { setVariants((prev) => prev.filter((x) => x.key !== v.key)); return; }
    setV(v.key, { busy: true, err: null });
    try {
      const res = await fetch('/api/content/moderate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: v.saved.id, action: 'remove' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setV(v.key, { busy: false, err: friendly(data.error) }); return; }
      setV(v.key, { busy: false, saved: { id: v.saved.id, status: 'removed' }, msg: 'removed from blog' });
    } catch { setV(v.key, { busy: false, err: 'Network error. Please try again.' }); }
  }

  const canGen = topic.trim().length > 0 && !generating;

  return (
    <div className="term">
      <div className="titlebar">
        <span className="dots"><i /><i /><i /></span>
        <span className="path">~/x-studio <b>$</b> compose</span>
        <span className="live"><span className="pulse" /> drafting deck</span>
      </div>

      <div className="screen">
        <p className="eyebrow">X draft studio</p>
        <h1>Compose for X<span className="cursor" aria-hidden="true" /></h1>
        <p className="lede">
          Seed a topic, pick a tone and format, and the model drafts styled posts down the same free-model
          fallback chain as the site chatbot. Everything stays a <code>draft</code> until you approve it.
        </p>

        <div className="note">
          <span className="ic" aria-hidden="true">▲</span>
          <div>
            <b>Publishing shows a post on your <a href="/blog" style={{ textDecoration: 'underline' }}>/blog</a>.</b> Posting to X
            itself is manual for now — use <b>Copy text</b> or <b>Open X compose</b> and paste it into X yourself.
          </div>
        </div>

        {/* command bar */}
        <div className="cmd">
          <label className="lbl" htmlFor="x-topic">Topic / seed</label>
          <div className="promptline">
            <span className="caret" aria-hidden="true">&gt;</span>
            <textarea id="x-topic" className="topic" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. what I learned building a 12-stage LLM pipeline on a shared H100 cluster" />
          </div>

          <div className="controls">
            <div className="col">
              <label className="lbl" htmlFor="x-tone">Tone</label>
              <select id="x-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                {X_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col" style={{ flex: '0 0 auto' }}>
              <label className="lbl">Format</label>
              <div className="seg" role="group" aria-label="Post format">
                <button type="button" aria-pressed={format === 'single'} onClick={() => setFormat('single')}>◦ Single</button>
                <button type="button" aria-pressed={format === 'thread'} onClick={() => setFormat('thread')}>≡ Thread</button>
              </div>
            </div>
          </div>

          <div className="genrow">
            <button className="btn go" type="button" onClick={generate} disabled={!canGen}>
              {generating ? <><span className="spin" /> generating<span className="dotdot" /></> : '⌁ Generate drafts'}
            </button>
            <span className="hint">3 variants · {format === 'thread' ? 'thread' : 'single tweet'}</span>
          </div>
        </div>

        {genError && (
          <div className="fail">
            <h3>Couldn’t generate</h3>
            <p>{genError}</p>
            <button className="btn primary" type="button" onClick={addBlank}>＋ Write a draft manually</button>
          </div>
        )}

        {/* output */}
        <div className="outhead">
          <span className="label">{variants.length ? <>output · <b>{variants.length} draft{variants.length === 1 ? '' : 's'}</b>{modelUsed ? ` · ${modelUsed}` : ''}</> : 'output'}</span>
          <span className="rule" />
          {variants.length > 0 && <button className="btn ghost" type="button" onClick={addBlank}>＋ blank</button>}
        </div>

        {variants.length === 0 ? (
          <div className="placeholder"><b>No drafts yet.</b>Generate from a topic above, or start a blank draft.</div>
        ) : (
          <div className="variants">
            {variants.map((v, i) => {
              const d = derive(v);
              const gone = v.saved?.status === 'removed';
              const stateChip = gone
                ? <span className="state rm">removed</span>
                : v.saved?.status === 'published'
                  ? <span className="state pub">published → /blog</span>
                  : v.saved
                    ? <span className="state ok">saved draft</span>
                    : <span className="state">{v.origin === 'ai' ? 'unsaved' : 'manual'}</span>;
              return (
                <div key={v.key} className={`vc${v.saved && !gone ? ' saved' : ''}${gone ? ' gone' : ''}`} style={{ animationDelay: `${Math.min(i, 6) * 0.05}s` }}>
                  <div className="vc-head">
                    <span className="tag">draft {String(i + 1).padStart(2, '0')}</span>
                    {stateChip}
                    <span className="spacer" />
                    <span className="num" style={{ fontSize: 11, color: 'var(--faint)' }}>{v.format === 'thread' ? `${d.tweets.length} tweet${d.tweets.length === 1 ? '' : 's'}` : 'single'}</span>
                  </div>

                  <div className="vc-body">
                    <textarea value={v.text} onChange={(e) => setV(v.key, { text: e.target.value, err: null })}
                      placeholder={v.origin === 'manual' ? 'Write your post…' : ''} disabled={gone} />

                    {v.format === 'single' ? (
                      <>
                        <Meter total={d.total} />
                        {d.over && !gone && (
                          <div style={{ marginTop: 8 }}>
                            <button className="btn ghost" type="button" onClick={() => setV(v.key, { format: 'thread' })}>
                              ≡ Over 280 — split into a thread
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="meter" style={{ marginTop: 10 }}>
                          <div className="bar"><div className={`fill ${d.over ? 'over' : ''}`} style={{ width: `${Math.min(100, (d.total / (TWEET_LIMIT * Math.max(1, d.tweets.length))) * 100)}%` }} /></div>
                          <div className="num">{d.tweets.length} tw · {d.total}</div>
                        </div>
                        <div className="thread">
                          {d.tweets.map((tw, ti) => (
                            <div className="tw" key={ti}>
                              {ti > 0 && <span className="thread-line" aria-hidden="true" />}
                              <div className="tw-top">
                                <span className="idx">{ti + 1}/{d.tweets.length}</span>
                                <span className={`cc ${d.counts[ti] > TWEET_LIMIT ? 'over' : ''}`}>{d.counts[ti]}/{TWEET_LIMIT}</span>
                              </div>
                              <div className="txt">{tw}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <button className="btn ghost" type="button" onClick={() => setV(v.key, { format: 'single' })}>◦ Collapse to single tweet</button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="vc-actions">
                    <button className="btn ghost" type="button" onClick={() => copy(v)} disabled={!v.text.trim() || gone}>
                      {copiedKey === v.key ? '✓ copied' : '⧉ Copy text'}
                    </button>
                    <a className="btn ghost" href={intentHref(v.format === 'thread' ? d.tweets[0] : v.text)}
                      target="_blank" rel="noopener noreferrer nofollow"
                      onClick={(e) => { if (!v.text.trim()) e.preventDefault(); }}>↗ Open X compose</a>
                    <span className="sep" aria-hidden="true" />
                    {/* Every persist action goes through save() with the CURRENT
                        text + the stable draftId, so inline edits made after a
                        save are always written (never a text-blind status flip). */}
                    {!gone && (v.saved?.status === 'published' ? (
                      <>
                        <button className="btn go" style={{ padding: '9px 16px', fontSize: 12.5 }} type="button" onClick={() => save(v, 'publish')} disabled={v.busy}>
                          {v.busy ? <><span className="spin" /> …</> : '↻ Update live post'}
                        </button>
                        <span className="msg">✓ live on <a href="/blog">/blog</a></span>
                      </>
                    ) : v.saved ? (
                      <>
                        <button className="btn go" style={{ padding: '9px 16px', fontSize: 12.5 }} type="button" onClick={() => save(v, 'publish')} disabled={v.busy}>
                          {v.busy ? <><span className="spin" /> …</> : '✓ Approve & publish'}
                        </button>
                        <button className="btn primary" type="button" onClick={() => save(v, 'draft')} disabled={v.busy}>⭑ Save changes</button>
                      </>
                    ) : (
                      <>
                        <button className="btn primary" type="button" onClick={() => save(v, 'draft')} disabled={v.busy}>
                          {v.busy ? <><span className="spin" /> saving</> : '⭑ Save as draft'}
                        </button>
                        <button className="btn go" style={{ padding: '9px 16px', fontSize: 12.5 }} type="button" onClick={() => save(v, 'publish')} disabled={v.busy}>
                          ✓ Approve &amp; publish
                        </button>
                      </>
                    ))}
                    <button className="btn danger" type="button" onClick={() => discard(v)} disabled={v.busy || gone}>
                      {v.saved ? '✕ Discard from blog' : '✕ Discard'}
                    </button>
                    <span className="grow" />
                    {v.msg && <span className="msg">✓ {v.msg} · <a href="/admin">dashboard</a></span>}
                    {v.err && <span className="msg err">{v.err}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
