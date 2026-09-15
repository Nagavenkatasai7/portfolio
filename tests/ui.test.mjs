// tests/ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NODES, NODE_IDS, FORBIDDEN, nodeById } from '../lib/graph.js';
import { ASK_INPUT_ID } from '../app/coldstart/AskNaga.js';
import Node from '../app/coldstart/Node.js';
import Coldstart from '../app/coldstart/Coldstart.js';
import RunLog from '../app/coldstart/RunLog.js';
import LossMask from '../app/coldstart/demos/LossMask.js';
import ChartX from '../app/coldstart/demos/ChartX.js';
import SchemaCheck from '../app/coldstart/demos/SchemaCheck.js';

test('Node renders article with id, lane, lod0 text, and expanded attribute', () => {
  const n = NODES.find(x => x.id === 'chartx.eval');
  const html = renderToStaticMarkup(React.createElement(Node, { node: n, state: 'idle', expanded: false, lod: 1, onToggle: () => {}, onFocus: () => {} }));
  assert.ok(html.includes('id="node-chartx.eval"'));
  assert.ok(html.includes('data-lane="EVAL"'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes(n.lod[0]));
});

// The stage is server-rendered: no component may reach window or document during
// render, or Next's own build would fail the same way this does.
test('Coldstart server-renders the whole stage', () => {
  const html = renderToStaticMarkup(React.createElement(Coldstart));
  for (const id of NODE_IDS) assert.ok(html.includes(`id="node-${id}"`), id);
  assert.ok(html.includes('id="world"'));
  assert.ok(html.includes('class="wires"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.doesNotMatch(html, FORBIDDEN);
});

test('escape hatch is the first focusable content, before any node', () => {
  const html = renderToStaticMarkup(React.createElement(Coldstart));
  const skip = html.indexOf('class="skip"');
  const escape = html.indexOf('aria-label="Quick actions"');
  const firstNode = html.indexOf('id="node-');
  assert.ok(skip > -1 && escape > -1 && firstNode > -1);
  assert.ok(skip < escape, 'skip link precedes the escape pill');
  assert.ok(escape < firstNode, 'escape pill precedes every node');
  // The href itself comes from the graph; tests/routing.test.mjs is what asserts
  // the file behind it is actually there.
  const resume = nodeById('identity.yaml').links.find(l => l.label === 'Résumé').href;
  assert.ok(html.includes(`href="${resume}"`));
  assert.ok(html.includes('href="/plain"'));
});

// spec §8: the ask-naga card claims an input, three suggestions and a JD matcher.
// It shipped once with none of them because AskNaga.js was imported by nothing.
test('ask-naga actually mounts its input, suggestions and mode toggle', () => {
  const html = renderToStaticMarkup(React.createElement(Coldstart));
  assert.ok(html.includes(`id="${ASK_INPUT_ID}"`), 'the ask input is on the page');
  assert.ok(html.includes('class="ask-form"'));
  for (const label of ['What has he shipped?', 'Can he do evals?', 'Where has he worked?']) {
    assert.ok(html.includes(label), label);
  }
  assert.ok(html.includes('Paste a job description'));
});

// The toggle is a real button: aria-expanded is not allowed on role=article, and
// a tabbable <article> with a hand-rolled Enter/Space handler announces as an
// article rather than as something operable.
test('the expand affordance is a button, not an aria-expanded article', () => {
  const html = renderToStaticMarkup(React.createElement(Coldstart));
  assert.ok(html.includes('class="node-toggle"'));
  assert.ok(/<button[^>]*class="node-toggle"[^>]*aria-expanded="false"/.test(html)
    || /<button[^>]*aria-expanded="false"[^>]*class="node-toggle"/.test(html));
  assert.ok(!/<article[^>]*aria-expanded/.test(html), 'aria-expanded must not sit on the article');
  assert.ok(!/<article[^>]*tabindex="0"/i.test(html), 'the article is not a tab stop');
});

test('DOM order is the topological node order, so tab order is too', () => {
  const html = renderToStaticMarkup(React.createElement(Coldstart));
  const rendered = [...html.matchAll(/id="node-([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(rendered, NODE_IDS);
});

// The run state is the seam Task 11 plugs the scheduler into: idle renders no log.
test('idle run state renders no run log', () => {
  const idle = renderToStaticMarkup(React.createElement(Coldstart));
  assert.ok(!idle.includes('class="runlog"'));
  const running = renderToStaticMarkup(
    React.createElement(Coldstart, { runState: 'running', runLogState: { run: 'running' } }),
  );
  assert.ok(running.includes('class="runlog"'));
});

/* ---------------------------------------------------------- Task 11: demos */

const allStates = (value) => Object.fromEntries(NODE_IDS.map((id) => [id, value]));

test('LossMask counts what contributes loss, before and after the fix', () => {
  const off = renderToStaticMarkup(React.createElement(LossMask, { patched: false }));
  assert.ok(off.includes('contributing loss: 60'), 'bug state trains on the prompt too');
  assert.ok(off.includes('trl==0.20.0'));
  assert.ok(off.includes('illustrative'));
  assert.ok(off.includes('<kbd>P</kbd>'), 'the fix is offered while the mask is off');

  const on = renderToStaticMarkup(React.createElement(LossMask, { patched: true }));
  assert.ok(on.includes('contributing loss: 41'), 'fixed state masks to assistant only');
  assert.ok(!on.includes('<kbd>P</kbd>'));
});

test('ChartX shows the treemap relabel and the résumé p value', () => {
  const html = renderToStaticMarkup(React.createElement(ChartX));
  assert.ok(html.includes('97.7'));
  assert.ok(html.includes('51.6'));
  assert.ok(html.includes('p = 0.0003'));
  assert.ok(html.includes('data-prov="resume"'));
  assert.ok(html.includes('the benchmark was the flaw, not the model'));
});

// spec §2.5: every rendered number carries provenance — including the bars, which
// are the largest and most persuasive numbers on the page.
test('every ChartX bar carries a provenance chip', () => {
  const html = renderToStaticMarkup(React.createElement(ChartX));
  const bars = (html.match(/class="chartx-bar"/g) || []).length;
  assert.ok(bars > 0, 'there are bars to check');
  const chips = (html.match(/class="prov"/g) || []).length;
  // one per bar, one per relabel value, one for the p value
  assert.ok(chips >= bars + 3, `${chips} chips for ${bars} bars plus the relabel pair and p`);
});

test('ChartX recomputes p in the browser when discordant counts are supplied', () => {
  const html = renderToStaticMarkup(React.createElement(ChartX, {
    data: {
      types: [{ name: 'treemap', accuracy: 0.516 }],
      treemap: { before: { accuracy: 0.516 }, after: { accuracy: 0.977 }, p: 0.0003, discordant: { b: 2, c: 41 } },
    },
  }));
  assert.ok(html.includes('data-prov="computed"'));
  assert.ok(!html.includes('p = 0.0003'));
});

test('SchemaCheck passes the good payload and rejects the bad one by field', () => {
  const html = renderToStaticMarkup(React.createElement(SchemaCheck));
  assert.ok(html.includes('PASS'));
  assert.ok(html.includes('FAIL'));
  assert.ok(html.includes('claims_count'));
  assert.ok(html.includes('status'));
  assert.ok(html.includes('wrong outputs are unrepresentable'));
});

test('Node renders its own demo once the card is at LOD 2', () => {
  const n = NODES.find((x) => x.id === 'loss-mask.patch');
  const at1 = renderToStaticMarkup(React.createElement(Node, { node: n, lod: 1 }));
  assert.ok(!at1.includes('contributing loss'), 'no demo cost until the card is readable');
  const at2 = renderToStaticMarkup(React.createElement(Node, { node: n, lod: 2 }));
  assert.ok(at2.includes('contributing loss: 60'));
  const patched = renderToStaticMarkup(React.createElement(Node, { node: n, lod: 2, patched: true }));
  assert.ok(patched.includes('contributing loss: 41'));
});

/* -------------------------------------------------------- Task 11: run log */

test('RunLog prints the halt line, the receipt, and the unevaluated warning', () => {
  const halted = renderToStaticMarkup(React.createElement(RunLog, {
    state: {
      run: 'halted',
      nodes: { ...allStates('queued'), 'identity.yaml': 'done', 'loss-mask.patch': 'failed' },
      patched: false,
      cut: [],
      unevaluated: false,
      current: 'loss-mask.patch',
      elapsedMs: 2600,
      receipt: null,
    },
  }));
  assert.ok(halted.includes('class="runlog"'));
  assert.ok(halted.includes(`HALTED 2/${NODE_IDS.length}`));
  assert.ok(halted.includes('mask=OFF'));
  assert.ok(halted.includes('press P to fix'));

  const done = renderToStaticMarkup(React.createElement(RunLog, {
    state: {
      run: 'complete',
      nodes: allStates('done'),
      patched: true,
      cut: ['regression.suite->extract.svc', 'chartx.eval->extract.svc'],
      unevaluated: true,
      current: null,
      elapsedMs: 11400,
      receipt: { nodes: NODE_IDS.length, elapsedMs: 11400, unevaluated: true },
    },
  }));
  assert.ok(done.includes(`run complete ${NODE_IDS.length}/${NODE_IDS.length}, 11.4s`));
  assert.ok(done.includes('Served an unevaluated model. This is exactly how a silent regression ships.'));
});

/* ------------------------------------------------- Task 11: scheduler seams */

test('Coldstart renders a running node, its packet, and the halt narration', () => {
  const html = renderToStaticMarkup(React.createElement(Coldstart, {
    runState: 'halted',
    nodeStates: { ...allStates('queued'), 'loss-mask.patch': 'failed' },
    activeEdge: 'llm-forge->loss-mask.patch',
    runLogState: {
      run: 'halted',
      nodes: { ...allStates('queued'), 'loss-mask.patch': 'failed' },
      patched: false,
      cut: [],
      unevaluated: false,
      current: 'loss-mask.patch',
      elapsedMs: 2600,
      receipt: null,
    },
    liveMessage: 'Halted at loss-mask.patch: assistant-only loss masking is off. Press P to apply the fix.',
  }));
  assert.ok(html.includes('data-state="failed"'));
  assert.ok(html.includes('class="packet"'));
  assert.ok(html.includes('Press P to apply the fix.'));
  assert.doesNotMatch(html, FORBIDDEN);
});

test('cut wires are marked so the cut is visible without colour alone', () => {
  const html = renderToStaticMarkup(React.createElement(Coldstart, {
    cut: ['regression.suite->extract.svc'],
  }));
  assert.ok(html.includes('data-state="cut"'));
  assert.ok(html.includes('class="cut-mark"'));
});
