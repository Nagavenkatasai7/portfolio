import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordFit, matchJob, normalizeFit, validateJobDescription } from '../lib/fit.js';

const JD =
  'AI Engineer. You will build LLM agents with tool calling and RAG, fine-tune models with LoRA, run evaluations, and deploy on AWS. Kubernetes experience preferred. Must know Python.';

test('validateJobDescription enforces length bounds', () => {
  assert.ok(validateJobDescription('short').error);
  assert.ok(validateJobDescription('x'.repeat(8001)).error);
  assert.ok(validateJobDescription(JD).jd);
});

test('normalizeFit drops unknown evidence ids and downgrades unsupported claims', () => {
  const fit = normalizeFit({
    role: 'AI Engineer',
    requirements: [
      { requirement: 'LoRA fine-tuning', match: 'strong', evidence: ['llama-train', 'made-up'], explanation: 'ok' },
      { requirement: 'Kubernetes', match: 'strong', evidence: ['made-up'], explanation: 'claimed' },
      { requirement: 'Go', match: 'partial', evidence: [], explanation: '' },
      { requirement: 'Weird', match: 'amazing', evidence: ['llama-train'] },
      { requirement: '', match: 'strong', evidence: ['llama-train'] },
    ],
  });
  const byName = Object.fromEntries(fit.requirements.map((r) => [r.requirement, r]));
  assert.equal(byName['LoRA fine-tuning'].match, 'strong');
  assert.deepEqual(byName['LoRA fine-tuning'].evidence.map((e) => e.id), ['llama-train']);
  assert.equal(byName.Kubernetes.match, 'gap');
  assert.equal(byName.Go.match, 'gap');
  assert.equal(byName.Weird.match, 'gap');
  assert.equal(fit.requirements.length, 4);
});

test('normalizeFit rejects unusable output', () => {
  assert.equal(normalizeFit(null), null);
  assert.equal(normalizeFit({ requirements: 'nope' }), null);
  assert.equal(normalizeFit({ requirements: [] }), null);
});

test('keywordFit matches on word boundaries and reports gaps', () => {
  const r = keywordFit(JD);
  const byName = Object.fromEntries(r.requirements.map((x) => [x.requirement, x.match]));
  assert.equal(byName['Fine-tuning (LoRA / PEFT)'], 'strong');
  assert.equal(byName.Kubernetes, 'gap');
  assert.equal(keywordFit('We need rapid growth and capital. '.repeat(3)).requirements.some((x) => x.requirement.startsWith('APIs')), false);
});

test('matchJob falls back to keywords when the LLM returns junk', async () => {
  const r = await matchJob(JD, { complete: async () => ({ text: 'sorry, no JSON here', model: 'fake' }) });
  assert.equal(r.mode, 'fallback');
  assert.ok(r.requirements.length > 0);
});

test('matchJob uses validated LLM output', async () => {
  const text = JSON.stringify({
    role: 'AI Engineer',
    requirements: [{ requirement: 'Python', match: 'strong', evidence: ['gmu-scraper'], explanation: 'Built a Python scraper.' }],
  });
  const r = await matchJob(JD, { complete: async () => ({ text: '```json\n' + text + '\n```', model: 'fake' }) });
  assert.equal(r.mode, 'llm');
  assert.equal(r.summary.score, 100);
});

test('keywordFit never trims away gaps and links each section once', () => {
  const jd =
    'Python, LLM agents with tool calling, RAG, LoRA fine-tuning, evaluation, PyTorch, Hugging Face, APIs, Docker, AWS, prompt engineering, Kubernetes, Spark, TensorFlow.';
  const r = keywordFit(jd);
  const names = r.requirements.map((x) => x.requirement);
  assert.ok(r.requirements.length <= 10);
  assert.ok(names.includes('Kubernetes') && names.includes('Spark / big data'), names.join(', '));
  for (const req of r.requirements) {
    const hrefs = req.evidence.map((e) => e.href);
    assert.equal(new Set(hrefs).size, hrefs.length, req.requirement);
  }
});
