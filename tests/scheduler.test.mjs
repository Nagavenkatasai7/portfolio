// tests/scheduler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH } from '../lib/graph.js';
import { createScheduler, topoOrder, edgeKey } from '../lib/coldstart/scheduler.js';

const instant = { wait: async () => {}, now: () => 0 };

test('topoOrder respects edges and node order', () => {
  const order = topoOrder(GRAPH);
  const idx = Object.fromEntries(order.map((id, i) => [id, i]));
  for (const e of GRAPH.edges) assert.ok(idx[e.from] < idx[e.to]);
  assert.equal(order.length, GRAPH.nodes.length);
});

test('run halts at loss-mask.patch, patch resumes to complete', async () => {
  const s = createScheduler(GRAPH, instant);
  await s.run();
  let st = s.getState();
  assert.equal(st.run, 'halted');
  assert.equal(st.nodes['loss-mask.patch'], 'failed');
  assert.equal(st.nodes['chartx.eval'], 'queued');
  await s.patch();
  st = s.getState();
  assert.equal(st.run, 'complete');
  assert.equal(st.nodes['loss-mask.patch'], 'done');
  assert.equal(st.nodes['ask-naga'], 'done');
  assert.equal(st.receipt.nodes, GRAPH.nodes.length);
  assert.equal(st.receipt.unevaluated, false);
});

test('cutting both EVAL->SERVE edges marks the run unevaluated', async () => {
  const s = createScheduler(GRAPH, instant);
  s.cutEdge(edgeKey({ from: 'regression.suite', to: 'extract.svc' }));
  s.cutEdge(edgeKey({ from: 'chartx.eval', to: 'extract.svc' }));
  await s.run(); await s.patch();
  assert.equal(s.getState().unevaluated, true);
  assert.equal(s.getState().receipt.unevaluated, true);
});

test('step advances exactly one node and never waits', async () => {
  let waited = false;
  const s = createScheduler(GRAPH, { wait: async () => { waited = true; }, now: () => 0 });
  await s.step();
  const st = s.getState();
  assert.equal(Object.values(st.nodes).filter(v => v === 'done').length, 1);
  assert.equal(waited, false);
});

test('onChange fires with fresh state copies', async () => {
  const seen = [];
  const s = createScheduler(GRAPH, { ...instant, onChange: (st) => seen.push(st) });
  await s.run();
  assert.ok(seen.length >= 3);
  assert.notEqual(seen[0], seen[1]);
});

// The halt is the page's whole narrative beat. `beginRun` clears `patched`, so
// replaying with R walks into the same failure instead of straight past it.
test('replaying a completed run halts at loss-mask.patch again', async () => {
  const s = createScheduler(GRAPH, instant);
  await s.run();
  await s.patch();
  assert.equal(s.getState().run, 'complete');

  await s.run();
  const st = s.getState();
  assert.equal(st.run, 'halted');
  assert.equal(st.nodes['loss-mask.patch'], 'failed');
  assert.equal(st.patched, false);

  await s.patch();
  assert.equal(s.getState().run, 'complete');
});
