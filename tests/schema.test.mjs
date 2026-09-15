import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, FILING_SCHEMA, SAMPLE_OK, SAMPLE_BAD } from '../lib/coldstart/schema.js';
test('sample payloads', () => {
  assert.deepEqual(validate(FILING_SCHEMA, SAMPLE_OK), { ok: true });
  const bad = validate(FILING_SCHEMA, SAMPLE_BAD);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.includes('claims_count')));
  assert.ok(bad.errors.some(e => e.includes('status')));
});
test('required and pattern', () => {
  assert.equal(validate({ type: 'object', required: ['a'], properties: { a: { type: 'string', pattern: '^x' } } }, {}).ok, false);
  assert.equal(validate({ type: 'object', required: ['a'], properties: { a: { type: 'string', pattern: '^x' } } }, { a: 'xy' }).ok, true);
});
