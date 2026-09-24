'use client';

import { useEffect, useState } from 'react';

const LINKS = [
  ['#experience', 'Experience'],
  ['#projects', 'Projects'],
  ['#lab', 'AI Lab'],
  ['#publications', 'Research'],
  ['#skills', 'Skills'],
  ['#contact', 'Contact'],
];

export default function Nav({ resumePath }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const sections = LINKS.map(([href]) => document.querySelector(href)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(`#${e.target.id}`);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((s) => io.observe(s));

    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      io.disconnect();
    };
  }, []);

  return (
    <header className={`nav${scrolled || open ? ' scrolled' : ''}`}>
      <nav className="container nav-inner" aria-label="Main">
        <a href="#top" className="logo" onClick={() => setOpen(false)}>
          <span className="logo-mark" aria-hidden="true">
            NC
          </span>
          <span>Naga Chennu</span>
        </a>
        <ul id="nav-links" className={`nav-links${open ? ' open' : ''}`}>
          {LINKS.map(([href, label]) => (
            <li key={href}>
              <a href={href} className={active === href ? 'active' : undefined} onClick={() => setOpen(false)}>
                {label}
              </a>
            </li>
          ))}
        </ul>
        <a className="btn nav-cta" href={resumePath} target="_blank" rel="noopener">
          Resume
        </a>
        <button
          type="button"
          className="menu-btn"
          aria-expanded={open}
          aria-controls="nav-links"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
        </button>
      </nav>
    </header>
  );
}
