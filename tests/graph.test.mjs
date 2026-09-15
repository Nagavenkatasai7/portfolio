// tests/graph.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, NODES, EDGES, NODE_IDS, GRAPH, nodeById, FORBIDDEN } from '../lib/graph.js';

test('16 unique node ids, all in NODE_IDS', () => {
  assert.equal(NODES.length, 16);
  assert.equal(new Set(NODE_IDS).size, 16);
  for (const n of NODES) assert.ok(NODE_IDS.includes(n.id));
});

test('every node has lane, lod levels, pos, size, run, provenance on metrics', () => {
  for (const n of NODES) {
    assert.ok(LANES.includes(n.lane), n.id);
    assert.equal(typeof n.lod[0], 'string');
    assert.ok(n.lod[0].length <= 90, `${n.id} lod0 too long`);
    assert.ok(Array.isArray(n.lod[1]));
    assert.ok(Array.isArray(n.lod[2].body));
    assert.equal(typeof n.pos.x, 'number'); assert.equal(typeof n.pos.y, 'number');
    assert.equal(n.size.w, 320);
    assert.equal(typeof n.run.durationMs, 'number');
    for (const m of n.metrics) assert.ok(['resume', 'computed'].includes(m.provenance), `${n.id}:${m.label}`);
  }
});

test('edges reference existing nodes and form a DAG', () => {
  const ids = new Set(NODE_IDS);
  for (const e of EDGES) { assert.ok(ids.has(e.from), e.from); assert.ok(ids.has(e.to), e.to); }
  const indeg = Object.fromEntries(NODE_IDS.map(id => [id, 0]));
  for (const e of EDGES) indeg[e.to]++;
  const q = NODE_IDS.filter(id => indeg[id] === 0); let seen = 0;
  const out = {}; for (const e of EDGES) (out[e.from] ||= []).push(e.to);
  while (q.length) { const id = q.shift(); seen++; for (const t of out[id] || []) if (--indeg[t] === 0) q.push(t); }
  assert.equal(seen, NODE_IDS.length, 'cycle detected');
});

test('NODES order is a valid topological order (DOM order = tab order)', () => {
  const idx = Object.fromEntries(NODE_IDS.map((id, i) => [id, i]));
  for (const e of EDGES) assert.ok(idx[e.from] < idx[e.to], `${e.from} must precede ${e.to}`);
});

test('exactly one halting node: loss-mask.patch', () => {
  const halts = NODES.filter(n => n.run.halts).map(n => n.id);
  assert.deepEqual(halts, ['loss-mask.patch']);
  assert.equal(nodeById('loss-mask.patch').run.patchKey, 'P');
});

test('no forbidden strings anywhere in the graph', () => {
  assert.doesNotMatch(JSON.stringify(GRAPH), FORBIDDEN);
});

test('résumé anchors present verbatim', () => {
  const s = JSON.stringify(GRAPH);
  for (const needle of ['AI Systems Engineer', 'Research Assistant', 'Aug 2020 - May 2024', 'Aug 2025 - May 2026', 'GPA 3.57/4.00', 'TRL v0.20.0', 'p = 0.0003', '6,000', '4x NVIDIA H100', 'Pydantic v2', 'nagavenkatasaichennu@gmail.com']) {
    assert.ok(s.includes(needle), `missing: ${needle}`);
  }
});

// The skills tiers are the one node a recruiter screens on, and the last drift
// between these two files moved every difference upward. Assert the tier payloads
// in the graph are the persona's, verbatim.
test('skills.registry tiers match the résumé tiers in the persona', async () => {
  const { SYSTEM_PROMPT } = await import('../api/_persona.mjs');
  const tiers = nodeById('skills.registry').lod[1];
  assert.equal(tiers.length, 3);
  for (const tier of tiers) {
    const payload = tier.slice(tier.indexOf(':') + 1).trim();
    assert.ok(payload.length > 20, tier);
    assert.ok(SYSTEM_PROMPT.includes(payload), `tier drifted from the persona: ${payload}`);
  }
});
