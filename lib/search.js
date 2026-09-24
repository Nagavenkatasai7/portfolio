// BM25 keyword retrieval over the knowledge chunks.
//
// The corpus is small (~40 passages), so an in-memory index built once per
// server instance is instant and needs no embedding API or vector database.

import { CHUNKS } from './knowledge.js';

const STOP = new Set(
  'a an and are as at be by did do does for from has have he her his how i in is it its me my of on or our she that the their them they this to was what when where which who why will with you your about tell can any has had been into than then there these those also'.split(
    ' ',
  ),
);

// Maps common recruiter phrasings onto the words the profile actually uses.
const SYNONYMS = {
  llm: ['llm', 'language', 'model'],
  llms: ['llm', 'language', 'model'],
  finetune: ['fine', 'tune', 'lora', 'peft'],
  finetuning: ['fine', 'tune', 'lora', 'peft'],
  finetuned: ['fine', 'tune', 'lora', 'peft'],
  agent: ['agent', 'tool', 'calling', 'chatbot'],
  agents: ['agent', 'tool', 'calling', 'chatbot'],
  agentic: ['agent', 'tool', 'calling'],
  eval: ['evaluat', 'benchmark'],
  evals: ['evaluat', 'benchmark'],
  evaluation: ['evaluat', 'benchmark'],
  vision: ['vision', 'vlm', 'multimodal', 'image'],
  multimodal: ['multimodal', 'vision', 'image', 'vlm'],
  startup: ['smartremit', 'founder', 'startup'],
  founder: ['smartremit', 'founder'],
  payment: ['payment', 'idempotency', 'outbox'],
  payments: ['payment', 'idempotency', 'outbox'],
  research: ['research', 'publish', 'paper', 'study'],
  papers: ['paper', 'publish', 'publication'],
  school: ['university', 'education', 'degree'],
  degree: ['degree', 'university', 'education'],
  gpa: ['gpa', 'education'],
  experience: ['engineer', 'research', 'founder'],
  contact: ['contact', 'email', 'linkedin'],
  email: ['email', 'contact'],
  cloud: ['aws', 'vercel', 'docker', 'cloud'],
  certified: ['certification'],
  certification: ['certification'],
  certifications: ['certification'],
};

function stem(word) {
  return word
    .replace(/(ations?|ation)$/, 'at')
    .replace(/(ings?|ed|es|s)$/, '')
    .replace(/[^a-z0-9]/g, '');
}

export function tokenize(text) {
  const raw = String(text)
    .toLowerCase()
    .replace(/fine[\s-]?tun/g, 'finetun')
    .split(/[^a-z0-9%.+#]+/)
    .map((w) => w.replace(/^[.]+|[.]+$/g, ''))
    .filter((w) => w && !STOP.has(w));
  const out = [];
  for (const w of raw) {
    const extra = SYNONYMS[w];
    if (extra) out.push(...extra.map(stem));
    const s = stem(w);
    if (s) out.push(s);
  }
  return out;
}

function buildIndex(docs) {
  const tf = docs.map((d) => {
    const counts = new Map();
    for (const t of tokenize(`${d.title} ${d.text}`)) counts.set(t, (counts.get(t) || 0) + 1);
    return counts;
  });
  const lengths = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const avgLen = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const df = new Map();
  for (const m of tf) for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
  return { docs, tf, lengths, avgLen, df, n: docs.length };
}

const INDEX = buildIndex(CHUNKS);

// Returns the top-k chunks for a query, best first, each with its BM25 score.
export function search(query, k = 6, index = INDEX) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const k1 = 1.4;
  const b = 0.75;
  const scored = index.docs.map((doc, i) => {
    let score = 0;
    for (const t of terms) {
      const f = index.tf[i].get(t) || 0;
      if (!f) continue;
      const df = index.df.get(t) || 0;
      const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.lengths[i]) / index.avgLen)));
    }
    return { ...doc, score };
  });
  return scored
    .filter((d) => d.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}
