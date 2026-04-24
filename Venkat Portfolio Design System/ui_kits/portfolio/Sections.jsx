// Portfolio UI Kit — Section wrapper, About, Skills

const Section = ({ id, eyebrow, title, children, bg }) => (
  <section id={id} style={{ ...sectionStyles.wrap, background: bg || 'transparent' }}>
    <div style={sectionStyles.inner}>
      <div style={sectionStyles.eyebrow}>{eyebrow}</div>
      <h2 style={sectionStyles.title}>{title}</h2>
      {children}
    </div>
  </section>
);

const About = () => (
  <Section id="about" eyebrow="About" title="Research meets real-world AI engineering.">
    <div style={aboutStyles.grid}>
      <div style={aboutStyles.prose}>
        <p style={aboutStyles.p}>
          I'm an AI/ML Engineer pursuing my Master of Science in Computer Science at George Mason University
          (GPA 3.52, 27 credits completed), expected May 2026. As a Graduate Research Assistant at the
          Costello College of Business, I work under Dr. Saurabh Mishra and Dr. Jiyeon Hong on AI-driven
          automation and LLM applications.
        </p>
        <p style={aboutStyles.p}>
          I've authored 5 peer-reviewed publications with 50+ citations and 1 registered copyright —
          spanning AI/ML, NLP, cybersecurity, blockchain, and speech processing.
        </p>
        <div style={aboutStyles.highlights}>
          {[
            ['Research & Publications', '5 peer-reviewed publications with 50+ citations across AI/ML domains.'],
            ['Production AI Systems', 'Pipelines processing 1,000+ documents with Claude API, RAG architectures.'],
            ['Industry Certifications', 'NVIDIA Generative AI, 3× AWS, Red Hat, Claude Code Certified.'],
          ].map(([t, d]) => (
            <div key={t} style={aboutStyles.hlCard}>
              <h4 style={aboutStyles.hlTitle}>{t}</h4>
              <p style={aboutStyles.hlDesc}>{d}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={aboutStyles.photo}>
        <div style={aboutStyles.photoFrame}>
          <img src="../../assets/profile.jpeg" alt="Chennu Naga Venkata Sai" style={aboutStyles.photoImg} />
        </div>
        <div style={aboutStyles.photoCap}>Chennu Naga Venkata Sai</div>
      </div>
    </div>
  </Section>
);

const Skills = () => {
  const groups = [
    { t: 'Languages', items: ['Python', 'Java', 'JavaScript', 'SQL', 'R', 'HTML/CSS', 'Bash'] },
    { t: 'AI / ML', items: ['LLMs (GPT, Claude API)', 'Deep Learning', 'NLP', 'Neural Networks', 'RAG Architectures', 'Predictive Analytics', 'Text Mining', 'Speech Processing'] },
    { t: 'Frameworks & Tools', items: ['TensorFlow', 'PyTorch', 'FAISS', 'Pinecone', 'ChromaDB', 'Hugging Face', 'Scikit-learn', 'Pandas', 'NumPy'] },
    { t: 'Cloud & Data', items: ['AWS (3× Certified)', 'ETL', 'SQL/NoSQL', 'REST APIs', 'Docker'] },
    { t: 'Security', items: ['AI-Based Cybersecurity', 'Network Security', 'DNS Anomaly Detection', 'Ethereum', 'Smart Contracts'] },
    { t: 'Development', items: ['Full-Stack', 'Component-Based', 'Agile', 'Git', 'CI/CD'] },
  ];
  return (
    <Section id="skills" eyebrow="Technical Skills" title="What I work with" bg="var(--surface-2)">
      <p style={{ fontSize: 16, color: 'var(--ink-3)', maxWidth: 640, marginBottom: 40 }}>
        Technologies from my resume, research, and production projects.
      </p>
      <div style={skillsStyles.grid}>
        {groups.map(g => (
          <div key={g.t} style={skillsStyles.group}>
            <h4 style={skillsStyles.title}>{g.t}</h4>
            <div style={skillsStyles.chips}>
              {g.items.map(i => <span key={i} style={skillsStyles.chip}>{i}</span>)}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const sectionStyles = {
  wrap: { padding: '96px 32px' },
  inner: { maxWidth: 'var(--container)', margin: '0 auto' },
  eyebrow: { fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 18 },
  title: { fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 44, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 44px', maxWidth: 820 },
};

const aboutStyles = {
  grid: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 64, alignItems: 'flex-start' },
  prose: {},
  p: { fontSize: 16, lineHeight: 1.7, color: 'var(--ink-2)', margin: '0 0 18px' },
  highlights: { display: 'grid', gap: 14, marginTop: 32 },
  hlCard: { padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 },
  hlTitle: { margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--ink)' },
  hlDesc: { margin: 0, fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.55 },
  photo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, position: 'sticky', top: 100 },
  photoFrame: {
    width: 280, height: 340, borderRadius: 12,
    background: 'var(--surface-2)',
    border: '1px solid var(--line)', overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(15,15,18,0.08)',
  },
  photoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'saturate(0.95) contrast(1.02)' },
  photoCap: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' },
};

const skillsStyles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 },
  group: { padding: '24px 26px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '0 0 14px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 12, padding: '4px 9px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink-2)', fontWeight: 500 },
};

Object.assign(window, { Section, About, Skills });
