// app/plain/page.js
// The linear, zero-JavaScript reading of the same data the graph renders.
// Server Component: it imports GRAPH and emits a document. No client bundle,
// no camera, no keyboard model - a screen reader, a printer and a recruiter in
// a hurry all get the whole résumé in DOM order.
//
// Written with React.createElement rather than JSX so the module can be
// imported directly by `node --test` (tests/plain.test.mjs) as well as by Next.
//
// Every string from lib/graph.js is rendered as an ordinary React child. An
// earlier version pushed them all through dangerouslySetInnerHTML on the theory
// that React would mangle ">" in values like "51.6% -> 97.7%"; it does not —
// React escapes it in the serialized HTML and the browser paints ">" either way.
// The only thing that bought was a substring match in the test, at the price of
// a hand-rolled escaper standing in front of the entire résumé.
import React from 'react';
import { GRAPH, LANES, nodeById } from '../../lib/graph.js';

const h = React.createElement;

// The escape hatch is the page a recruiter is sent to from the skip link, the
// escape pill and <noscript>, so it should not arrive as Times New Roman at
// whatever measure the window happens to be. The rules are inlined rather than
// imported from a .css file because tests/plain.test.mjs imports this module
// directly under `node --test`, where a CSS import has no loader. Still zero
// client JS.
const STYLE = `
:root { color-scheme: light dark; }
.plain {
  max-width: 68ch;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.plain h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .5rem; }
.plain h2 { font-size: .85rem; letter-spacing: .16em; margin: 2.5rem 0 .5rem; }
.plain h3 { font-size: 1.05rem; margin: 1.75rem 0 .35rem; }
.plain .summary { margin: 0 0 .75rem; }
.plain code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .85em; }
.plain dt { font-size: .85rem; opacity: .75; }
.plain dd { margin: 0 0 .35rem; }
.plain small { opacity: .7; }
.plain .source { font-size: .85rem; opacity: .75; overflow-wrap: anywhere; }
.plain img { max-width: 100%; height: auto; vertical-align: middle; }
.plain footer { margin-top: 3rem; border-top: 1px solid currentColor; padding-top: 1rem; }
`;

export const metadata = {
  title: 'Naga Venkata Sai Chennu — plain text résumé',
  alternates: { canonical: '/plain' },
};

const CONTACT = [
  { label: 'Email', href: 'mailto:nagavenkatasaichennu@gmail.com' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/naga-venkata-sai-chennu/' },
  { label: 'GitHub', href: 'https://github.com/Nagavenkatasai7' },
  { label: 'Résumé PDF', href: '/Naga_Chennu_Resume.pdf' },
  { label: 'Book 30 min', href: 'https://fantastical.app/vhrdnrbmgt/chennunagavenkatasai' },
];

function contactList(key) {
  return h(
    'ul',
    { key, className: 'contact' },
    CONTACT.map((c) => h('li', { key: c.href }, h('a', { href: c.href }, c.label))),
  );
}

function metricsList(node) {
  if (!node.metrics.length) return null;
  return h(
    'dl',
    { key: 'metrics' },
    node.metrics.flatMap((m) => [
      h('dt', { key: `${m.label}-dt` }, m.label),
      h(
        'dd',
        { key: `${m.label}-dd` },
        h('span', null, m.value),
        ' ',
        h('small', null, `(${m.provenance})`),
      ),
    ]),
  );
}

function linksList(node) {
  if (!node.links.length) return null;
  return h(
    'ul',
    { key: 'links' },
    node.links.map((l) => h('li', { key: `${l.label}-${l.href}` }, h('a', { href: l.href }, l.label))),
  );
}

function appsList(node) {
  if (!Array.isArray(node.apps) || !node.apps.length) return null;
  return h(
    'ul',
    { key: 'apps', className: 'apps' },
    node.apps.map((a) =>
      h(
        'li',
        { key: a.href },
        h('a', { href: a.href }, h('img', { src: a.thumb, alt: `${a.name} screenshot`, width: 160, height: 100 }), ' ', a.name),
      ),
    ),
  );
}

function section(node) {
  const headingId = `h-${node.id}`;
  return h(
    'section',
    { key: node.id, id: node.id, 'aria-labelledby': headingId },
    h('h3', { id: headingId }, node.human, ' ', h('code', null, node.title)),
    h('p', { className: 'summary' }, node.lod[0]),
    node.lod[1].length
      ? h('ul', null, node.lod[1].map((b, i) => h('li', { key: i }, b)))
      : null,
    node.lod[2].body.map((p, i) => h('p', { key: `b${i}` }, p)),
    node.lod[2].source ? h('p', { className: 'source' }, `source: ${node.lod[2].source}`) : null,
    metricsList(node),
    appsList(node),
    linksList(node),
  );
}

export default function Plain() {
  const identity = nodeById('identity.yaml');
  return h(
    'main',
    { className: 'plain' },
    h('style', { key: 'style', dangerouslySetInnerHTML: { __html: STYLE } }),
    h('h1', null, 'Naga Venkata Sai Chennu — AI Systems Engineer'),
    h('p', { className: 'summary' }, identity.lod[0]),
    h('p', null, 'This is the plain-text reading of the graph at ', h('a', { href: '/' }, 'the homepage'), '. Same data, one column.'),
    contactList('contact-top'),
    LANES.map((lane) =>
      h(
        'section',
        { key: lane, 'aria-labelledby': `lane-${lane}` },
        h('h2', { id: `lane-${lane}` }, lane),
        GRAPH.nodes.filter((n) => n.lane === lane).map(section),
      ),
    ),
    h(
      'footer',
      null,
      h('h2', { id: 'contact' }, 'Contact'),
      contactList('contact-bottom'),
      h('p', null, 'Résumé: ', h('a', { href: '/Naga_Chennu_Resume.pdf' }, 'Naga_Chennu_Resume.pdf')),
    ),
  );
}
