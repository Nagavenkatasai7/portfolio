'use client';

import { useRef, useState } from 'react';
import AskPanel from './AskPanel';
import FitPanel from './FitPanel';
import LlamaPanel from './LlamaPanel';

const TABS = [
  { id: 'ask', label: 'Ask about my work', icon: '✦', Panel: AskPanel },
  { id: 'fit', label: 'Job-fit check', icon: '◎', Panel: FitPanel },
  { id: 'llama', label: 'Finance-Llama live', icon: '⚡', Panel: LlamaPanel },
];

export default function AiLab() {
  const [active, setActive] = useState('ask');
  const tabRefs = useRef({});

  function onKeyDown(e) {
    const i = TABS.findIndex((t) => t.id === active);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (next) {
      e.preventDefault();
      setActive(next.id);
      tabRefs.current[next.id]?.focus();
    }
  }

  return (
    <div className="card lab-shell">
      <div className="tabs" role="tablist" aria-label="AI Lab tools" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => (tabRefs.current[t.id] = el)}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map(({ id, Panel }) => (
        <div key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} className="tab-panel" hidden={active !== id}>
          <Panel />
        </div>
      ))}
    </div>
  );
}
