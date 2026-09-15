'use client';
// app/coldstart/demos/SchemaCheck.js
// The demo inside extract.svc (spec §7).
//
// The extraction service constrains its tool-call output to a Pydantic v2 schema, so
// a malformed extraction is not a bad row downstream — it never becomes a row at all.
// This runs the same idea in the browser: one good payload and one deliberately
// broken one, both put through lib/coldstart/schema.js.
//
// createElement rather than JSX so `node --test` can server-render this file.

import { createElement as h, memo } from 'react';
import { validate, FILING_SCHEMA, SAMPLE_OK, SAMPLE_BAD } from '../../../lib/coldstart/schema.js';

const wrap = { fontFamily: 'var(--mono)', fontSize: '10px', lineHeight: 1.5 };

const pre = {
  margin: '0 0 6px',
  padding: '6px',
  border: '1px solid var(--rule)',
  background: 'var(--paper)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'var(--mono)',
  fontSize: '10px',
};

function verdict(ok) {
  return h('span', {
    key: 'verdict',
    className: 'schema-verdict',
    'data-ok': ok ? 'true' : 'false',
    style: {
      padding: '0 5px',
      border: `1px solid ${ok ? 'var(--green)' : 'var(--red)'}`,
      color: ok ? 'var(--green)' : 'var(--red)',
      letterSpacing: '0.1em',
    },
  }, ok ? 'PASS' : 'FAIL');
}

function payload(title, value, result) {
  return h('div', { key: title, className: 'schema-case' }, [
    h('p', {
      key: 'head',
      style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '0 0 4px' },
    }, [h('span', { key: 't', style: { color: 'var(--ink-2)' } }, title), verdict(result.ok)]),

    h('pre', { key: 'json', style: pre }, JSON.stringify(value, null, 2)),

    result.ok
      ? null
      : h('ul', {
        key: 'errors',
        className: 'schema-errors',
        style: { listStyle: 'none', margin: '0 0 6px', padding: 0, color: 'var(--red)' },
      }, result.errors.map((e) => h('li', { key: e }, e))),
  ]);
}

function SchemaCheck() {
  const good = validate(FILING_SCHEMA, SAMPLE_OK);
  const bad = validate(FILING_SCHEMA, SAMPLE_BAD);

  return h('div', { className: 'schemacheck', style: wrap }, [
    payload('tool call, well formed', SAMPLE_OK, good),
    payload('tool call, model improvised', SAMPLE_BAD, bad),
    h('p', {
      key: 'line',
      className: 'schema-line',
      style: { margin: 0, color: 'var(--ink)', borderTop: '1px solid var(--rule)', paddingTop: '4px' },
    }, 'wrong outputs are unrepresentable'),

    // The payloads above are invented. On a page whose whole argument is
    // provenance, a fabricated record rendered as a genuine one is the one thing
    // that cannot be left unlabelled.
    h('p', {
      key: 'synthetic',
      className: 'schema-note',
      style: { margin: '4px 0 0', color: 'var(--ink-2)' },
    }, 'synthetic payload — schema shape only, not a real filing'),
  ]);
}

export default memo(SchemaCheck);
