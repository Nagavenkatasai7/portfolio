// tests/lossmask.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TOKENS, maskLoss } from '../lib/coldstart/lossmask.js';
test('demo has 60 tokens, 41 assistant', () => {
  assert.equal(DEMO_TOKENS.length, 60);
  assert.equal(DEMO_TOKENS.filter(t => t.role === 'assistant').length, 41);
});
test('bug state trains on prompt tokens; fixed state masks to assistant only', () => {
  assert.equal(maskLoss(DEMO_TOKENS, { assistantOnly: false }).contributing, 60);
  const fixed = maskLoss(DEMO_TOKENS, { assistantOnly: true });
  assert.equal(fixed.contributing, 41);
  assert.ok(fixed.perToken.filter(p => p.role === 'user').every(p => !p.contributes && p.loss === 0));
});
