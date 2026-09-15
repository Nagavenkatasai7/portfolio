'use client';
// app/coldstart/DotGrid.js
// The sheet the graph is printed on: a 24px dot grid with a heavier dot every fifth
// cell, drawn once into a repeating pattern tile.
//
// Idle cost is zero — no timers run unless `active` is true (a run is in flight, or
// the visitor is dragging). The loop stops when the tab is hidden and never starts
// at all under prefers-reduced-motion.

import { createElement as h, useEffect, useRef } from 'react';

const STEP = 24;
const CELLS = 5;
const MINOR = 'rgba(26, 29, 38, 0.075)';
const MAJOR = 'rgba(26, 29, 38, 0.20)';

function buildTile(dpr) {
  const tile = document.createElement('canvas');
  tile.width = STEP * CELLS * dpr;
  tile.height = STEP * CELLS * dpr;
  const g = tile.getContext('2d');
  if (!g) return tile;
  for (let i = 0; i < CELLS; i += 1) {
    for (let j = 0; j < CELLS; j += 1) {
      const major = i === 0 && j === 0;
      g.fillStyle = major ? MAJOR : MINOR;
      const s = (major ? 2 : 1) * dpr;
      g.fillRect(i * STEP * dpr, j * STEP * dpr, s, s);
    }
  }
  return tile;
}

export default function DotGrid({ active = false }) {
  const canvasRef = useRef(null);
  const controlRef = useRef(null);
  const activeRef = useRef(false);

  useEffect(() => { activeRef.current = active; }, [active]);

  // Set up the canvas once: size it to the stage, draw the static sheet.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pattern = ctx.createPattern(buildTile(dpr), 'repeat');
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let w = 0;
    let h = 0;

    function paint(px, py) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!pattern) return;
      ctx.translate(px, py);
      ctx.fillStyle = pattern;
      ctx.fillRect(-px, -py, w, h);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      paint(0, 0);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      paint(0, 0);
    }

    function frame(t) {
      // Barely-there settle, so the sheet reads as paper rather than a screen.
      paint(Math.sin(t / 3800) * 1.5 * dpr, Math.cos(t / 5200) * 1.5 * dpr);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduce || raf || document.hidden) return;
      raf = requestAnimationFrame(frame);
    }

    // visibilitychange fires in both directions. Registering `stop` for it meant
    // coming back to the tab also stopped the grid, and nothing restarted it for
    // the rest of the run.
    function onVisibility() {
      if (document.hidden) stop();
      else if (activeRef.current) start();
    }

    controlRef.current = { start, stop };
    resize();

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controlRef.current = null;
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return undefined;
    if (active) control.start();
    else control.stop();
    return undefined;
  }, [active]);

  return h('canvas', { ref: canvasRef, className: 'dotgrid', 'aria-hidden': 'true' });
}
