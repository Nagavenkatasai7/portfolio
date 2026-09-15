'use client';
// app/coldstart/Wires.js
// The edges of the graph, drawn as cubic beziers between port anchors.
//
// The SVG is not transformed here — its parent (.wires-layer in Stage) carries the
// camera transform, so this component never re-renders while panning or zooming.
// Strokes use vector-effect: non-scaling-stroke, so hairlines stay hairlines at
// every scale.
//
// Packets: the one active edge gets a dot animated along the path with the Web
// Animations API. Nothing animates when activeEdge is null (the P0 default) or when
// the visitor has asked for reduced motion.
//
// createElement rather than JSX, so `node --test` can server-render this file.

import { createElement as h, memo, useEffect, useMemo, useRef } from 'react';
// One definition of the edge key, in the scheduler that owns `cut`. Two copies of
// this format would let `data-edge` attributes and cut sets drift apart silently.
import { edgeKey } from '../../lib/coldstart/scheduler.js';

const PORT = 5;
const PACKET_MS = 900;
const CUT = 5;
const HIT = 16;

export { edgeKey };

/**
 * Port anchors for an edge. Lanes read left to right, so a forward edge leaves the
 * right face and enters the left face. An edge inside one column (cuda.kernel feeding
 * llm-forge) routes vertically instead, off the top or bottom face.
 */
function geometry(from, to) {
  if (to.pos.x > from.pos.x) {
    const a = { x: from.pos.x + from.size.w, y: from.pos.y + from.size.h / 2 };
    const b = { x: to.pos.x, y: to.pos.y + to.size.h / 2 };
    // Long fan-ins (five DATA cards into llm-forge) need a wider control arm, or the
    // curve leaves the port almost vertically and bows back across its neighbours.
    const dx = Math.max(60, (b.x - a.x) * 0.45, Math.min(150, Math.abs(b.y - a.y) * 0.32));
    return { a, b, d: `M${a.x} ${a.y}C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}` };
  }

  const upward = to.pos.y < from.pos.y;
  const a = { x: from.pos.x + from.size.w / 2, y: upward ? from.pos.y : from.pos.y + from.size.h };
  const b = { x: to.pos.x + to.size.w / 2, y: upward ? to.pos.y + to.size.h : to.pos.y };
  const dy = Math.max(48, Math.abs(a.y - b.y) * 0.4) * (upward ? -1 : 1);
  return { a, b, d: `M${a.x} ${a.y}C${a.x} ${a.y + dy} ${b.x} ${b.y - dy} ${b.x} ${b.y}` };
}

function edgeState(e, nodeStates) {
  if (!nodeStates) return 'idle';
  const to = nodeStates[e.to];
  const from = nodeStates[e.from];
  if (to === 'running') return 'active';
  if (to === 'failed') return 'failed';
  if (from === 'done' && to === 'done') return 'done';
  if (from === 'done') return 'ready';
  return 'idle';
}

/**
 * Both bezier families here are symmetric in their control arms, so the point at
 * t = 0.5 is simply the midpoint of the two ports — that is where the cut mark and
 * the click target sit.
 */
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The two red strokes that make a cut visible without relying on colour alone. */
function cutMark(e) {
  const m = midpoint(e.a, e.b);
  return h('g', { key: 'cut', className: 'cut-mark' }, [
    h('line', {
      key: '1',
      x1: m.x - CUT, y1: m.y - CUT, x2: m.x + CUT, y2: m.y + CUT,
      stroke: 'var(--red)', strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke',
    }),
    h('line', {
      key: '2',
      x1: m.x - CUT, y1: m.y + CUT, x2: m.x + CUT, y2: m.y - CUT,
      stroke: 'var(--red)', strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke',
    }),
  ]);
}

function Wires({
  graph,
  cut = [],
  activeEdge = null,
  focusedEdge = null,
  nodeStates = null,
  onCut = null,
}) {
  const packetRef = useRef(null);
  const cutSet = useMemo(() => new Set(cut), [cut]);

  const { edges, width, height } = useMemo(() => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    let w = 0;
    let hgt = 0;
    for (const n of graph.nodes) {
      w = Math.max(w, n.pos.x + n.size.w);
      hgt = Math.max(hgt, n.pos.y + n.size.h);
    }
    const list = [];
    for (const e of graph.edges) {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      if (!from || !to) continue;
      list.push({ ...e, key: edgeKey(e), ...geometry(from, to) });
    }
    return { edges: list, width: w + 80, height: hgt + 80 };
  }, [graph]);

  const active = useMemo(
    () => (activeEdge ? edges.find((e) => e.key === activeEdge) || null : null),
    [edges, activeEdge],
  );

  // Packet animation: only while an edge is active and motion is welcome.
  useEffect(() => {
    const el = packetRef.current;
    if (!el || !active || typeof el.animate !== 'function') return undefined;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;

    el.style.offsetPath = `path("${active.d}")`;
    el.style.offsetRotate = '0deg';
    const anim = el.animate(
      [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
      { duration: PACKET_MS, iterations: Infinity, easing: 'linear' },
    );
    return () => anim.cancel();
  }, [active]);

  const wires = edges.map((e) => {
    const isCut = cutSet.has(e.key);
    return h('g', {
      key: e.key,
      className: 'wire',
      'data-edge': e.key,
      'data-lane': e.lane,
      'data-state': isCut ? 'cut' : edgeState(e, nodeStates),
      'data-focus': e.key === focusedEdge ? 'true' : undefined,
      onClick: onCut ? () => onCut(e.key) : undefined,
    }, [
      h('path', { key: 'line', className: 'wire-line', d: e.d }),
      h('rect', { key: 'a', className: 'port', x: e.a.x - PORT / 2, y: e.a.y - PORT / 2, width: PORT, height: PORT }),
      h('rect', { key: 'b', className: 'port', x: e.b.x - PORT / 2, y: e.b.y - PORT / 2, width: PORT, height: PORT }),
      isCut ? cutMark(e) : null,
      // A fat invisible stroke, so a wire can be hit with a mouse without thickening
      // the drawing. The layer above is aria-hidden, so this is a convenience only:
      // keyboard users cut the wire into the focused card with X.
      onCut
        ? h('path', {
          key: 'hit',
          className: 'wire-hit',
          d: e.d,
          fill: 'none',
          stroke: 'transparent',
          strokeWidth: HIT,
          vectorEffect: 'non-scaling-stroke',
          style: { pointerEvents: 'stroke', cursor: 'pointer' },
        })
        : null,
    ]);
  });

  return h('svg', {
    className: 'wires',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    'aria-hidden': 'true',
    focusable: 'false',
  }, [
    h('g', { key: 'set', className: 'wire-set' }, wires),
    active ? h('circle', { key: 'packet', ref: packetRef, className: 'packet', cx: 0, cy: 0, r: 3 }) : null,
  ]);
}

export default memo(Wires);
