// tests/match.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES } from '../lib/graph.js';
import { tokenize, match, readAs } from '../lib/coldstart/match.js';

test('tokenize folds synonyms', () => {
  assert.deepEqual(tokenize('PyTorch torch fine-tuning SFT'), ['pytorch', 'sft']);
});

test('JD mentioning PyTorch TRL SLURM ranks training nodes first', () => {
  const r = match('We need PyTorch, TRL and SLURM experience on H100 clusters for SFT', NODES);
  assert.ok(r.length >= 2);
  assert.ok(['llm-forge', 'loss-mask.patch', 'skills.registry'].includes(r[0].id));
  assert.ok(r.some(x => x.id === 'llm-forge'));
});

test('eval-heavy JD surfaces chartx.eval and regression.suite', () => {
  const r = match('evaluation harness, benchmark design, McNemar, error analysis', NODES);
  const ids = r.map(x => x.id);
  assert.ok(ids.includes('chartx.eval'));
  assert.ok(ids.includes('regression.suite'));
});

test('no match returns empty and readAs is honest', () => {
  const r = match('underwater basket weaving', NODES);
  assert.deepEqual(r, []);
  assert.equal(readAs(r, tokenize('underwater basket weaving')), 'read as: underwater, basket, weaving -> 0 nodes');
});
