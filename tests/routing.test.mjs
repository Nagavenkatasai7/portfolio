// tests/routing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nodeById } from '../lib/graph.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('next.config.mjs no longer rewrites / to the static homepage', () => {
  const src = readFileSync(root + 'next.config.mjs', 'utf8');
  assert.ok(!src.includes('"/index.html"'), 'rewrite destination "/index.html" still present');
  assert.ok(!src.includes("'/index.html'"), "rewrite destination '/index.html' still present");
});

test('legacy static homepage and chatbot widget assets are gone', () => {
  for (const f of ['public/index.html', 'public/chatbot.js', 'public/chatbot.css']) {
    assert.equal(existsSync(root + f), false, `${f} should be deleted`);
  }
});

// The escape pill, /plain and identity.yaml all point at the same résumé href.
// Assert the artifact, not the string: a renamed or missing PDF must fail CI
// rather than pass it because every assertion quotes the same broken path.
test('the résumé the graph links to actually exists in public/', () => {
  const href = nodeById('identity.yaml').links.find((l) => l.label === 'Résumé').href;
  assert.ok(href.startsWith('/'), 'résumé href must be site-absolute');
  assert.ok(existsSync(root + 'public' + href), `${href} missing from public/`);
});

test('app/page.js exists and renders the Coldstart graph', () => {
  assert.ok(existsSync(root + 'app/page.js'), 'app/page.js missing');
  const src = readFileSync(root + 'app/page.js', 'utf8');
  assert.ok(src.includes("./coldstart/Coldstart.js"), 'page does not import Coldstart');
  assert.ok(src.includes("./coldstart/coldstart.css"), 'page does not import coldstart.css');
  assert.ok(src.includes('/plain'), 'page has no noscript fallback to /plain');
});
