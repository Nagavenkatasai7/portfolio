'use client';
// app/coldstart/demos/ChartX.js
// The demo inside chartx.eval (spec §7).
//
// Per-type accuracy bars from data/chartx.json, then the one result that mattered:
// treemaps scored 51.6% until the labels themselves were checked and rebuilt, after
// which the same model scored 97.7%. The benchmark was the flaw, not the model.
//
// Provenance is on the face of it. The résumé's p = 0.0003 is tagged `resume`; if the
// data file ever carries the discordant pair counts, McNemar's exact test is run here
// in the browser and the same number is tagged `computed`.
//
// createElement rather than JSX so `node --test` can server-render this file.

import { createElement as h, memo } from 'react';
import { mcnemarExact } from '../../../lib/coldstart/stats.js';
import CHARTX from '../../../data/chartx.json' with { type: 'json' };

const wrap = { fontFamily: 'var(--mono)', fontSize: '10px', lineHeight: 1.5 };

const track = {
  position: 'relative',
  height: '9px',
  border: '1px solid var(--rule)',
  background: 'var(--paper)',
  overflow: 'hidden',
};

/**
 * The résumé reports whole percents for the position-encoded range and one
 * decimal for the treemap numbers; rendering 0.91 as "91.0%" would invent a
 * digit of precision the source does not have.
 */
function pct(x) {
  const n = Number(x) * 100;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

/**
 * The bar fills with a transform, not a width: `width` is a layout property, and
 * an inline `transition` would beat the reduced-motion rule in coldstart.css.
 * The transition lives in `.chartx-fill` there, where the media query can reach it.
 */
function fill(accuracy, running, colour) {
  return h('span', {
    key: 'fill',
    className: 'chartx-fill',
    'aria-hidden': 'true',
    style: {
      display: 'block',
      height: '100%',
      width: '100%',
      transformOrigin: 'left',
      transform: `scaleX(${running ? 0 : Number(accuracy) || 0})`,
      background: colour,
    },
  });
}

function bar(name, accuracy, running, colour, provenance) {
  return h('li', {
    key: name,
    className: 'chartx-bar',
    style: { display: 'grid', gridTemplateColumns: '1fr 74px', gap: '6px', alignItems: 'center', margin: '0 0 4px' },
  }, [
    h('span', { key: 'label', style: { display: 'block' } }, [
      h('span', { key: 'n', style: { display: 'block', color: 'var(--ink-2)' } }, name),
      h('span', { key: 't', style: track }, fill(accuracy, running, colour)),
    ]),
    // Spec §2.5: every rendered number carries its provenance, the big ones most
    // of all.
    h('span', { key: 'v', style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
      h('span', { key: 'n', className: 'num' }, pct(accuracy)),
      provChip(provenance),
    ]),
  ]);
}

function provChip(provenance) {
  return h('span', {
    key: 'prov',
    className: 'prov',
    'data-prov': provenance,
    style: {
      marginLeft: '6px',
      padding: '0 4px',
      border: '1px solid var(--rule)',
      color: 'var(--ink-2)',
      fontSize: '9px',
      letterSpacing: '0.08em',
    },
  }, provenance);
}

/**
 * @param {{ data?: object, running?: boolean }} props
 *   `running` holds the bars at zero width so they fill as the node runs.
 */
function ChartX({ data = CHARTX, running = false }) {
  const types = Array.isArray(data.types) ? data.types : [];
  const treemap = data.treemap || {};
  const discordant = treemap.discordant;
  const barProv = data.provenance || 'resume';

  // A discordant pair count is the only thing that lets the browser recompute the
  // test honestly; without it the résumé's number stands, labelled as such.
  const computed = discordant
    && typeof discordant.b === 'number'
    && typeof discordant.c === 'number';
  const p = computed ? mcnemarExact(discordant.b, discordant.c) : treemap.p;
  const pText = computed
    ? `p = ${p < 0.0001 ? p.toExponential(1) : p.toFixed(4)}`
    : `p = ${treemap.p}`;

  return h('div', { className: 'chartx', style: wrap }, [
    h('ul', {
      key: 'bars',
      className: 'chartx-bars',
      style: { listStyle: 'none', margin: '0 0 8px', padding: 0 },
    }, types.map((t) => bar(t.name, t.accuracy, running, 'var(--blue)', barProv))),

    h('div', {
      key: 'relabel',
      className: 'chartx-relabel',
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        padding: '6px',
        border: '1px solid var(--rule)',
        background: 'var(--paper)',
      },
    }, [
      h('p', { key: 'before', style: { margin: 0 } }, [
        h('span', { key: 'l', style: { display: 'block', color: 'var(--ink-2)' } }, 'treemap, as published'),
        h('span', { key: 't', style: track }, fill(treemap.before ? treemap.before.accuracy : 0, running, 'var(--red)')),
        h('span', { key: 'v', className: 'num' }, pct(treemap.before ? treemap.before.accuracy : 0)),
        provChip(barProv),
      ]),
      h('p', { key: 'after', style: { margin: 0 } }, [
        h('span', { key: 'l', style: { display: 'block', color: 'var(--ink-2)' } }, 'treemap, re-rendered with value labels'),
        h('span', { key: 't', style: track }, fill(treemap.after ? treemap.after.accuracy : 0, running, 'var(--green)')),
        h('span', { key: 'v', className: 'num' }, pct(treemap.after ? treemap.after.accuracy : 0)),
        provChip(barProv),
      ]),
    ]),

    h('p', {
      key: 'p',
      className: 'chartx-p',
      style: { margin: '6px 0 4px' },
    }, ["McNemar's exact test: ", h('span', { key: 'v', className: 'num' }, pText), provChip(computed ? 'computed' : 'resume')]),

    h('p', {
      key: 'badge',
      className: 'chartx-badge',
      style: { margin: 0, color: 'var(--ink)', borderTop: '1px solid var(--rule)', paddingTop: '4px' },
    }, 'the benchmark was the flaw, not the model'),
  ]);
}

export default memo(ChartX);
