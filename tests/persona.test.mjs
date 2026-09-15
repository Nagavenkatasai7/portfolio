import test from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT } from '../api/_persona.mjs';
import { NODE_IDS } from '../lib/graph.js';

test('persona is résumé-aligned and lists every node id in navigation mode', () => {
  assert.ok(SYSTEM_PROMPT.includes('AI Systems Engineer'));
  assert.ok(SYSTEM_PROMPT.includes('Research Assistant'));
  assert.ok(SYSTEM_PROMPT.includes('nagavenkatasaichennu@gmail.com'));
  assert.ok(!SYSTEM_PROMPT.includes('nchennu@gmu.edu'));
  assert.ok(!/Salesforce|test automation/i.test(SYSTEM_PROMPT));
  assert.ok(SYSTEM_PROMPT.includes('NAVIGATION MODE'));
  for (const id of NODE_IDS) assert.ok(SYSTEM_PROMPT.includes(id), id);
});
