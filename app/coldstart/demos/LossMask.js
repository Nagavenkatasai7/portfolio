'use client';
// app/coldstart/demos/LossMask.js
// The demo inside loss-mask.patch (spec §7).
//
// TRL v0.20.0 silently stopped masking the prompt, so loss was computed over every
// token in the conversation instead of the assistant's completion alone. The chips
// below are a fixed synthetic exchange: before the fix every chip is lit, which is
// the bug — the model is being rewarded for copying the question back. After `P`
// only the 41 completion tokens count.
//
// The sparkline is labelled "illustrative — shape only" because it is: the numbers
// come from lib/coldstart/lossmask.js, not from a training run.
//
// createElement rather than JSX so `node --test` can server-render this file.
// Layout is inline because coldstart.css belongs to another task; the values are the
// shared custom properties, so the demo stays in the sheet's palette.

import { createElement as h, memo } from 'react';
import { DEMO_TOKENS, maskLoss } from '../../../lib/coldstart/lossmask.js';

const SPARK_W = 288;
const SPARK_H = 30;
const LOSS_MAX = 2.5;

const wrap = { fontFamily: 'var(--mono)', fontSize: '10px', lineHeight: 1.5 };

const strip = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2px',
  margin: '0 0 8px',
  padding: '6px',
  border: '1px solid var(--rule)',
  background: 'var(--paper)',
};

function chipStyle(p) {
  return {
    padding: '1px 3px',
    border: '1px solid transparent',
    borderColor: p.contributes ? 'var(--amber)' : 'transparent',
    background: p.contributes ? 'rgba(197, 138, 26, 0.14)' : 'transparent',
    color: p.contributes ? 'var(--ink)' : 'var(--ink-3)',
    whiteSpace: 'pre',
  };
}

/** A polyline over the per-token losses. Zeroes sit on the baseline. */
function spark(perToken) {
  const n = perToken.length || 1;
  const points = perToken
    .map((p, i) => {
      const x = (i / Math.max(1, n - 1)) * SPARK_W;
      const y = SPARK_H - Math.min(1, p.loss / LOSS_MAX) * SPARK_H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return h('svg', {
    key: 'spark',
    className: 'lossmask-spark',
    viewBox: `0 0 ${SPARK_W} ${SPARK_H}`,
    width: '100%',
    height: SPARK_H,
    role: 'img',
    'aria-label': 'Illustrative per-token loss, shape only',
    style: { display: 'block', maxWidth: '100%', overflow: 'visible' },
  }, [
    h('line', {
      key: 'base',
      x1: 0,
      y1: SPARK_H,
      x2: SPARK_W,
      y2: SPARK_H,
      stroke: 'var(--rule)',
      strokeWidth: 1,
    }),
    h('polyline', {
      key: 'line',
      points,
      fill: 'none',
      stroke: 'var(--amber)',
      strokeWidth: 1,
      vectorEffect: 'non-scaling-stroke',
    }),
  ]);
}

/**
 * @param {{ patched?: boolean }} props
 *   patched:false is the upstream regression (every token contributes);
 *   patched:true is the restored assistant-only mask.
 */
function LossMask({ patched = false }) {
  const { contributing, perToken } = maskLoss(DEMO_TOKENS, { assistantOnly: patched });
  const total = perToken.length;

  return h('div', { className: 'lossmask', style: wrap, 'data-patched': patched ? 'true' : 'false' }, [
    // One text run, not a wrapped number: the counter reads as a single sentence to
    // a screen reader and copies out of the page intact.
    h('p', {
      key: 'count',
      className: 'lossmask-count',
      style: { margin: '0 0 6px', color: 'var(--ink)', fontWeight: 500 },
    }, `tokens contributing loss: ${contributing} of ${total} — ${
      patched ? 'assistant only' : 'the prompt is in there too'
    }`),

    // aria-label is prohibited on role=paragraph, so the description is a real
    // (visually hidden) sentence ahead of the strip instead of an attribute on it.
    h('p', {
      key: 'strip-desc',
      className: 'sr-only',
    }, patched
      ? 'Synthetic conversation; only the assistant tokens are lit.'
      : 'Synthetic conversation; every token is lit, prompt included.'),

    h('p', {
      key: 'strip',
      className: 'lossmask-strip',
      style: strip,
    }, perToken.map((p, i) => h('span', {
      key: i,
      className: 'tok',
      'data-role': p.role,
      'data-contributes': p.contributes ? 'true' : 'false',
      style: chipStyle(p),
    }, p.t))),

    spark(perToken),

    h('p', {
      key: 'illus',
      className: 'lossmask-note',
      style: { margin: '2px 0 6px', color: 'var(--ink-3)' },
    }, 'illustrative — shape only'),

    patched
      ? null
      : h('p', {
        key: 'hint',
        className: 'lossmask-hint',
        style: { margin: '0 0 6px', color: 'var(--red)' },
      }, [h('kbd', { key: 'k' }, 'P'), " apply Naga's fix"]),

    h('p', {
      key: 'caption',
      className: 'lossmask-caption',
      style: { margin: 0, color: 'var(--ink-2)' },
    }, 'upstream: trl==0.20.0'),
  ]);
}

export default memo(LossMask);
