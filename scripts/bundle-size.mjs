#!/usr/bin/env node
// ============================================================
// bundle-size.mjs — CI gate for the COLDSTART homepage ("/").
//
// Spec §13 / plan Task 13: after `next build`, sum the gzipped bytes of every
// client chunk the `/` route loads and fail above an absolute ceiling of
// 250 KB gzipped. Prints a per-file table for the PR log.
//
// Source of truth: `.next/app-build-manifest.json` -> `pages['/page']`, the
// list of chunk paths (relative to `.next/`) the App Router ships for `/`.
//
// Zero dependencies: node:fs, node:path, node:zlib only.
// ============================================================

import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const LIMIT_BYTES = 250 * 1024;
const ROOT = path.resolve(process.cwd());
const NEXT_DIR = path.join(ROOT, '.next');
const MANIFEST = path.join(NEXT_DIR, 'app-build-manifest.json');
const ROUTE = '/page';

function fail(msg) {
  console.error(`bundle-size: ${msg}`);
  process.exit(1);
}

function readManifest() {
  let raw;
  try {
    raw = readFileSync(MANIFEST, 'utf8');
  } catch {
    fail(`cannot read ${path.relative(ROOT, MANIFEST)} — run \`next build\` first.`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${path.relative(ROOT, MANIFEST)} is not valid JSON: ${err.message}`);
  }
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

function main() {
  const manifest = readManifest();
  const pages = manifest && manifest.pages;
  if (!pages || typeof pages !== 'object') {
    fail('manifest has no `pages` object.');
  }
  const files = pages[ROUTE];
  if (!Array.isArray(files)) {
    const known = Object.keys(pages).join(', ') || '(none)';
    fail(`manifest has no entry for "${ROUTE}". Routes present: ${known}`);
  }

  // De-duplicate: shared chunks can be listed more than once.
  const unique = [...new Set(files)];

  const rows = [];
  let total = 0;
  let missing = 0;

  for (const rel of unique) {
    const abs = path.join(NEXT_DIR, rel);
    let raw;
    try {
      raw = readFileSync(abs);
    } catch {
      missing++;
      rows.push({ file: rel, raw: null, gzip: null });
      continue;
    }
    const gzip = gzipSync(raw, { level: 9 }).length;
    total += gzip;
    rows.push({ file: rel, raw: statSync(abs).size, gzip });
  }

  const nameWidth = Math.max(4, ...rows.map((r) => r.file.length));
  const pad = (s, n) => String(s).padEnd(n);
  const padStart = (s, n) => String(s).padStart(n);

  console.log(`\nFirst-load client JS for "/" (route ${ROUTE})\n`);
  console.log(`${pad('file', nameWidth)}  ${padStart('raw KB', 9)}  ${padStart('gzip KB', 9)}`);
  console.log('-'.repeat(nameWidth + 22));
  for (const r of rows.sort((a, b) => (b.gzip ?? -1) - (a.gzip ?? -1))) {
    if (r.gzip === null) {
      console.log(`${pad(r.file, nameWidth)}  ${padStart('MISSING', 9)}  ${padStart('-', 9)}`);
    } else {
      console.log(`${pad(r.file, nameWidth)}  ${padStart(kb(r.raw), 9)}  ${padStart(kb(r.gzip), 9)}`);
    }
  }
  console.log('-'.repeat(nameWidth + 22));
  console.log(`${pad(`total (${rows.length - missing} files)`, nameWidth)}  ${padStart('', 9)}  ${padStart(kb(total), 9)}`);
  console.log(`${pad('ceiling', nameWidth)}  ${padStart('', 9)}  ${padStart(kb(LIMIT_BYTES), 9)}\n`);

  if (missing > 0) {
    fail(`${missing} chunk(s) listed in the manifest are missing from .next/ — stale build?`);
  }

  if (total > LIMIT_BYTES) {
    fail(
      `FAIL — ${kb(total)} KB gzipped exceeds the ${kb(LIMIT_BYTES)} KB ceiling by ${kb(total - LIMIT_BYTES)} KB.`
    );
  }

  console.log(
    `bundle-size: PASS — ${kb(total)} KB gzipped, ${kb(LIMIT_BYTES - total)} KB under the ${kb(LIMIT_BYTES)} KB ceiling.`
  );
}

main();
