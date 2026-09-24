// Turns content/profile.js into small, citable passages ("chunks").
//
// Each chunk has a stable id, a human title, the text the LLM may quote, and
// an anchor on the page, so every AI answer can link back to the exact section
// it came from.

import {
  person,
  experience,
  projects,
  vlmResults,
  llamaResults,
  publications,
  education,
  skills,
  certifications,
} from '../content/profile.js';

function build() {
  const chunks = [];

  chunks.push({
    id: 'about',
    title: 'About',
    href: '#top',
    text: `${person.name} is an ${person.title} based in ${person.location}. ${person.summary} Contact: ${person.email}. LinkedIn: ${person.links.linkedin}. GitHub: ${person.links.github}.`,
  });

  for (const job of experience) {
    chunks.push({
      id: `${job.id}-overview`,
      title: job.short,
      href: `#exp-${job.id}`,
      text: `${job.role} at ${job.org} (${job.place}), ${job.dates}.${job.note ? ` ${job.note}.` : ''} ${job.intro} Tools: ${job.tags.join(', ')}.`,
    });
    for (const b of job.bullets) {
      chunks.push({
        id: b.id,
        title: job.short,
        href: `#exp-${job.id}`,
        text: `${job.role} at ${job.org}: ${b.text}`,
      });
    }
  }

  for (const p of projects) {
    chunks.push({
      id: `${p.id}-overview`,
      title: p.name,
      href: `#project-${p.id}`,
      text: `Project: ${p.name} (${p.kicker}). Question it answers: ${p.question} Tools: ${p.tags.join(', ')}.`,
    });
    for (const b of p.bullets) {
      chunks.push({ id: b.id, title: p.name, href: `#project-${p.id}`, text: `${p.name}: ${b.text}` });
    }
  }

  chunks.push({
    id: 'vlm-numbers',
    title: 'VLM study — results',
    href: '#project-vlm',
    text: `VLM chart study results: ${vlmResults.dimension.map((d) => `${d.label} ${d.value}%`).join(', ')}; ${vlmResults.dataLabels
      .map((d) => `${d.label.toLowerCase()} ${d.value}%`)
      .join(', ')}.`,
  });

  chunks.push({
    id: 'llama-numbers',
    title: 'Finance-tuned Llama — benchmark scores',
    href: '#project-llama',
    text: `Finance-tuned Llama 3.2 1B benchmark scores (base / earlier run / final): ${llamaResults.benchmarks
      .map((b) => `${b.name} ${b.base}% / ${b.v6}% / ${b.v7}%`)
      .join('; ')}.`,
  });

  for (const pub of publications.items) {
    chunks.push({
      id: pub.id,
      title: 'Publications',
      href: '#publications',
      text: `Publication (${pub.role.toLowerCase()}): "${pub.title}", ${pub.venue}, ${pub.year}.`,
    });
  }
  chunks.push({ id: 'pub-summary', title: 'Publications', href: '#publications', text: `Publications: ${publications.summary}` });

  for (const e of education) {
    chunks.push({
      id: e.id,
      title: 'Education',
      href: '#education',
      text: `Education: ${e.degree}, ${e.school}, ${e.place}, ${e.gpa}, ${e.date}.`,
    });
  }

  for (const s of skills) {
    chunks.push({ id: s.id, title: `Skills — ${s.group}`, href: '#skills', text: `Skills, ${s.group}: ${s.items.join(', ')}.` });
  }

  chunks.push({
    id: 'certifications',
    title: 'Certifications',
    href: '#education',
    text: `Certifications: ${certifications.map((c) => `${c.name} (${c.issuer})`).join('; ')}.`,
  });

  return chunks;
}

export const CHUNKS = build();
export const CHUNK_BY_ID = new Map(CHUNKS.map((c) => [c.id, c]));
