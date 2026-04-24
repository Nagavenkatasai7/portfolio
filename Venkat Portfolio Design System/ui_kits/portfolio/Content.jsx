// Portfolio UI Kit — Projects, Experience, Publications, Certifications, Contact

const Projects = () => {
  const projects = [
    {
      title: 'Multi-Agent AI Research Discovery Platform',
      meta: 'Python · RAG · FAISS · Pinecone · ChromaDB',
      status: null,
      bullets: [
        'Designed a 23-agent research automation system using Mixture of Experts (MoE) architecture for automated literature discovery and analysis',
        'Integrated RAG pipelines with vector databases (FAISS, Pinecone, ChromaDB) for multi-modal document retrieval and processing',
      ],
      tags: ['Python', 'RAG', 'MoE', 'Vector DB'],
    },
    {
      title: 'Trademark Analysis Pipeline (Claude API)',
      meta: 'Python · Claude API · Document Processing',
      status: null,
      bullets: [
        'Developed production-scale document processing system handling 1,000+ trademark cases with automated classification and data extraction',
        'Achieved significant cost optimization through prompt caching and efficient API usage patterns',
      ],
      tags: ['Claude API', 'Python', 'NLP'],
    },
    {
      title: 'DNS Anomaly Detection System',
      meta: 'Python · Machine Learning · Network Security',
      status: null,
      bullets: [
        'Built ML-based DNS anomaly detection system applying network security principles to identify malicious DNS traffic patterns',
        'Course project for ISA 656 — Network Security at George Mason University',
      ],
      tags: ['ML', 'Security', 'Python'],
    },
    {
      title: 'Dynamic Adaptive Data Transmission System',
      meta: 'RNN · BICM · QAM/PSK Signal Processing',
      status: 'Copyright Registered',
      bullets: [
        'Co-authored system integrating Recurrent Neural Networks with Bit-Interleaved Coded Modulation for enhanced QAM and PSK signal processing',
        'Copyright L-142224/2024 registered with the Government of India',
      ],
      tags: ['RNN', 'Deep Learning', 'Signal Processing'],
    },
  ];
  return (
    <Section id="projects" eyebrow="Key Projects" title="What I've built">
      <p style={{ fontSize: 16, color: 'var(--ink-3)', maxWidth: 640, marginBottom: 40 }}>
        Production AI systems and research-driven engineering.
      </p>
      <div style={projStyles.grid}>
        {projects.map((p, i) => <ProjectCard key={i} {...p} />)}
      </div>
    </Section>
  );
};

const ProjectCard = ({ title, meta, status, bullets, tags }) => (
  <article style={projStyles.card}>
    <div style={projStyles.head}>
      <div style={projStyles.metaTxt}>{meta}</div>
      {status && <div style={projStyles.status}>{status}</div>}
    </div>
    <h3 style={projStyles.title}>{title}</h3>
    <ul style={projStyles.bullets}>
      {bullets.map((b, i) => <li key={i} style={projStyles.bullet}>{b}</li>)}
    </ul>
    <div style={projStyles.tags}>
      {tags.map(t => <span key={t} style={projStyles.tag}>{t}</span>)}
    </div>
  </article>
);

const projStyles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: {
    background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8,
    padding: 28, boxShadow: '0 1px 2px rgba(15,15,18,0.04)', display: 'flex', flexDirection: 'column', gap: 14,
    transition: 'all 280ms var(--ease)',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  metaTxt: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.02em' },
  status: { fontSize: 10, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, padding: '4px 8px', background: 'var(--success-tint)', borderRadius: 4, whiteSpace: 'nowrap' },
  title: { fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.2, letterSpacing: '-0.015em', margin: 0 },
  bullets: { margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  bullet: { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' },
  tag: { fontSize: 11, padding: '3px 9px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink-2)', fontWeight: 500 },
};

const Experience = () => {
  const roles = [
    {
      title: 'Graduate Research Assistant',
      org: 'Costello College of Business, George Mason University',
      when: 'Aug 2025 – Present',
      sub: 'Advisors: Dr. Saurabh Mishra (Marketing Analytics & AI) & Dr. Jiyeon Hong (AI Personas)',
      bullets: [
        'Built an AI automation pipeline analyzing 1,000+ trademark opposition cases using Claude API for visual intelligence, document classification, and structured data extraction',
        'Constructed structured datasets from Factiva and proprietary sources for NLP-based marketing analytics and statistical modeling',
        'Conducting literature review on AI-driven personas — how LLMs generate adaptive, context-aware agents for customer engagement',
      ],
    },
    {
      title: 'Undergraduate Research Assistant',
      org: 'Dept. of CSE, KL University, India',
      when: 'May 2022 – May 2024',
      sub: '',
      bullets: [
        'Published 4 Scopus-indexed journal articles and 1 IEEE conference paper across AI/ML, NLP, cybersecurity, and blockchain over 2 years',
        'First-authored studies on AI-based cybersecurity risk mitigation and ensemble ML methods for predictive healthcare analytics',
        'Presented speech quality assessment research for Indian languages at IEEE ICICT 2023, Tribhuvan University, Nepal',
      ],
    },
  ];
  return (
    <Section id="experience" eyebrow="Research Experience" title="Where I work" bg="var(--surface-2)">
      <p style={{ fontSize: 16, color: 'var(--ink-3)', maxWidth: 640, marginBottom: 40 }}>
        Cross-disciplinary research at the intersection of AI, marketing, and customer experience.
      </p>
      <div style={expStyles.list}>
        {roles.map((r, i) => (
          <div key={i} style={expStyles.item}>
            <div style={expStyles.side}>
              <div style={expStyles.when}>{r.when}</div>
            </div>
            <div style={expStyles.body}>
              <h3 style={expStyles.title}>{r.title}</h3>
              <div style={expStyles.org}>{r.org}</div>
              {r.sub && <div style={expStyles.sub}>{r.sub}</div>}
              <ul style={expStyles.bullets}>
                {r.bullets.map((b, j) => <li key={j} style={expStyles.bullet}>{b}</li>)}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const expStyles = {
  list: { display: 'flex', flexDirection: 'column', gap: 40 },
  item: { display: 'grid', gridTemplateColumns: '200px 1fr', gap: 40, paddingTop: 32, borderTop: '1px solid var(--line)' },
  side: {},
  when: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', letterSpacing: '0.02em' },
  body: {},
  title: { fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink)', margin: '0 0 6px' },
  org: { fontSize: 14, color: 'var(--ink-2)', fontWeight: 500, marginBottom: 4 },
  sub: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 14, fontStyle: 'italic' },
  bullets: { margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  bullet: { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 },
};

const Publications = () => {
  const pubs = [
    { year: '2023', first: true, title: 'Assessing the Effectiveness of Artificial Intelligence Techniques in Mitigating Cyber Security Risks', venue: "Int'l Journal of Intelligent Systems and Applications in Engineering, 11(4)" },
    { year: '2023', first: true, title: 'Enhancing Hairfall Prediction: A Comparative Analysis of Individual Algorithms and an Ensemble Method', venue: "Int'l Journal on Recent and Innovation Trends in Computing and Communication, 11(6s)" },
    { year: '2024', first: false, title: 'Comparative Analysis of Psychological Stress Detection: ANN and CatBoost Algorithm', venue: "Int'l Journal of Intelligent Systems and Applications in Engineering, 12(1)" },
    { year: '2023', first: false, title: 'A Novel Strategy for Streamlining Land Registration using Ethereum Blockchain', venue: "Int'l Journal of Intelligent Systems and Applications in Engineering, 11(4)" },
    { year: '2023', first: false, title: 'Speech Quality Assessment and Control in Indian Languages', venue: 'IEEE ICICT 2023 — Tribhuvan University, Nepal', doi: '10.1109/ICICT57646.2023' },
  ];
  return (
    <Section id="publications" eyebrow="Publications (5)" title="Peer-reviewed research">
      <p style={{ fontSize: 16, color: 'var(--ink-3)', maxWidth: 640, marginBottom: 32 }}>
        5 peer-reviewed publications · 50+ citations · Scopus Author ID: 58404553900
      </p>
      <div style={pubStyles.list}>
        {pubs.map((p, i) => (
          <article key={i} style={pubStyles.item}>
            <div style={pubStyles.year}>{p.year}</div>
            <div style={pubStyles.body}>
              <h3 style={pubStyles.title}>
                {p.title}
                {p.first && <span style={pubStyles.first}>First Author</span>}
              </h3>
              <div style={pubStyles.venue}>{p.venue}</div>
              {p.doi && <div style={pubStyles.doi}>DOI: {p.doi}</div>}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
};

const pubStyles = {
  list: { display: 'flex', flexDirection: 'column' },
  item: { display: 'grid', gridTemplateColumns: '80px 1fr', gap: 24, padding: '22px 0', borderTop: '1px solid var(--line)' },
  year: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)', paddingTop: 4 },
  body: {},
  title: { fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3, letterSpacing: '-0.01em', margin: '0 0 6px' },
  first: { display: 'inline-block', fontSize: 10, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '1px 7px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.12em', marginLeft: 10, verticalAlign: 'middle', fontWeight: 600, fontFamily: 'var(--font-sans)' },
  venue: { fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.5 },
  doi: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', marginTop: 4 },
};

const Certifications = () => {
  const certs = [
    { title: 'NVIDIA Certified Associate: Generative AI & LLMs', org: 'NVIDIA', when: 'Feb 2026', verify: true },
    { title: 'AWS Certified AI Practitioner', org: 'Amazon Web Services', when: 'Nov 2025', verify: true },
    { title: 'AWS Certified Cloud Practitioner (CLF-C01)', org: 'Amazon Web Services', when: '2022', verify: false },
    { title: 'AWS Certified Developer Associate', org: 'Amazon Web Services', when: '2022', verify: false },
    { title: 'Red Hat Certified Enterprise Application Developer', org: 'Red Hat', when: '2022', verify: false },
    { title: 'Claude Code Certification', org: 'Anthropic', when: 'Dec 2025', verify: true },
  ];
  return (
    <Section id="certifications" eyebrow="Professional Certifications" title="Industry credentials" bg="var(--surface-2)">
      <p style={{ fontSize: 16, color: 'var(--ink-3)', maxWidth: 640, marginBottom: 40 }}>
        NVIDIA, AWS, Red Hat, and Anthropic certified.
      </p>
      <div style={certStyles.grid}>
        {certs.map((c, i) => (
          <div key={i} style={certStyles.card}>
            <div style={certStyles.badge}>✓</div>
            <div style={certStyles.col}>
              <h4 style={certStyles.title}>{c.title}</h4>
              <div style={certStyles.org}>{c.org}</div>
              <div style={certStyles.meta}>{c.when}{c.verify && <span> · Verify →</span>}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const certStyles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 },
  card: { display: 'flex', gap: 14, alignItems: 'flex-start', padding: '20px 22px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 },
  badge: { width: 36, height: 36, borderRadius: '50%', background: 'var(--success-tint)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 700 },
  col: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35, margin: 0 },
  org: { fontSize: 13, color: 'var(--ink-3)', marginTop: 2 },
  meta: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', marginTop: 8, letterSpacing: '0.02em' },
};

const Contact = () => (
  <Section id="contact" eyebrow="Contact" title="Let's work together.">
    <p style={{ fontSize: 17, color: 'var(--ink-2)', maxWidth: 640, marginBottom: 40, lineHeight: 1.55 }}>
      New Grad May 2026 · MS in Computer Science · F-1 OPT Eligible (36 months authorization). Open to
      AI Engineering, Prompt Engineering, or GenAI Development roles.
    </p>
    <div style={contactStyles.grid}>
      {[
        ['Email', 'chennunagavenkatasai@gmail.com'],
        ['Phone', '(571) 546-6207'],
        ['LinkedIn', 'linkedin.com/in/nagavenkatasaichennu'],
        ['GitHub', 'github.com/Nagavenkatasai7'],
        ['ORCID', '0009-0000-8252-8682'],
        ['Location', 'Fairfax, Virginia'],
      ].map(([k, v]) => (
        <div key={k} style={contactStyles.item}>
          <div style={contactStyles.lbl}>{k}</div>
          <div style={contactStyles.val}>{v}</div>
        </div>
      ))}
    </div>
    <div style={contactStyles.ctas}>
      <a href="mailto:chennunagavenkatasai@gmail.com" style={contactStyles.btnPrimary}>Send Email</a>
      <a href="#resume" style={contactStyles.btnOutline}>Download Resume ↓</a>
    </div>
  </Section>
);

const contactStyles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 40 },
  item: { padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 },
  lbl: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--ink-3)', marginBottom: 6, fontWeight: 500 },
  val: { fontSize: 14, color: 'var(--ink)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' },
  ctas: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  btnPrimary: { background: 'var(--ink)', color: '#fff', padding: '12px 22px', borderRadius: 6, fontSize: 14, fontWeight: 500, textDecoration: 'none' },
  btnOutline: { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line-strong)', padding: '12px 22px', borderRadius: 6, fontSize: 14, fontWeight: 500, textDecoration: 'none' },
};

const Footer = () => (
  <footer style={footerStyles.wrap}>
    <div style={footerStyles.inner}>
      <div style={footerStyles.col}>© 2026 Chennu Naga Venkata Sai</div>
      <div style={footerStyles.links}>
        <a href="#">LinkedIn</a>
        <a href="#">GitHub</a>
        <a href="#">ORCID</a>
        <a href="#">Email</a>
      </div>
    </div>
  </footer>
);

const footerStyles = {
  wrap: { padding: '48px 32px', borderTop: '1px solid var(--line)', background: 'var(--canvas)' },
  inner: { maxWidth: 'var(--container)', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--ink-3)' },
  col: {},
  links: { display: 'flex', gap: 22 },
};

Object.assign(window, { Projects, ProjectCard, Experience, Publications, Certifications, Contact, Footer });
