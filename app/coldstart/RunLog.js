'use client';
// app/coldstart/RunLog.js
// The run log in the bottom-right corner (spec §6, §12).
//
// A run log, not a progress bar: it says what happened, in the order it happened, in
// the register a terminal would. It replaces the placeholder that shipped with the
// static stage in Task 8 — while the run is idle it still renders nothing at all.
//
// Nothing here is announced: narration goes through the aria-live region in Stage, so
// a screen reader hears each transition once rather than the whole log every time.
//
// createElement rather than JSX so `node --test` can server-render this file.

import { createElement as h, memo } from 'react';

const UNEVALUATED = 'Served an unevaluated model. This is exactly how a silent regression ships.';

function counts(nodes) {
  const ids = Object.keys(nodes || {});
  let done = 0;
  for (const id of ids) if (nodes[id] === 'done') done += 1;
  return { done, total: ids.length };
}

function seconds(ms) {
  return `${(Math.max(0, ms || 0) / 1000).toFixed(1)}s`;
}

function line(key, text, tone) {
  return h('p', {
    key,
    className: 'runlog-line',
    'data-tone': tone || undefined,
    style: {
      margin: 0,
      color: tone === 'bad' ? 'var(--red)' : tone === 'good' ? 'var(--green)' : 'var(--ink)',
    },
  }, text);
}

/**
 * @param {{ state?: null | {
 *   run: string, nodes: Record<string, string>, patched: boolean, cut: string[],
 *   unevaluated: boolean, current: string|null, elapsedMs: number,
 *   receipt: null | { nodes: number, elapsedMs: number, unevaluated: boolean }
 * } }} props
 */
function RunLog({ state = null }) {
  if (!state || state.run === 'idle') return null;

  const { done, total } = counts(state.nodes);
  const lines = [];

  if (state.run === 'running') {
    lines.push(line(
      'run',
      state.current
        ? `RUN ${Math.min(total, done + 1)}/${total} ${state.current}`
        : `RUN ${done}/${total}`,
    ));
  }

  if (state.run === 'halted') {
    lines.push(line('halt', `HALTED ${Math.min(total, done + 1)}/${total} mask=OFF press P to fix`, 'bad'));
    lines.push(line('why', 'assistant-only loss masking was dropped upstream (trl==0.20.0)'));
  }

  if (state.run === 'complete') {
    const receipt = state.receipt || { nodes: done, elapsedMs: state.elapsedMs, unevaluated: state.unevaluated };
    lines.push(line('done', `run complete ${receipt.nodes}/${total}, ${seconds(receipt.elapsedMs)}`, 'good'));
    if (state.patched) lines.push(line('patched', 'mask=ON — assistant-only loss restored'));
  }

  for (const key of state.cut || []) {
    lines.push(line(`cut-${key}`, `CUT ${key}`, 'bad'));
  }

  if (state.unevaluated && (state.run === 'complete' || state.run === 'running')) {
    lines.push(h('p', {
      key: 'unevaluated',
      className: 'runlog-warn',
      style: {
        margin: '6px 0 0',
        paddingTop: '6px',
        borderTop: '1px solid var(--red)',
        color: 'var(--red)',
      },
    }, UNEVALUATED));
  }

  return h('div', {
    className: 'runlog',
    role: 'log',
    'aria-label': 'Run log',
    'data-run': state.run,
  }, lines);
}

export default memo(RunLog);
