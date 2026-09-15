// tests/plain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NODES, FORBIDDEN, nodeById } from '../lib/graph.js';
import Plain from '../app/plain/page.js';

// The page renders every graph string as an ordinary React child, so ">" arrives
// in the markup as "&gt;" and is painted as ">". Compare against the serialized
// form rather than making the page hand-escape its own HTML to suit a test.
const escaped = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

test('/plain carries every fact and no forbidden strings', () => {
  const html = renderToStaticMarkup(React.createElement(Plain));
  for (const n of NODES) {
    assert.ok(html.includes(escaped(n.lod[0])), n.id);
    for (const m of n.metrics) assert.ok(html.includes(escaped(m.value)), `${n.id}:${m.label}`);
  }
  assert.doesNotMatch(html, FORBIDDEN);
});

test('/plain links the same résumé the graph does', () => {
  const html = renderToStaticMarkup(React.createElement(Plain));
  const href = nodeById('identity.yaml').links.find((l) => l.label === 'Résumé').href;
  assert.ok(html.includes(`href="${href}"`), `plain should link ${href}`);
});

// The résumé document is rendered without dangerouslySetInnerHTML: the hand-rolled
// escaper it used to route every string through was an injection surface bought
// for nothing but a substring assertion.
test('/plain does not hand-roll HTML escaping for résumé content', () => {
  const src = readFileSync(new URL('../app/plain/page.js', import.meta.url), 'utf8');
  assert.ok(!/const raw =/.test(src), 'the hand-rolled escaper is back');
  // The only dangerouslySetInnerHTML left is the page's own <style> block.
  assert.equal((src.match(/dangerouslySetInnerHTML:/g) || []).length, 1);
});
