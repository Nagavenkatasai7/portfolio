'use client';
// app/coldstart/Node.js
// One node card on the schematic sheet.
//
// The card is a fixed 320x190 box positioned at node.pos inside #world. Detail is
// CSS-driven: #world carries data-lod and the .lod1 / .lod2 blocks are revealed at
// threshold crossings, so zooming never re-renders React. An expanded card overrides
// the level and grows to fit its content.
//
// Written with createElement rather than JSX so `node --test` can server-render this
// file without a build step — the repo has no JSX transform outside Next. Nothing
// here touches window or document at module scope.

import { createElement as h, memo } from 'react';
import LossMask from './demos/LossMask.js';
import ChartX from './demos/ChartX.js';
import SchemaCheck from './demos/SchemaCheck.js';

const INTERACTIVE = 'a,button,input,textarea,select,label,summary';

// lod[2].demo names one of these. A card only mounts its demo once it is actually
// legible — expanded, or zoomed past the LOD 2 threshold — so a stage full of closed
// cards costs nothing to render.
const DEMOS = { LossMask, ChartX, SchemaCheck };

function linkProps(href) {
  return /^https?:\/\//i.test(String(href))
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
}

function pad2(n) {
  return String(n + 1).padStart(2, '0');
}

/**
 * The expand affordance is a real <button> inside the heading, not the <article>.
 * aria-expanded is not allowed on role=article, and a tabbable article with a
 * hand-rolled Enter/Space handler announces as an article rather than as
 * something operable — so the card reads "chartx.eval, button, collapsed".
 */
function header(node, index, titleId, detailId, expanded, onToggle) {
  return h('header', { key: 'head', className: 'node-head' }, [
    index === null
      ? null
      : h('span', { key: 'index', className: 'node-index', 'aria-hidden': 'true' }, pad2(index)),
    h('h2', { key: 'title', className: 'node-title', id: titleId },
      h('button', {
        type: 'button',
        className: 'node-toggle',
        'aria-expanded': expanded,
        'aria-controls': detailId,
        onClick: onToggle,
      }, node.title)),
    h('span', { key: 'lane', className: 'node-lane', 'aria-hidden': 'true' }, node.lane),
    h('span', { key: 'mark', className: 'node-mark', 'aria-hidden': 'true' }),
  ]);
}

function metricList(metrics) {
  if (!metrics.length) return null;
  return h('dl', { key: 'metrics', className: 'metrics' }, metrics.map((m) =>
    h('div', { key: m.label, className: 'metric' }, [
      h('dt', { key: 'label' }, m.label),
      h('dd', { key: 'value' }, [
        h('span', { key: 'num', className: 'num' }, m.value),
        h('span', { key: 'prov', className: 'prov', 'data-prov': m.provenance }, m.provenance),
      ]),
    ])));
}

function appGrid(apps) {
  return h('ul', { key: 'apps', className: 'apps' }, apps.map((a) =>
    h('li', { key: a.href }, h('a', { href: a.href, ...linkProps(a.href) }, [
      h('img', {
        key: 'img',
        src: a.thumb,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        width: 120,
        height: 72,
      }),
      h('span', { key: 'name' }, a.name),
    ]))));
}

function linkList(links) {
  if (!links.length) return null;
  return h('ul', { key: 'links', className: 'links' }, links.map((l) =>
    h('li', { key: l.href }, h('a', { href: l.href, ...linkProps(l.href) }, l.label))));
}

function Node({
  node,
  state = 'idle',
  expanded = false,
  lod = 1,
  onToggle = () => {},
  onFocus = () => {},
  demo = null,
  index = null,
  dimmed = false,
  patched = false,
  running = false,
}) {
  const id = node.id;
  const titleId = `${id}-title`;
  const detailId = `${id}-detail`;
  const apps = Array.isArray(node.apps) ? node.apps : null;
  const source = node.lod[2].source;

  // An explicit `demo` element wins (that is how ask-naga gets its body); otherwise
  // the card builds the demo its data names.
  const Demo = DEMOS[node.lod[2].demo] || null;
  const body = demo || (Demo && (expanded || lod === 2) ? h(Demo, { patched, running }) : null);

  function toggle() {
    onToggle(id);
  }

  function handleClick(event) {
    // Links and buttons inside the card do their own thing — the title button
    // included, which is the keyboard-operable copy of this affordance.
    if (event.target.closest && event.target.closest(INTERACTIVE)) return;
    // While open, only the header toggles, so prose stays selectable.
    if (expanded && !(event.target.closest && event.target.closest('.node-head'))) return;
    onToggle(id);
  }

  const detail = h('div', { key: 'lod2', id: detailId, className: 'lod2' }, [
    ...(node.lod[2].body || []).map((p, i) => h('p', { key: `p${i}`, className: 'prose' }, p)),
    body ? h('div', { key: 'demo', className: 'demo' }, body) : null,
    metricList(node.metrics),
    node.thumb
      ? h('img', {
        key: 'thumb',
        className: 'thumb',
        src: node.thumb,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        width: 320,
        height: 160,
      })
      : null,
    apps ? appGrid(apps) : linkList(node.links),
    source
      ? h('p', { key: 'source', className: 'source' }, [
        h('span', { key: 'label', className: 'source-label' }, 'source'),
        ' ',
        h('code', { key: 'path' }, source),
      ])
      : null,
  ]);

  return h('article', {
    id: `node-${id}`,
    className: 'node',
    'data-lane': node.lane,
    'data-state': state,
    'data-kind': node.kind,
    'data-expanded': expanded ? 'true' : 'false',
    'data-lod': lod,
    'data-demo': node.lod[2].demo || undefined,
    'data-dim': dimmed ? 'true' : undefined,
    'aria-labelledby': titleId,
    // Out of the tab order — the title button in this card is the tab stop — but
    // still programmatically focusable, so Esc and the camera can return here.
    tabIndex: -1,
    style: {
      '--x': `${node.pos.x}px`,
      '--y': `${node.pos.y}px`,
      '--w': `${node.size.w}px`,
      '--h': `${node.size.h}px`,
    },
    onClick: handleClick,
    onFocus: () => onFocus(id),
  }, [
    header(node, index, titleId, detailId, expanded, toggle),
    h('p', { key: 'sr', className: 'sr-only' }, `${node.human}. ${node.lane} lane. Status: ${state}.`),
    h('p', { key: 'line', className: 'node-line' }, node.lod[0]),
    h('div', { key: 'lod1', className: 'lod1' },
      h('ul', { className: 'bul' }, node.lod[1].map((b, i) => h('li', { key: i }, b)))),
    detail,
  ]);
}

export default memo(Node);
