'use client';

import { useEffect, useRef, useState } from 'react';

const COLORS = {
  base: '#5b5b73',
  v6: '#fb7185',
  v7: '#22d3ee',
};

export default function LlamaChart({ data }) {
  const [on, setOn] = useState({ base: true, v6: true, v7: true });
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

  const max = 50;
  const toggle = (key) => setOn((s) => ({ ...s, [key]: !s[key] || Object.values(s).filter(Boolean).length === 1 }));

  return (
    <figure className="viz" ref={ref}>
      <div className="viz-head">
        <figcaption className="viz-title">Benchmark scores (%)</figcaption>
      </div>
      <div className="legend" role="group" aria-label="Show or hide model versions">
        {data.series.map((s) => (
          <button key={s.key} type="button" aria-pressed={on[s.key]} onClick={() => toggle(s.key)}>
            <span className="swatch" style={{ background: COLORS[s.key] }} />
            {s.label}
          </button>
        ))}
      </div>
      <div className="vbars">
        {data.benchmarks.map((b) => (
          <div className="vgroup" key={b.name} role="img" aria-label={`${b.name}: base ${b.base}%, earlier run ${b.v6}%, final model ${b.v7}%`}>
            {data.series.map((s) => (
              <div
                key={s.key}
                className={`vbar s-${s.key}${on[s.key] ? '' : ' hidden'}`}
                style={{ height: ready ? `${(b[s.key] / max) * 100}%` : '0%' }}
              >
                <span className="vval">{b[s.key].toFixed(1)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="vlabels">
        {data.benchmarks.map((b) => (
          <div key={b.name}>
            <strong>{b.name}</strong>
            <span>{b.detail}</span>
          </div>
        ))}
      </div>
      <p className="viz-caption">
        The earlier run collapsed on math (33.6% → 6.1% on GSM8K). The final model stayed within 2.1 points of the base model on all three
        benchmarks.
      </p>
    </figure>
  );
}
