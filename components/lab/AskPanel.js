'use client';

import { useRef, useState } from 'react';
import { postJson } from './api';

const SUGGESTED = [
  'What has Naga built with LLM tool calling?',
  'How did Naga fix catastrophic forgetting?',
  'What did the VLM chart study find?',
  'How does SmartRemit avoid double payments?',
  'What is Naga’s education?',
];

// Renders answer text, turning [n] markers into links to the cited section.
function AnswerText({ text, sources }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        const src = m && sources[Number(m[1]) - 1];
        if (!src) return part;
        return (
          <a key={i} className="cite" href={src.href} title={src.title}>
            {m[1]}
          </a>
        );
      })}
    </p>
  );
}

export default function AskPanel() {
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function ask(q) {
    const text = q.trim();
    if (!text || loading) return;
    setError('');
    setLoading(true);
    setQuestion('');
    const { data, error: err } = await postJson('/api/ask', { question: text });
    setLoading(false);
    if (err) {
      setError(err);
      setQuestion(text);
      return;
    }
    setThread((t) => [...t, { q: text, ...data }]);
  }

  return (
    <div>
      <div className="panel-intro">
        <div>
          <h3>Ask about my work</h3>
          <p>
            Ask anything about my experience, projects, research, or skills. The assistant answers only from this site’s content and cites
            the section each fact comes from.
          </p>
        </div>
        <div className="how">
          <strong>How it works</strong>
          <ol>
            <li>BM25 retrieval picks the most relevant passages from my resume.</li>
            <li>An open LLM answers using only those passages, citing each one.</li>
            <li>The server drops any citation that doesn’t match a real passage.</li>
          </ol>
        </div>
      </div>

      <div className="chips">
        {SUGGESTED.map((s) => (
          <button key={s} type="button" className="chip" disabled={loading} onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-input"
          ref={inputRef}
          className="input"
          value={question}
          maxLength={500}
          placeholder="e.g. Has Naga deployed anything to production?"
          onChange={(e) => setQuestion(e.target.value)}
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit" disabled={loading || question.trim().length < 3}>
          Ask
        </button>
      </form>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="thread" aria-live="polite">
        {thread.map((m, i) => (
          <div key={i} className="thread">
            <div className="msg-q">{m.q}</div>
            <div className="msg-a">
              <AnswerText text={m.answer} sources={m.sources} />
              {m.sources?.length > 0 && (
                <ul className="sources" aria-label="Sources">
                  {m.sources.map((s, j) => (
                    <li key={s.id}>
                      <a href={s.href}>
                        <span className="cite">{j + 1}</span>
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="meta-row">
                {m.mode === 'llm' ? (
                  <span className="badge">Answered by {m.model?.split('/')[1]?.replace(':free', '') || 'an open LLM'}</span>
                ) : (
                  <span className="badge warn">Offline mode: showing resume passages</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="thinking">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Retrieving passages and writing an answer…
          </div>
        )}
      </div>
    </div>
  );
}
