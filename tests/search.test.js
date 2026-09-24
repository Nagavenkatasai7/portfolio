import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, tokenize } from '../lib/search.js';
import { CHUNKS, CHUNK_BY_ID } from '../lib/knowledge.js';

test('every chunk has a unique id, title, anchor and text', () => {
  assert.equal(CHUNK_BY_ID.size, CHUNKS.length);
  for (const c of CHUNKS) {
    assert.ok(c.id && c.title && c.text, c.id);
    assert.match(c.href, /^#/);
  }
});

test('tokenize normalizes fine-tuning phrasings to the same terms', () => {
  const a = tokenize('fine-tuning');
  const b = tokenize('Fine tuned');
  assert.ok(a.includes('lora') && b.includes('lora'));
});

const top = (q) => search(q, 3).map((c) => c.id);

test('finds the Llama project for fine-tuning questions', () => {
  assert.ok(top('Has Naga fine-tuned a model?').some((id) => id.startsWith('llama')));
});

test('finds SmartRemit for payments questions', () => {
  assert.ok(top('How did Naga prevent double payments?').includes('smartremit-payments'));
});

test('finds the VLM study for 3D chart questions', () => {
  assert.ok(top('What happened with 3D charts?').some((id) => id.startsWith('vlm')));
});

test('finds certifications', () => {
  assert.ok(top('Which certifications does Naga hold?').includes('certifications'));
});

test('returns nothing for stopword-only queries', () => {
  assert.deepEqual(search('what is the', 3), []);
});
