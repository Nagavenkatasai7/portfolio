// lib/coldstart/match.js
// Deterministic keyword / job-description matcher over the graph.
// Pure: no DOM, no network, no randomness, no dates. The same text always
// produces the same ranking, which is what lets the UI print what it read.

// Synonym folding: the left-hand forms all collapse to the right-hand token,
// so a job description that says "torch" and a node that says "PyTorch" meet.
const SYNONYMS = new Map(Object.entries({
  torch: 'pytorch',
  pytorch: 'pytorch',
  llm: 'llm',
  llms: 'llm',
  eval: 'eval',
  evals: 'eval',
  evaluation: 'eval',
  'fine-tune': 'sft',
  'fine-tuned': 'sft',
  'fine-tuning': 'sft',
  finetune: 'sft',
  finetuning: 'sft',
  sft: 'sft',
  rag: 'rag',
  retrieval: 'rag',
  agent: 'agent',
  agents: 'agent',
  agentic: 'agent',
  mcp: 'mcp',
  slurm: 'slurm',
  cuda: 'cuda',
  h100: 'h100',
}));

// Function words plus job-description filler. These carry no signal about which
// node answers the question, and left in they would rank every node equally.
const STOPWORDS = new Set([
  'a', 'about', 'above', 'across', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'been', 'being', 'both', 'but', 'by',
  'can', 'could',
  'did', 'do', 'does', 'doing', 'done', 'down', 'during',
  'each', 'either', 'etc', 'every',
  'few', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how',
  'if', 'in', 'into', 'is', 'it', 'its',
  'just',
  'like',
  'may', 'me', 'might', 'more', 'most', 'much', 'must', 'my',
  'need', 'needed', 'needs', 'no', 'nor', 'not', 'now',
  'of', 'off', 'on', 'once', 'one', 'only', 'or', 'other', 'others', 'our', 'ours', 'out', 'over', 'own',
  'per',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too',
  'under', 'until', 'up', 'upon', 'us', 'use', 'used', 'using',
  'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will',
  'with', 'within', 'would',
  'you', 'your', 'yours',
  // job-description filler
  'ability', 'applicant', 'applicants', 'candidate', 'candidates', 'company', 'day', 'days',
  'excellent', 'experience', 'experienced', 'good', 'great', 'help', 'ideal', 'job', 'join',
  'looking', 'month', 'months', 'nice', 'opportunity', 'plus', 'position', 'preferred', 'proven',
  'qualification', 'qualifications', 'required', 'requirement', 'requirements', 'responsibilities',
  'responsibility', 'role', 'roles', 'skill', 'skills', 'strong', 'team', 'teams', 'want', 'wanted',
  'year', 'years',
]);

const WORD_RE = /[a-z0-9]+(?:-[a-z0-9]+)*/g;

const MIN_LEN = 2;

function depluralize(token) {
  if (token.length >= 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

// fold(raw) -> canonical token. Synonyms first, then a light plural strip
// (applied identically to query text and node text, so the two always agree).
function fold(raw) {
  const direct = SYNONYMS.get(raw);
  if (direct) return direct;
  const singular = depluralize(raw);
  return SYNONYMS.get(singular) || singular;
}

/**
 * Lowercase word tokens, length >= 2, de-duplicated, synonyms folded.
 * A hyphenated word that is not itself a synonym also contributes its parts,
 * so "llm-forge" is reachable from "forge".
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (typeof text !== 'string' || text === '') return [];
  const out = [];
  const seen = new Set();
  const push = (token) => {
    if (token.length < MIN_LEN || STOPWORDS.has(token) || seen.has(token)) return;
    seen.add(token);
    out.push(token);
  };
  const raws = String(text).toLowerCase().match(WORD_RE) || [];
  for (const raw of raws) {
    const folded = fold(raw);
    push(folded);
    // Only split a hyphenated form that folding did not already claim, so
    // "fine-tuning" stays a single "sft" token.
    if (folded === raw && raw.includes('-')) {
      for (const part of raw.split('-')) push(fold(part));
    }
  }
  return out;
}

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  return String(value);
}

const INDEX_CACHE = new WeakMap();

// Two token sets per node: `strong` (title + human, weight 3) and `rest`
// (lod0, lod1, lod2 body, metric labels and values, link labels, weight 1).
function indexOf(node) {
  const cached = INDEX_CACHE.get(node);
  if (cached) return cached;
  const lod = node.lod || {};
  const lod2 = lod[2] || {};
  const strongText = [node.title, node.human].map(textOf).join(' ');
  const restText = [
    textOf(lod[0]),
    textOf(lod[1]),
    textOf(lod2.body),
    textOf((node.metrics || []).map((m) => `${textOf(m.label)} ${textOf(m.value)}`)),
    textOf((node.links || []).map((l) => textOf(l.label))),
  ].join(' ');
  const entry = { strong: new Set(tokenize(strongText)), rest: new Set(tokenize(restText)) };
  INDEX_CACHE.set(node, entry);
  return entry;
}

const IDF_CACHE = new WeakMap();

// Rarity weighting. Without it "eval" (in half the nodes) outweighs "McNemar"
// (in three), and a JD about evaluation buries the evaluation nodes.
function idfFor(nodes) {
  const cached = IDF_CACHE.get(nodes);
  if (cached) return cached;
  const df = new Map();
  for (const node of nodes) {
    const { strong, rest } = indexOf(node);
    for (const term of new Set([...strong, ...rest])) df.set(term, (df.get(term) || 0) + 1);
  }
  const n = nodes.length;
  const idf = new Map();
  for (const [term, count] of df) idf.set(term, Math.log(1 + n / count));
  IDF_CACHE.set(nodes, idf);
  return idf;
}

const round = (x) => Math.round(x * 1e6) / 1e6;

/**
 * Rank nodes against free text or a pasted job description.
 * @param {string} text
 * @param {Array<object>} nodes
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ id: string, score: number, terms: string[] }>} score-descending, score > 0 only
 */
export function match(text, nodes, { limit = 6 } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const terms = tokenize(text);
  if (terms.length === 0) return [];
  const idf = idfFor(nodes);
  const scored = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const { strong, rest } = indexOf(node);
    let score = 0;
    const hits = [];
    for (const term of terms) {
      const weight = (strong.has(term) ? 3 : 0) + (rest.has(term) ? 1 : 0);
      if (weight === 0) continue;
      hits.push(term);
      score += weight * (idf.get(term) || 0);
    }
    if (score > 0) scored.push({ id: node.id, score, terms: hits, order: i });
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored
    .slice(0, Math.max(0, limit))
    .map(({ id, score, terms: hits }) => ({ id, score: round(score), terms: hits }));
}

/**
 * The honest caption: what the matcher read, and how many nodes it lit.
 * @param {Array<object>} result - output of match()
 * @param {string[]|string} terms - output of tokenize(), or raw text
 * @returns {string}
 */
export function readAs(result, terms) {
  const list = Array.isArray(terms) ? terms.filter((t) => typeof t === 'string') : tokenize(terms);
  const top = list.slice(0, 3).join(', ') || 'nothing recognised';
  const count = Array.isArray(result) ? result.length : 0;
  return `read as: ${top} -> ${count} nodes`;
}
