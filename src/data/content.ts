/**
 * Single source of truth for portfolio content.
 * Content strings are preserved to satisfy tests/portfolio-content-check.mjs.
 */

export const site = {
  name: 'Naga Venkata Sai Chennu',
  brandInitials: 'NS',
  url: 'https://chennunagavenkatasai.com',
  email: 'nchennu@gmu.edu',
  roleTarget: 'Business Systems Analyst – AI Automation',
  heroEyebrow:
    'Software Engineer · Scalable Systems, Test Automation, AI-Assisted Development',
  signalLine: 'Salesforce-ready software engineering profile',
  description:
    'Naga Venkata Sai Chennu — software engineer focused on scalable systems, test automation, and AI-assisted development. Business Systems Analyst – AI Automation.',
  resume: '/Naga_Venkata_Sai_Chennu_Career_Fair_Resume.pdf',
  calendar: 'https://cal.com/nagavenkatasaichennu-c-h24tx0/15min',
  availability: 'Open to full-time software engineering roles — New Grad, May 2026',
  links: {
    linkedin: 'https://www.linkedin.com/in/naga-venkata-sai-chennu/',
    github: 'https://github.com/Nagavenkatasai7',
    orcid: 'https://orcid.org/0009-0000-8252-8682',
    paperDecode: 'https://paper-decode.lovable.app',
  },
} as const;

export interface NavLink {
  label: string;
  href: string;
}
export const nav: NavLink[] = [
  { label: 'About', href: '#about' },
  { label: 'Proof', href: '#proof' },
  { label: 'Software', href: '#software' },
  { label: 'Projects', href: '#projects' },
  { label: 'Experience', href: '#experience' },
  { label: 'Skills', href: '#skills' },
  { label: 'Research', href: '#research' },
];

export const heroLead =
  'I build scalable software with the systems judgment to make it trustworthy — backed by test automation, telemetry, and disciplined AI-assisted development.';

export interface ProofStat {
  number: string;
  label: string;
}
export const proofStats: ProofStat[] = [
  { number: '900', label: 'Unit & functional checks' },
  { number: '4×', label: 'H100 SLURM cluster' },
  { number: '80%', label: 'Manual time reduced' },
  { number: '6+', label: 'Software & AI systems' },
  { number: '50+', label: 'Research citations' },
];

export const aboutStory: string[] = [
  'I work in the space between software engineering and AI systems: shipping production software, then proving it works. Most recently I built LLM Forge, a 12-stage pipeline for fine-tuning domain-specific language models.',
  'I care about quality you can measure. I wrote a 900-check unit and functional test framework so changes ship with evidence, not hope.',
  'I use AI where it earns its place — for example, automating PDF data extraction with the Claude API to cut manual processing time by 80% — always with human review.',
];

export interface Principle {
  title: string;
  body: string;
}
export const principles: Principle[] = [
  { title: 'Architecture first', body: 'Design the system before writing the code that lives in it.' },
  { title: 'Quality automation', body: 'Tests and telemetry are part of the feature, not an afterthought.' },
  { title: 'AI with review', body: 'AI accelerates the work; a human owns the outcome.' },
];

export interface Card {
  title: string;
  body: string;
  source?: { url: string; label: string };
}

export const marketCards: Card[] = [
  {
    title: 'Enterprise AI adoption',
    body: 'By 2026, a large share of new enterprise apps will embed AI. I build for that reality, not the hype around it.',
    source: { url: 'https://www.gartner.com/en/newsroom', label: 'Gartner' },
  },
  {
    title: 'SaaS outlook',
    body: 'Cloud products are consolidating around trust, automation, and measurable outcomes.',
    source: { url: 'https://www2.deloitte.com/us/en/insights.html', label: 'Deloitte 2026' },
  },
  {
    title: 'Operator mindset',
    body: 'The teams that win pair engineering depth with operational discipline.',
    source: { url: 'https://www.calmops.com', label: 'CalmOps' },
  },
];

export const softwareCards: Card[] = [
  { title: 'Architecture & delivery', body: 'Architect, design, implement, test, and deliver scalable products.' },
  { title: 'Test automation', body: 'Unit, functional, and regression coverage wired into the delivery path.' },
  { title: 'AI-assisted development', body: 'Move fast with AI assistants while owning every line that ships.' },
  { title: 'Operational telemetry', body: 'Instrument systems so behavior in production is observable and explainable.' },
  { title: 'Cloud & data foundation', body: 'Typed services over relational data, built to scale cleanly.' },
  { title: 'Team delivery habits', body: 'Code review, documentation, and predictable, repeatable releases.' },
];

export type ProjectCategory =
  | 'software'
  | 'automation'
  | 'data'
  | 'healthcare'
  | 'revops'
  | 'research';

export interface Project {
  category: ProjectCategory;
  kicker: string;
  title: string;
  summary: string;
  did: string;
  how: string;
  impact: string;
  tags: string[];
  link?: { url: string; label: string };
  /** Card variant that renders a non-anchor span styled as a project link. */
  spanLink?: string;
}

export const projectFilters: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'software', label: 'Software' },
  { value: 'automation', label: 'Automation' },
  { value: 'data', label: 'Data' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'revops', label: 'RevOps' },
  { value: 'research', label: 'Research' },
];

export const projects: Project[] = [
  {
    category: 'software',
    kicker: 'Software · Payments',
    title: 'SmartRemit — Multi-Tenant Payments Platform',
    summary: 'Multi-tenant remittance platform with isolated tenant data and a typed service layer.',
    did: 'Built a multi-tenant payments backend with tenant isolation, auth, and a typed API.',
    how: 'TypeScript and NestJS services over PostgreSQL, with a Next.js client and row-scoped tenancy.',
    impact: 'A reusable foundation for onboarding new tenants without code changes.',
    tags: ['TypeScript', 'NestJS', 'Next.js', 'PostgreSQL'],
  },
  {
    category: 'software',
    kicker: 'Software · Edge AI',
    title: 'JetBot — Edge AI Agent on Jetson',
    summary: 'On-device AI agent running untethered on NVIDIA Jetson with local full-text search.',
    did: 'Shipped an edge AI agent that runs offline on a Jetson board.',
    how: 'Python services with SQLite FTS5 for local retrieval, managed as Linux systemd units.',
    impact: 'Low-latency, offline-capable assistant with no cloud dependency.',
    tags: ['Python', 'SQLite FTS5', 'Linux', 'systemd'],
  },
  {
    category: 'software',
    kicker: 'Software · GPU',
    title: 'CUDA Matrix-Multiplication Kernel',
    summary: 'Hand-tuned CUDA GEMM kernel profiled against a naive baseline.',
    did: 'Implemented and profiled a tiled matrix-multiplication kernel.',
    how: 'C++ and CUDA with shared-memory tiling, then iterative profiling to remove stalls.',
    impact: 'Substantial throughput gains over the naive kernel on H100-class GPUs.',
    tags: ['C++', 'CUDA', 'Profiling', 'Performance'],
  },
  {
    category: 'automation',
    kicker: 'Automation · Intake',
    title: 'AI Business Request Intake & Jira Automation System',
    summary: 'Turns free-text business requests into structured, routed Jira issues.',
    did: 'Automated intake that classifies requests and files structured Jira tickets.',
    how: 'Next.js and Postgres with the Jira API and an OpenRouter LLM for extraction.',
    impact: 'Removed manual triage and standardized every incoming request.',
    tags: ['Next.js', 'Postgres', 'Jira API', 'OpenRouter'],
    link: { url: 'https://ai-business-request-intake.vercel.app', label: 'Live app' },
  },
  {
    category: 'automation',
    kicker: 'Automation · ROI',
    title: 'AI Automation ROI & Process-Optimization Platform',
    summary: 'Models the ROI of automating a process and tracks it over time.',
    did: 'Built an ROI model and dashboard for automation opportunities.',
    how: 'An analytics pipeline with webhook ingestion and a scenario model.',
    impact: 'Gives a defensible number for which processes to automate first.',
    tags: ['ROI model', 'Analytics', 'Webhooks'],
    link: { url: 'https://ai-automation-roi.vercel.app', label: 'Live app' },
  },
  {
    category: 'healthcare',
    kicker: 'Healthcare · EMR',
    title: 'Healthcare Workflow Automation & EMR Data-Extraction System',
    summary: 'Extracts and validates structured data from clinical documents.',
    did: 'Automated EMR data extraction with a human-in-the-loop validation queue.',
    how: 'Synthetic data for testing, validation rules, and a queue-based review experience.',
    impact: 'Faster, auditable extraction without ever touching real patient data.',
    tags: ['Synthetic data', 'Validation', 'Queue UX'],
    link: { url: 'https://healthcare-emr-extraction.vercel.app', label: 'Live app' },
  },
  {
    category: 'data',
    kicker: 'Data · Quality',
    title: 'Product Master-Data Automation & Data-Quality Control System',
    summary: 'Enforces data-quality rules across product master data.',
    did: 'Built automated data-quality controls for product master records.',
    how: 'A CSV rule engine over Postgres with configurable quality checks.',
    impact: 'Catches bad records before they reach downstream systems.',
    tags: ['Data quality', 'CSV rules', 'Postgres'],
    link: { url: 'https://product-master-data-qc.vercel.app', label: 'Live app' },
  },
  {
    category: 'revops',
    kicker: 'RevOps · Dashboard',
    title: 'AI-Powered Revenue-Operations Automation Dashboard',
    summary: 'Scores revenue risk and surfaces it in an operations dashboard.',
    did: 'Built a RevOps dashboard with automated risk scoring.',
    how: 'A risk model feeding a real-time dashboard for revenue operations.',
    impact: 'Surfaces at-risk revenue early enough to act on it.',
    tags: ['RevOps', 'Risk scoring', 'Dashboard'],
    link: { url: 'https://revops-automation-dashboard.vercel.app', label: 'Live app' },
  },
  {
    category: 'research',
    kicker: 'Research · LLM',
    title: 'LLM Forge: Domain-Specific LLM Fine-Tuning Platform',
    summary: 'A 12-stage pipeline for fine-tuning domain-specific language models.',
    did: 'Built an end-to-end fine-tuning platform for domain-specific LLMs.',
    how: 'Hugging Face and LoRA with Pydantic-validated configs across a 12-stage pipeline.',
    impact: 'Repeatable fine-tuning runs with validated, reproducible configs.',
    tags: ['Hugging Face', 'LoRA', 'Pydantic'],
    spanLink: 'Research system',
  },
];

export interface ExperienceItem {
  role: string;
  company: string;
  dates: string;
  bullets: string[];
}
export const experience: ExperienceItem[] = [
  {
    role: 'Graduate Research Assistant — AI Systems & Test Automation Engineering',
    company: 'George Mason University — Costello College of Business',
    dates: 'Aug 2025 – May 2026 · Fairfax, VA',
    bullets: [
      'Built LLM Forge, a 12-stage pipeline for fine-tuning domain-specific language models.',
      'Wrote a 900-check unit and functional test framework so every change ships with evidence.',
      'Automated PDF data extraction with the Claude API, cutting manual processing time by 80%.',
      'Adopted AI coding assistants with a strict human-review gate on everything that ships.',
      'Instrumented systems with telemetry and performance metrics for production observability.',
    ],
  },
  {
    role: 'Event Operations Technician — Operational Leadership & Process Improvement',
    company: 'George Mason University — EagleBank Arena & Campus Events',
    dates: 'Aug 2024 – May 2026 · Fairfax, VA',
    bullets: [
      'Coordinated event operations under tight timelines with cross-functional teams.',
      'Streamlined setup and teardown processes to reduce turnaround time.',
      'Owned reliability of live event systems for large-capacity venues.',
    ],
  },
  {
    role: 'Undergraduate Researcher — Software Engineering',
    company: 'KL University — Department of CSE',
    dates: 'Jan 2022 – May 2024',
    bullets: [
      'Built a machine-learning ensemble reaching 93% accuracy on a prediction task.',
      'Prototyped an Ethereum land-registration system in Solidity.',
      'Shipped a CatBoost-based analytics dashboard for stress detection.',
    ],
  },
];

export interface SkillCard {
  title: string;
  body: string;
  tags: string[];
}
export const skills: SkillCard[] = [
  {
    title: 'Languages & OOP',
    body: 'Strong object-oriented Python, plus Java, JavaScript/TypeScript, SQL, C++, HTML.',
    tags: ['Python', 'Java', 'TypeScript', 'C++'],
  },
  {
    title: 'Testing & quality automation',
    body: 'Unit and functional test frameworks, regression coverage, and CI quality gates.',
    tags: ['Pytest', 'CI gates', '900+ checks', 'Test design'],
  },
  {
    title: 'Cloud & product engineering',
    body: 'Typed services, relational data modeling, and cloud deployment on modern platforms.',
    tags: ['PostgreSQL', 'NestJS', 'Next.js', 'Vercel'],
  },
  {
    title: 'AI coding assistants',
    body: 'Hands-on with Claude Code, GitHub Copilot, Cursor, Gemini — always with review ownership.',
    tags: ['Claude Code', 'Copilot', 'Cursor', 'Gemini'],
  },
  {
    title: 'Telemetry & operational excellence',
    body: 'Instrumentation with telemetry and performance metrics to keep systems observable.',
    tags: ['Telemetry', 'Metrics', 'Logging', 'Observability'],
  },
  {
    title: 'Credentials',
    body: 'Industry certifications across AI, GPU computing, and cloud.',
    tags: ['AWS AI Practitioner', 'NVIDIA GenAI LLMs', 'Claude Code in Action', 'Red Hat'],
  },
];

export interface ResearchCard {
  title: string;
  body: string;
  meta: string;
}
export const research: ResearchCard[] = [
  {
    title:
      'Assessing the Effectiveness of Artificial Intelligence Techniques in Mitigating Cyber Security Risks',
    body: 'A study of how AI techniques reduce exposure to evolving cyber-security threats.',
    meta: 'First author · AI + cybersecurity',
  },
  {
    title:
      'Enhancing Hairfall Prediction: A Comparative Analysis of Individual Algorithms and an Ensemble Method',
    body: 'Comparative ML analysis showing ensemble gains over individual algorithms.',
    meta: 'First author · ML + healthcare analytics',
  },
  {
    title: 'Comparative Analysis of Psychological Stress Detection: ANN and CatBoost',
    body: 'Benchmarking neural networks against gradient boosting for stress detection.',
    meta: 'AI model comparison',
  },
  {
    title: 'Blockchain, Speech Quality, and Applied AI Systems',
    body: 'A body of applied work spanning blockchain, signal quality, and AI systems.',
    meta: '5 publications · 50+ citations · patent work',
  },
];

export interface EducationCard {
  school: string;
  degree: string;
  meta: string;
}
export const education: EducationCard[] = [
  {
    school: 'George Mason University',
    degree: 'M.S. in Computer Science',
    meta: '2024 – 2026 · Expected May 2026 · Fairfax, VA',
  },
  {
    school: 'KL University',
    degree: 'B.Tech in Computer Science & Engineering',
    meta: 'May 2020 – May 2024',
  },
];
