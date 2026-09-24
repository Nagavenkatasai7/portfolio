'use client';

import { useEffect, useState } from 'react';
import { postJson } from './api';

const EXAMPLES = [
  'What is a bond yield curve inversion?',
  'Explain the difference between a Roth IRA and a traditional IRA.',
  'What does EBITDA measure?',
  'How does dollar-cost averaging work?',
];

const MODEL_URL = 'https://huggingface.co/Venkat9990/finance-specialist-v7';

export default function LlamaPanel() {
  const [configured, setConfigured] = useState(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [asked, setAsked] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/llama')
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  async function run(q) {
    const text = q.trim();
    if (text.length < 3 || loading) return;
    setError('');
    setLoading(true);
    setResult(null);
    setAsked(text);
    const { data, error: err } = await postJson('/api/llama', { question: text }, 125000);
    setLoading(false);
    if (err) setError(err);
    else setResult(data);
  }

  return (
    <div>
      <div className="panel-intro">
        <div>
          <h3>Finance-Llama, live</h3>
          <p>
            Ask one finance question and get two answers: one from the base Llama 3.2 1B model and one from my fine-tuned version. Both run
            as 4-bit GGUF models on a free CPU server.
          </p>
        </div>
        <div className="how">
          <strong>How it works</strong>
          <ol>
            <li>Your question goes to a Hugging Face Space running llama.cpp.</li>
            <li>The base model and my fine-tuned model answer the same prompt.</li>
            <li>Benchmarks for both are in the Projects section above.</li>
          </ol>
        </div>
      </div>

      {configured === false && (
        <div className="notice">
          <h4>The live demo is coming online soon</h4>
          <p>
            The model is public on Hugging Face, and you can run it yourself today with Transformers or Ollama. Its full benchmark results
            are in the Projects section.
          </p>
          <a className="ext-link" href={MODEL_URL} target="_blank" rel="noopener">
            Open the model on Hugging Face ↗
          </a>
        </div>
      )}

      {configured && (
        <>
          <div className="chips">
            {EXAMPLES.map((s) => (
              <button key={s} type="button" className="chip" disabled={loading} onClick={() => run(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(question);
            }}
          >
            <label htmlFor="llama-input" className="sr-only">
              Finance question
            </label>
            <input
              id="llama-input"
              className="input"
              value={question}
              maxLength={300}
              placeholder="Ask a finance question…"
              onChange={(e) => setQuestion(e.target.value)}
              autoComplete="off"
            />
            <button className="btn btn-primary" type="submit" disabled={loading || question.trim().length < 3}>
              Compare
            </button>
          </form>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <div aria-live="polite">
            {loading && (
              <div className="thinking" style={{ marginTop: 20 }}>
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                Running both models on a free CPU server. This takes 20–60 seconds, or a few minutes if the server is waking up.
              </div>
            )}
            {result && (
              <>
                <div className="meta-row" style={{ marginTop: 20 }}>
                  <span className="badge">Question: {asked}</span>
                  {result.seconds && <span>Generated in {result.seconds.toFixed(1)}s</span>}
                </div>
                <div className="duel">
                  <div className="duel-col">
                    <h4>Base Llama 3.2 1B</h4>
                    <p>{result.base}</p>
                  </div>
                  <div className="duel-col tuned">
                    <h4>My finance-tuned model</h4>
                    <p>{result.tuned}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {configured === null && <div className="thinking">Checking the demo server…</div>}
    </div>
  );
}
