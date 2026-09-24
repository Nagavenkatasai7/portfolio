'use client';

import { useEffect, useRef } from 'react';

// A drifting neural-network field: nodes connected by edges, with "tokens"
// (small bright dots) travelling along the edges. Nodes lean away from the
// cursor. Pauses off-screen and in background tabs; draws a single static
// frame when the visitor prefers reduced motion.
export default function HeroCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COLORS = ['139,92,246', '34,211,238', '163,230,53'];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let nodes = [];
    let pulses = [];
    let raf = 0;
    let visible = true;
    const mouse = { x: -9999, y: -9999 };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, Math.max(36, (w * h) / 14000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.8,
      }));
      pulses = [];
    }

    const LINK = () => Math.min(170, Math.max(110, w / 9));

    function colorAt(x) {
      const t = Math.max(0, Math.min(0.999, x / Math.max(1, w)));
      return COLORS[Math.floor(t * COLORS.length)];
    }

    function step() {
      const link = LINK();
      for (const n of nodes) {
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 140 * 140 && d2 > 1) {
          const f = (1 - Math.sqrt(d2) / 140) * 0.6;
          n.vx += (dx / Math.sqrt(d2)) * f * 0.08;
          n.vy += (dy / Math.sqrt(d2)) * f * 0.08;
        }
        n.vx *= 0.99;
        n.vy *= 0.99;
        const speed = Math.hypot(n.vx, n.vy);
        if (speed < 0.12) {
          n.vx += (Math.random() - 0.5) * 0.04;
          n.vy += (Math.random() - 0.5) * 0.04;
        }
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;
      }
      if (pulses.length < 14 && Math.random() < 0.08) {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        let best = null;
        let bestD = link;
        for (const b of nodes) {
          if (b === a) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < bestD && Math.random() < 0.5) {
            best = b;
            bestD = d;
          }
        }
        if (best) pulses.push({ a, b: best, t: 0, speed: 0.012 + Math.random() * 0.018 });
      }
      pulses = pulses.filter((p) => (p.t += p.speed) < 1);
    }

    function draw() {
      const link = LINK();
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            ctx.strokeStyle = `rgba(${colorAt((a.x + b.x) / 2)},${(1 - d / link) * 0.22})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${colorAt(n.x)},0.8)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of pulses) {
        const x = p.a.x + (p.b.x - p.a.x) * p.t;
        const y = p.a.y + (p.b.y - p.a.y) * p.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, `rgba(${colorAt(x)},0.95)`);
        g.addColorStop(1, `rgba(${colorAt(x)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop() {
      if (visible && !document.hidden) {
        step();
        draw();
      }
      raf = requestAnimationFrame(loop);
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }
    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    if (reduced) {
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <canvas ref={ref} className="hero-canvas" aria-hidden="true" />;
}
