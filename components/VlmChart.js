'use client';

import { useEffect, useRef, useState } from 'react';

const VIEWS = {
  dimension: {
    button: '2D vs 3D',
    title: 'GPT-5.4 accuracy on ChartX',
    caption:
      'Same benchmark, same model: moving the charts into 3D cost 26.4 points of accuracy, because 3D views hide or distort the values the questions ask about.',
  },
  dataLabels: {
    button: 'Data-label fix',
    title: 'Questions asking for unseen exact numbers',
    caption:
      'Some benchmark questions asked for exact numbers the chart never showed. Adding data labels raised accuracy on those questions by 46.1 points: the gap was in the benchmark, not only the model.',
  },
};

export default function VlmChart({ data }) {
  const [view, setView] = useState('dimension');
  const [ready, setReady] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setReady(true);
        io.disconnect();
      }
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const rows = data[view];
  const diff = rows[1].value - rows[0].value;

  return (
    <figure className="viz" ref={ref}>
      <div className="viz-head">
        <figcaption className="viz-title">{VIEWS[view].title}</figcaption>
        <div className="seg" role="group" aria-label="Choose result">
          {Object.entries(VIEWS).map(([key, v]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>
              {v.button}
            </button>
          ))}
        </div>
      </div>
      <div className="hbars">
        {rows.map((r, i) => (
          <div key={r.label}>
            <div className="hbar-label">
              <span>{r.label}</span>
              <strong>{r.value}%</strong>
            </div>
            <div className="hbar-track" role="img" aria-label={`${r.label}: ${r.value}% accuracy`}>
              <div
                className={`hbar-fill${(view === 'dimension' && i === 1) || (view === 'dataLabels' && i === 0) ? ' low' : ''}`}
                style={{ width: ready ? `${r.value}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
      <span className={`delta ${diff < 0 ? 'down' : 'up'}`}>
        {diff < 0 ? '▼' : '▲'} {Math.abs(diff).toFixed(1)} points
      </span>
      <p className="viz-caption">{VIEWS[view].caption}</p>
    </figure>
  );
}
