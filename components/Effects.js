'use client';

import { useEffect } from 'react';

// Page-wide effects that need no markup of their own:
// - reveals [data-reveal] elements as they scroll into view
// - moves the glow on .card.glow elements to follow the cursor
export default function Effects() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    els.forEach((el) => io.observe(el));

    function onMove(e) {
      const card = e.target.closest?.('.card.glow');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      io.disconnect();
      document.removeEventListener('pointermove', onMove);
    };
  }, []);
  return null;
}
