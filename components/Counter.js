'use client';

import { useEffect, useRef, useState } from 'react';

// Counts up from 0 to `value` the first time it scrolls into view.
export default function Counter({ value, suffix = '' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    setShown(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = 1600;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 4);
          setShown(Math.round(value * eased));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref}>
      {shown.toLocaleString('en-US')}
      {suffix}
    </span>
  );
}
