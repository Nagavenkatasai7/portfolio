import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combine, createLimiter } from '../lib/ratelimit.js';

test('allows up to max per window, then blocks with retryAfter', () => {
  const check = createLimiter({ windowMs: 1000, max: 2 });
  assert.equal(check('ip', 0).ok, true);
  assert.equal(check('ip', 10).ok, true);
  const r = check('ip', 20);
  assert.equal(r.ok, false);
  assert.equal(r.retryAfter, 1);
  assert.equal(check('ip', 1001).ok, true);
  assert.equal(check('other', 20).ok, true);
});

test('combine enforces a global cap across keys', () => {
  const check = combine([createLimiter({ windowMs: 1000, max: 5 }), 'ip'], [createLimiter({ windowMs: 1000, max: 2 }), 'global']);
  assert.equal(check('a', 0).ok, true);
  assert.equal(check('b', 0).ok, true);
  assert.equal(check('c', 0).ok, false);
});
