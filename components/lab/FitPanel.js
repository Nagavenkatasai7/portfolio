'use client';

import { useEffect, useState } from 'react';
import { postJson } from './api';

const SAMPLE = `AI Engineer

We are hiring an AI Engineer to build LLM-powered products. You will design agents that use tool calling, build RAG pipelines over internal documents, fine-tune open models, and set up evaluations that measure quality before anything ships.

Requirements:
- Strong Python and experience with LLM APIs (OpenAI, Anthropic)
- Hands-on RAG, embeddings, and vector databases
- Fine-tuning experience (LoRA, PEFT) with PyTorch and Hugging Face
- Model evaluation and benchmarking
- Docker and a cloud platform (AWS preferred)
- Kubernetes experience is a plus
- Experience with Spark or large-scale data pipelines`;

const LABEL = { strong: 'Strong match', partial: 'Partial match', gap: 'Gap' };

function Ring({ score }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setP(score), 50);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <div className="ring" style={{ '--p': p }} role="img" aria-label={`Fit score ${score} out of 100`}>
      <span>{score}</span>
    </div>
  );
}

export default function FitPanel() {
  const [jd, setJd] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (loading) return;
    setError('');
    setLoading(true);
    setResult(null);
    const { data, error: err } = await postJson('/api/fit', { jobDescription: jd }, 80000);
    setLoading(false);
    if (err) setError(err);
    else setResult(data);
  }

  return (
    <div>
      <div className="panel-intro">
        <div>
          <h3>Job-fit check</h3>
          <p>
            Paste a job description. Each requirement is mapped to evidence from my work, with links, and anything I have not done is listed
            as a gap. Gaps are shown on purpose.
          </p>
        </div>
        <div className="how">
          <strong>How it works</strong>
          <ol>
            <li>An open LLM extracts the key requirements and proposes evidence.</li>
            <li>The server checks every evidence id against my real resume passages.</li>
            <li>Claims without valid evidence are downgraded to partial or gap.</li>
          </ol>
        </div>
      </div>

      <label htmlFor="jd" className="sr-only">
        Job description
      </label>
      <textarea
        id="jd"
        className="textarea"
        value={jd}
        maxLength={8000}
        placeholder="Paste a job description here…"
        onChange={(e) => setJd(e.target.value)}
      />
      <div className="fit-actions">
        <button className="btn btn-primary" type="button" disabled={loading || jd.trim().length < 80} onClick={run}>
          Check my fit
        </button>
        <button className="btn" type="button" disabled={loading} onClick={() => setJd(SAMPLE)}>
          Use a sample job description
        </button>
      </div>

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
            Reading the requirements and checking evidence… (up to 45 seconds on free models)
          </div>
        )}

        {result && (
          <>
            <div className="fit-summary">
              <Ring score={result.summary.score} />
              <div>
                <div className="viz-title">{result.role ? `Fit for: ${result.role}` : 'Fit summary'}</div>
                <div className="fit-counts">
                  <span className="pill strong">{result.summary.strong} strong</span>
                  <span className="pill partial">{result.summary.partial} partial</span>
                  <span className="pill gap">{result.summary.gap} gaps</span>
                </div>
                <div className="meta-row">
                  {result.mode === 'llm' ? (
                    <span className="badge">Analyzed by {result.model?.split('/')[1]?.replace(':free', '') || 'an open LLM'}</span>
                  ) : (
                    <span className="badge warn">Offline mode: keyword matching</span>
                  )}
                  <span>Score = strong + ½ partial, out of all requirements</span>
                </div>
              </div>
            </div>
            <ul className="req-list">
              {result.requirements.map((r, i) => (
                <li className="req" key={`${r.requirement}-${i}`} style={{ '--i': i }}>
                  <div className="req-top">
                    <span className="req-name">{r.requirement}</span>
                    <span className={`pill ${r.match}`}>{LABEL[r.match]}</span>
                  </div>
                  {r.explanation && <p>{r.explanation}</p>}
                  {r.evidence?.length > 0 && (
                    <ul className="sources" aria-label="Evidence">
                      {r.evidence.map((e) => (
                        <li key={e.id}>
                          <a href={e.href}>↗ {e.title}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
