// Portfolio UI Kit — Navigation
// Top bar with wordmark + anchors + resume CTA

const PortfolioNav = ({ active = 'about', onNavigate = () => {} }) => {
  const items = ['About', 'Skills', 'Projects', 'Experience', 'Publications', 'Certifications', 'Education', 'Contact'];
  return (
    <nav style={navStyles.bar}>
      <div style={navStyles.inner}>
        <div style={navStyles.wordmark}>
          Venkat Chennu<span style={{ color: 'var(--accent)' }}>.</span>
        </div>
        <div style={navStyles.links}>
          {items.map(it => {
            const slug = it.toLowerCase();
            const isActive = active === slug;
            return (
              <a
                key={it}
                onClick={(e) => { e.preventDefault(); onNavigate(slug); }}
                style={{ ...navStyles.link, color: isActive ? 'var(--accent)' : 'var(--ink-2)' }}
                href={`#${slug}`}
              >{it}</a>
            );
          })}
        </div>
        <a style={navStyles.resume} href="#resume">Resume ↗</a>
      </div>
    </nav>
  );
};

const navStyles = {
  bar: {
    position: 'sticky', top: 0, zIndex: 50,
    background: 'rgba(250,250,247,0.88)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid var(--line)',
  },
  inner: {
    maxWidth: 'var(--container)', margin: '0 auto',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 32px',
  },
  wordmark: { fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 18, letterSpacing: '-0.01em', color: 'var(--ink)' },
  links: { display: 'flex', gap: 22 },
  link: { fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', transition: 'color 160ms var(--ease)' },
  resume: {
    fontSize: 13, fontWeight: 500,
    border: '1px solid var(--line-strong)',
    padding: '7px 14px', borderRadius: 6,
    color: 'var(--ink)', textDecoration: 'none',
    transition: 'all 160ms var(--ease)',
  },
};

Object.assign(window, { PortfolioNav });
