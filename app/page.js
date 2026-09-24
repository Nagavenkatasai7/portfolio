import Nav from '@/components/Nav';
import HeroCanvas from '@/components/HeroCanvas';
import RotatingText from '@/components/RotatingText';
import Counter from '@/components/Counter';
import Effects from '@/components/Effects';
import VlmChart from '@/components/VlmChart';
import LlamaChart from '@/components/LlamaChart';
import AiLab from '@/components/lab/AiLab';
import {
  person,
  stats,
  experience,
  projects,
  vlmResults,
  llamaResults,
  publications,
  education,
  skills,
  certifications,
  RESUME_PATH,
  SITE_URL,
} from '@/content/profile';

const MARQUEE = skills.flatMap((s) => s.items);

function SectionHead({ eyebrow, title, sub }) {
  return (
    <div className="section-head" data-reveal>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="section-title">{title}</h2>
      {sub && <p className="section-sub">{sub}</p>}
    </div>
  );
}

function NameLine({ text, offset }) {
  return (
    <span className="line">
      {[...text].map((ch, i) => (
        <span key={i} className="char" style={{ '--i': offset + i }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: person.name,
  jobTitle: person.title,
  url: SITE_URL,
  email: `mailto:${person.email}`,
  address: { '@type': 'PostalAddress', addressLocality: 'Fairfax', addressRegion: 'VA', addressCountry: 'US' },
  alumniOf: education.map((e) => ({ '@type': 'CollegeOrUniversity', name: e.school })),
  sameAs: Object.values(person.links),
  knowsAbout: skills.flatMap((s) => s.items).slice(0, 20),
};

export default function Home() {
  const [first, ...rest] = person.name.split(' ');
  const line1 = `${first} ${rest[0]}`;
  const line2 = rest.slice(1).join(' ');

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Nav resumePath={RESUME_PATH} />
      <Effects />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main id="main">
        {/* ---------------- Hero ---------------- */}
        <section className="hero" id="top" aria-labelledby="hero-name">
          <HeroCanvas />
          <div className="container">
            <span className="hero-badge">
              <span className="dot" aria-hidden="true" />
              {person.title} · {person.location}
            </span>
            <h1 className="hero-name" id="hero-name">
              <NameLine text={line1} offset={0} />
              <NameLine text={line2} offset={line1.length} />
            </h1>
            <p className="hero-role">
              Building <RotatingText words={person.rotating} />
            </p>
            <p className="hero-summary">{person.summary}</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#lab">
                <span aria-hidden="true">✦</span> Try the AI Lab
              </a>
              <a className="btn" href={RESUME_PATH} target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download resume
              </a>
              <a className="btn" href={`mailto:${person.email}`}>
                Email me
              </a>
            </div>
            <dl className="stats">
              {stats.map((s, i) => (
                <div className="stat" key={s.label} data-reveal style={{ '--delay': `${i * 90}ms` }}>
                  <dt className="stat-label">{s.label}</dt>
                  <dd className="stat-value grad-text" style={{ margin: 0, order: -1 }}>
                    <Counter value={s.value} suffix={s.suffix} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <a href="#experience" className="scroll-hint" aria-label="Scroll to experience" />
        </section>

        {/* ---------------- Marquee ---------------- */}
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span className="marquee-item" key={i}>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ---------------- Experience ---------------- */}
        <section className="section" id="experience" aria-labelledby="experience-title">
          <div className="container">
            <SectionHead
              eyebrow="Experience"
              title={
                <span id="experience-title">
                  Where I’ve <span className="grad-text">shipped</span>
                </span>
              }
              sub="From a pre-launch fintech startup to university research: LLM systems that do real work, measured by real numbers."
            />
            <div className="timeline">
              {experience.map((job, i) => (
                <article className="card glow job" id={`exp-${job.id}`} key={job.id} data-reveal style={{ '--delay': `${i * 80}ms` }}>
                  <div className="job-meta">
                    <span className="job-dates">{job.dates}</span>
                    <span className="job-place">{job.place}</span>
                    {job.link && (
                      <a className="ext-link" href={job.link.href} target="_blank" rel="noopener" style={{ marginTop: 6 }}>
                        {job.link.label} ↗
                      </a>
                    )}
                  </div>
                  <div>
                    <h3 className="job-org">{job.org}</h3>
                    <p className="job-role">{job.role}</p>
                    {job.note && <p className="job-note">{job.note}</p>}
                    <p className="job-intro">{job.intro}</p>
                    <ul className="bullets">
                      {job.bullets.map((b) => (
                        <li key={b.id}>{b.text}</li>
                      ))}
                    </ul>
                    <ul className="tags" aria-label="Tools">
                      {job.tags.map((t) => (
                        <li className="tag" key={t}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Projects ---------------- */}
        <section className="section" id="projects" aria-labelledby="projects-title" style={{ paddingTop: 0 }}>
          <div className="container">
            <SectionHead
              eyebrow="Projects"
              title={
                <span id="projects-title">
                  Questions I <span className="grad-text">answered</span>
                </span>
              }
              sub="Each project starts with a question and ends with a measured answer. The charts are interactive."
            />
            <div className="projects">
              {projects.map((p, i) => (
                <article
                  className={`card glow project${p.chart ? '' : ' no-visual'}`}
                  id={`project-${p.id}`}
                  key={p.id}
                  data-reveal
                >
                  <div>
                    <span className="project-num">0{i + 1}</span>
                    <p className="project-kicker">{p.kicker}</p>
                    <h3 className="project-name">{p.name}</h3>
                    <p className="project-question">{p.question}</p>
                    <ul className="bullets">
                      {p.bullets.map((b) => (
                        <li key={b.id}>{b.text}</li>
                      ))}
                    </ul>
                    <ul className="tags" aria-label="Tools">
                      {p.tags.map((t) => (
                        <li className="tag" key={t}>
                          {t}
                        </li>
                      ))}
                    </ul>
                    {(p.link || p.id === 'llama') && (
                      <div className="project-links">
                        {p.link && (
                          <a className="ext-link" href={p.link.href} target="_blank" rel="noopener">
                            {p.link.label} ↗
                          </a>
                        )}
                        {p.id === 'llama' && (
                          <a className="ext-link" href="#lab">
                            Try it live in the AI Lab →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {p.chart === 'vlm' && <VlmChart data={vlmResults} />}
                  {p.chart === 'llama' && <LlamaChart data={llamaResults} />}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- AI Lab ---------------- */}
        <section className="section lab" id="lab" aria-labelledby="lab-title" style={{ paddingTop: 0 }}>
          <div className="container">
            <SectionHead
              eyebrow="AI Lab"
              title={
                <span id="lab-title">
                  Don’t just read it. <span className="grad-text">Test it.</span>
                </span>
              }
              sub="Three working AI tools, built into this site. Each one shows a skill from my resume: retrieval with citations, structured LLM output checked by code, and a model I fine-tuned."
            />
            <div data-reveal>
              <AiLab />
            </div>
          </div>
        </section>

        {/* ---------------- Research ---------------- */}
        <section className="section" id="publications" aria-labelledby="pubs-title" style={{ paddingTop: 0 }}>
          <div className="container">
            <SectionHead
              eyebrow="Research"
              title={
                <span id="pubs-title">
                  Peer-reviewed <span className="grad-text">publications</span>
                </span>
              }
            />
            <div className="pubs">
              {publications.items.map((pub, i) => (
                <article className="card glow pub" key={pub.id} data-reveal style={{ '--delay': `${i * 80}ms` }}>
                  <span className="pub-venue">
                    {pub.venue} · {pub.year} · {pub.role}
                  </span>
                  <h3>{pub.title}</h3>
                  {pub.href && (
                    <a className="ext-link" href={pub.href} target="_blank" rel="noopener">
                      Read the paper ↗
                    </a>
                  )}
                </article>
              ))}
            </div>
            <div className="card pub-summary" data-reveal>
              <p>
                <span className="grad-text" style={{ fontWeight: 700 }}>
                  5 peer-reviewed papers
                </span>{' '}
                (2 first-author, 50+ citations), including{' '}
                <a className="ext-link" href={publications.icictHref} target="_blank" rel="noopener">
                  IEEE ICICT 2023
                </a>
                .
              </p>
              <a className="btn" href={person.links.orcid} target="_blank" rel="noopener">
                Full list on ORCID ↗
              </a>
            </div>
          </div>
        </section>

        {/* ---------------- Skills ---------------- */}
        <section className="section" id="skills" aria-labelledby="skills-title" style={{ paddingTop: 0 }}>
          <div className="container">
            <SectionHead
              eyebrow="Skills"
              title={
                <span id="skills-title">
                  The <span className="grad-text">toolkit</span>
                </span>
              }
            />
            <div className="skills">
              {skills.map((g, i) => (
                <div className="card glow skill-group" key={g.id} data-reveal style={{ '--delay': `${i * 80}ms` }}>
                  <h3>{g.group}</h3>
                  <ul className="tags">
                    {g.items.map((t) => (
                      <li className="tag" key={t}>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Education ---------------- */}
        <section className="section" id="education" aria-labelledby="edu-title" style={{ paddingTop: 0 }}>
          <div className="container">
            <SectionHead
              eyebrow="Education & certifications"
              title={
                <span id="edu-title">
                  Trained &amp; <span className="grad-text">certified</span>
                </span>
              }
            />
            <div className="edu-grid">
              <div className="edu-list">
                {education.map((e, i) => (
                  <div className="card glow edu" key={e.id} data-reveal style={{ '--delay': `${i * 80}ms` }}>
                    <h3>{e.degree}</h3>
                    <p>
                      {e.school} · {e.place}
                    </p>
                    <div className="row">
                      <span>{e.gpa}</span>
                      <span>{e.date}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cert-list">
                {certifications.map((c, i) => (
                  <a className="card cert" key={c.id} href={c.href} target="_blank" rel="noopener" data-reveal style={{ '--delay': `${i * 80}ms` }}>
                    <div>
                      <strong>{c.name}</strong>
                      <span>{c.issuer}</span>
                    </div>
                    <span className="arrow" aria-hidden="true">
                      ↗
                    </span>
                    <span className="sr-only">(verify credential)</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Contact ---------------- */}
        <section className="section" id="contact" aria-labelledby="contact-title" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="card contact" data-reveal>
              <span className="eyebrow">Contact</span>
              <h2 id="contact-title">
                Let’s build something <span className="grad-text">that works.</span>
              </h2>
              <p>Email is the fastest way to reach me. My resume, LinkedIn, and this site tell the same story.</p>
              <div className="hero-actions">
                <a className="btn btn-primary" href={`mailto:${person.email}`}>
                  {person.email}
                </a>
                <a className="btn" href={RESUME_PATH} target="_blank" rel="noopener">
                  Download resume
                </a>
              </div>
              <div className="social">
                <a href={person.links.linkedin} target="_blank" rel="noopener">
                  LinkedIn ↗
                </a>
                <a href={person.links.github} target="_blank" rel="noopener">
                  GitHub ↗
                </a>
                <a href={person.links.orcid} target="_blank" rel="noopener">
                  ORCID ↗
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <span>
            © {new Date().getFullYear()} {person.name}
          </span>
          <span>Built with Next.js · AI features run on open models</span>
        </div>
      </footer>
    </>
  );
}
