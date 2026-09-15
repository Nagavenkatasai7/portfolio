'use client';
// app/coldstart/Stage.js
// Layer stack and furniture for the COLDSTART stage.
//
// Z order (spec §5): DotGrid canvas 0 -> Wires SVG 1 -> #world DOM 2 -> RunLog 3 ->
// identity title block 4 -> escape pill 5, with the skip link above everything. Only
// #world and .wires-layer carry the camera transform; nothing else on the page moves.
//
// The skip link and the escape pill are the first two things in the DOM, so the first
// two stops of a Tab are "plain text résumé" and "Résumé PDF" — a recruiter never has
// to understand the graph to get what they came for.
//
// createElement rather than JSX, so `node --test` can server-render this file. Browser
// APIs are reached inside effects only.

import { createElement as h, Fragment, useEffect, useRef, useState } from 'react';

const KEY_MAP = [
  ['Tab', 'move to the next node'],
  ['Shift + Tab', 'move back'],
  ['Enter', 'open the focused node'],
  ['Esc', 'close it'],
  ['R', 'run the graph'],
  ['P', 'apply the fix, once the run has halted'],
  ['N', 'advance one node'],
  ['X', 'cut the focused wire'],
  ['/', 'ask about this work'],
  ['?', 'this list'],
  ['0', 'reset the view'],
  ['Arrows', 'pan the view'],
];

// Under prefers-reduced-motion the run does not animate itself: R starts it and
// parks on the first node, and every further node waits for N. The affordance has
// to say so, or the visitor presses R once and thinks the page is broken.
const REDUCED_KEY_MAP = [
  ['Tab', 'move to the next node'],
  ['Shift + Tab', 'move back'],
  ['Enter', 'open the focused node'],
  ['Esc', 'close it'],
  ['R', 'start the run (it waits on the first node)'],
  ['N', 'step to the next node'],
  ['P', 'apply the fix, once the run has halted'],
  ['X', 'cut the focused wire'],
  ['/', 'ask about this work'],
  ['?', 'this list'],
  ['0', 'reset the view'],
  ['Arrows', 'pan the view'],
];

function camTransform(cam) {
  return `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.s})`;
}

function isHttp(href) {
  return /^https?:/i.test(String(href));
}

/* ------------------------------------------------------------------ furniture */

export function EscapePill({ onContact = () => {} }) {
  return h('nav', { className: 'escape', 'aria-label': 'Quick actions' }, [
    h('a', { key: 'pdf', href: '/Naga_Chennu_Resume.pdf' }, 'Résumé PDF'),
    h('button', {
      key: 'contact',
      type: 'button',
      'aria-haspopup': 'dialog',
      onClick: onContact,
    }, 'Contact'),
    h('a', { key: 'plain', href: '/plain' }, 'Plain text'),
  ]);
}

export function IdentityLine({ hint = true, reduced = false }) {
  return h('div', { className: 'titleblock' }, [
    h('p', { key: 'id', className: 'identity' },
      'Naga Venkata Sai Chennu — AI Systems Engineer — Fairfax, VA — available now'),
    hint
      ? h('p', { key: 'keys', className: 'keys' }, reduced
        ? [
          h('kbd', { key: 'r' }, 'R'), ' start ',
          h('kbd', { key: 'n' }, 'N'), ' step ',
          h('kbd', { key: 'e' }, 'Enter'), ' open ',
          h('kbd', { key: 'h' }, '?'), ' keys',
        ]
        : [
          h('kbd', { key: 'r' }, 'R'), ' run ',
          h('kbd', { key: 't' }, 'Tab'), ' move ',
          h('kbd', { key: 'e' }, 'Enter'), ' open ',
          h('kbd', { key: 'h' }, '?'), ' keys',
        ])
      : null,
  ]);
}

/** Narration target. Mounted empty from first paint so later updates are announced. */
export function LiveRegion({ message = '' }) {
  return h('p', {
    className: 'sr-only live',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  }, message);
}

/* --------------------------------------------------------------------- sheets */

function useDialog(open, onClose) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showModal !== 'function') return undefined;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    return undefined;
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const handle = () => onClose();
    el.addEventListener('close', handle);
    return () => el.removeEventListener('close', handle);
  }, [onClose]);

  return ref;
}

function displayHref(href) {
  return String(href).replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function sheetHead(id, title, onClose, closeLabel) {
  return h('div', { key: 'head', className: 'sheet-head' }, [
    h('h2', { key: 'h', id }, title),
    h('button', {
      key: 'x',
      type: 'button',
      className: 'sheet-close',
      onClick: onClose,
      'aria-label': closeLabel,
    }, 'esc'),
  ]);
}

export function ContactSheet({ open = false, links = [], onClose = () => {} }) {
  const ref = useDialog(open, onClose);
  const [status, setStatus] = useState('');

  async function copy(link) {
    const text = String(link.href).replace(/^mailto:/, '');
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${link.label.toLowerCase()}`);
    } catch {
      setStatus('Copy is blocked here — select the text and copy it manually.');
    }
  }

  return h('dialog', { className: 'sheet', ref, 'aria-labelledby': 'contact-title' }, [
    sheetHead('contact-title', 'Contact', onClose, 'Close contact'),
    h('ul', { key: 'list', className: 'contact-list' }, links.map((link) =>
      h('li', { key: link.href }, [
        h('span', { key: 'l', className: 'contact-label' }, link.label),
        h('a', {
          key: 'v',
          className: 'contact-value',
          href: link.href,
          ...(isHttp(link.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        }, displayHref(link.href)),
        h('button', { key: 'c', type: 'button', className: 'copy', onClick: () => copy(link) }, [
          'Copy',
          h('span', { key: 's', className: 'sr-only' }, ` ${link.label}`),
        ]),
      ]))),
    h('p', { key: 'foot', className: 'sheet-foot', role: 'status', 'aria-live': 'polite' }, status),
  ]);
}

export function HelpSheet({ open = false, reduced = false, onClose = () => {} }) {
  const ref = useDialog(open, onClose);
  return h('dialog', { className: 'sheet', ref, 'aria-labelledby': 'help-title' }, [
    sheetHead('help-title', 'Keys', onClose, 'Close keys'),
    h('dl', { key: 'map', className: 'keymap' }, (reduced ? REDUCED_KEY_MAP : KEY_MAP).map(([key, what]) =>
      h('div', { key, className: 'keyrow' }, [
        h('dt', { key: 'k' }, h('kbd', null, key)),
        h('dd', { key: 'd' }, what),
      ]))),
    h('p', { key: 'foot', className: 'sheet-foot' }, [
      'Drag to pan, scroll to zoom. Everything on the graph is also on the ',
      h('a', { key: 'plain', href: '/plain' }, 'plain text page'),
      '.',
    ]),
  ]);
}

/* ---------------------------------------------------------------- phone lanes */

function LaneBar({ lanes, activeLane, laneStates, onSelectLane }) {
  if (!lanes.length) return null;
  return h('nav', { className: 'lanes', 'aria-label': 'Lanes' }, lanes.map((lane) =>
    h('button', {
      key: lane,
      type: 'button',
      className: 'lane-puck',
      'data-state': laneStates[lane] || 'idle',
      'aria-pressed': lane === activeLane,
      onClick: () => onSelectLane(lane),
    }, [
      h('span', { key: 'dot', className: 'lane-dot', 'aria-hidden': 'true' }),
      lane,
    ])));
}

/* ---------------------------------------------------------------------- stage */

export default function Stage({
  cam,
  lod = 1,
  dragging = false,
  children,
  escape = null,
  identity = null,
  runLog = null,
  live = null,
  dialogs = null,
  background = null,
  wires = null,
  lanes = [],
  activeLane = null,
  laneStates = {},
  onSelectLane = () => {},
  stageRef = null,
  worldRef = null,
  wiresRef = null,
}) {
  const transform = camTransform(cam);

  return h('div', {
    className: 'stage',
    ref: stageRef,
    'data-lod': lod,
    'data-drag': dragging ? 'true' : undefined,
  }, [
    h('a', { key: 'skip', className: 'skip', href: '/plain' }, 'Skip the graph — plain text résumé'),
    escape ? h(Fragment, { key: 'escape' }, escape) : null,
    h('h1', { key: 'h1', className: 'sr-only' },
      'Naga Venkata Sai Chennu, AI Systems Engineer — his work as a runnable graph'),

    background ? h(Fragment, { key: 'bg' }, background) : null,
    // worldRef and wiresRef are the two layers the camera writes to directly
    // during a gesture; the style below is what React renders between gestures.
    h('div', {
      key: 'wires',
      className: 'wires-layer',
      ref: wiresRef,
      style: { transform },
      'aria-hidden': 'true',
    }, wires),

    h(LaneBar, {
      key: 'lanes',
      lanes,
      activeLane,
      laneStates,
      onSelectLane,
    }),

    h('div', { key: 'scroll', className: 'worldscroll' },
      h('div', {
        id: 'world',
        className: 'world',
        ref: worldRef,
        'data-lod': lod,
        'data-lane': activeLane || undefined,
        style: { transform },
      }, children)),

    identity ? h(Fragment, { key: 'identity' }, identity) : null,
    runLog ? h(Fragment, { key: 'runlog' }, runLog) : null,
    live ? h(Fragment, { key: 'live' }, live) : null,
    dialogs ? h(Fragment, { key: 'dialogs' }, dialogs) : null,
  ]);
}
