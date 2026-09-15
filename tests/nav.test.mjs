// tests/nav.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNav } from '../lib/coldstart/nav.js';
const ids = ['a.node', 'b.node'];
test('valid reply parses', () => {
  assert.deepEqual(parseNav('Sure! {"node":"a.node","caption":"Look here"}', ids), { node: 'a.node', caption: 'Look here' });
});
test('unknown node, long caption, prose, and HTML-ish caption are rejected or sanitized', () => {
  assert.equal(parseNav('{"node":"zzz","caption":"x"}', ids), null);
  assert.equal(parseNav(`{"node":"a.node","caption":"${'x'.repeat(141)}"}`, ids), null);
  assert.equal(parseNav('I think you should look at a.node', ids), null);
  assert.equal(parseNav('{"node":"b.node","caption":"<b>hi</b>"}', ids).caption, '<b>hi</b>');
});
