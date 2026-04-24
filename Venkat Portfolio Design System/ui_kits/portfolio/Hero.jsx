// Portfolio UI Kit — Hero + Stat Row

const Hero = () => (
  <section style={heroStyles.section}>
    <div style={heroStyles.container}>
      <div style={heroStyles.pill}>
        <span style={heroStyles.dot}></span>
        Available for full-time roles — New Grad May 2026
      </div>
      <h1 style={heroStyles.headline}>
        AI/ML Engineer.<br />
        <span style={heroStyles.muted}>5 publications. 50+ citations.</span>
      </h1>
      <p style={heroStyles.lead}>
        AI/ML Engineer and Computer Science graduate researcher with expertise in LLM interpretability,
        multilingual NLP, and AI-driven automation. Built production AI pipelines processing 1,000+ documents
        using Claude API. NVIDIA Generative AI certified with 3 AWS certifications.
      </p>
      <div style={heroStyles.meta}>
        <span>Fairfax, Virginia</span>
        <span style={heroStyles.sep}>·</span>
        <span>George Mason University</span>
        <span style={heroStyles.sep}>·</span>
        <span>GPA 3.52/4.0</span>
        <span style={heroStyles.sep}>·</span>
        <span>F-1 OPT Eligible</span>
      </div>
      <div style={heroStyles.ctas}>
        <a href="#projects" style={heroStyles.btnPrimary}>View My Work</a>
        <a href="#resume" style={heroStyles.btnOutline}>Download Resume ↓</a>
        <a href="#contact" style={heroStyles.btnGhost}>Get In Touch →</a>
      </div>
    </div>
  </section>
);

const StatRow = () => {
  const stats = [
    { n: '5', l: 'Peer-Reviewed Publications' },
    { n: '50+', l: 'Research Citations' },
    { n: '3.52', l: 'GPA at George Mason' },
    { n: '6', l: 'Professional Certifications' },
    { n: "May '26", l: 'Graduation Date' },
  ];
  return (
    <section style={heroStyles.stats}>
      <div style={heroStyles.statsInner}>
        {stats.map((s, i) => (
          <div key={i} style={heroStyles.stat}>
            <div style={heroStyles.statNum}>{s.n}</div>
            <div style={heroStyles.statLbl}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const heroStyles = {
  section: { padding: '96px 32px 64px', background: 'var(--canvas)' },
  container: { maxWidth: 'var(--container)', margin: '0 auto' },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 14px', borderRadius: 9999,
    border: '1px solid var(--line-strong)',
    fontSize: 12, color: 'var(--ink-2)', marginBottom: 32,
    background: 'var(--surface)', fontWeight: 500,
  },
  dot: { width: 6, height: 6, borderRadius: 9999, background: 'var(--success)' },
  headline: {
    fontFamily: 'var(--font-serif)', fontWeight: 400,
    fontSize: 72, lineHeight: 1.05, letterSpacing: '-0.025em',
    color: 'var(--ink)', margin: '0 0 28px', maxWidth: 900,
  },
  muted: { color: 'var(--ink-3)' },
  lead: {
    fontSize: 18, lineHeight: 1.65, color: 'var(--ink-2)',
    maxWidth: 720, margin: '0 0 24px',
  },
  meta: {
    display: 'flex', gap: 10, flexWrap: 'wrap',
    fontSize: 14, color: 'var(--ink-3)', marginBottom: 40,
  },
  sep: { color: 'var(--ink-4)' },
  ctas: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  btnPrimary: {
    background: 'var(--ink)', color: '#fff', padding: '12px 22px',
    borderRadius: 6, fontSize: 14, fontWeight: 500, textDecoration: 'none',
  },
  btnOutline: {
    background: 'transparent', color: 'var(--ink)',
    border: '1px solid var(--line-strong)',
    padding: '12px 22px', borderRadius: 6, fontSize: 14, fontWeight: 500, textDecoration: 'none',
  },
  btnGhost: {
    background: 'transparent', color: 'var(--accent)',
    padding: '12px 6px', fontSize: 14, fontWeight: 500, textDecoration: 'none',
  },
  stats: { padding: '32px 32px 64px' },
  statsInner: {
    maxWidth: 'var(--container)', margin: '0 auto',
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 32,
    borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)',
    padding: '36px 0',
  },
  stat: {},
  statNum: {
    fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 64,
    lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--ink)',
    fontVariantNumeric: 'tabular-nums',
  },
  statLbl: { fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 12 },
};

Object.assign(window, { Hero, StatRow });
