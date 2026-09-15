// tests/stats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mcnemarExact, anovaF } from '../lib/coldstart/stats.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('mcnemarExact known values', () => {
  assert.ok(close(mcnemarExact(0, 12), 2 / 4096));
  assert.equal(mcnemarExact(5, 5), 1);
  assert.ok(close(mcnemarExact(1, 9), 2 * (1 + 10) / 1024));
  assert.equal(mcnemarExact(0, 0), 1);
  assert.ok(close(mcnemarExact(3, 20), mcnemarExact(20, 3)));
});

test('anovaF on identical groups is 0, on separated groups is large', () => {
  assert.equal(anovaF([[1, 1, 1], [1, 1, 1]]).F, 0);
  const r = anovaF([[1, 2, 3], [11, 12, 13], [21, 22, 23]]);
  assert.ok(r.F > 100);
  assert.equal(r.dfBetween, 2); assert.equal(r.dfWithin, 6);
});
