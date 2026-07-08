// ============================================================
// scripts/newsletter-hero.mjs — branded 1200x630 hero-card generator for
// "The Field Guide" issues (Phase N3). ZERO new npm dependencies: rendering
// uses the SYSTEM Chrome's headless screenshot CLI (write a self-contained
// temp HTML file, `--headless --screenshot=<out>`, clean the temp file up
// after) — no puppeteer/playwright/canvas package added. The optional Storage
// upload is a plain native `fetch` POST to the Supabase Storage REST API, the
// SAME `media` bucket + public-URL shape the Phase C composer upload path
// uses (see lib/media.js — publicUrlFor / MAX_IMAGE_BYTES / sniffMime are
// reused here rather than re-hardcoded).
//
//   node scripts/newsletter-hero.mjs --title "..." --issue 1 \
//     --date "Jul 15, 2026" --out hero.png [--upload]
//   (npm run newsletter:hero -- --title "..." --issue 1 --out hero.png)
//
// Template ("Luminous" — tokens copied VERBATIM from public/index.html's
// :root, not approximated): a near-black ink (#171411) card with a subtle
// lime/coral corner glow, a small ink-bordered lime "NC" monogram top-left, a
// mono lime eyebrow ("THE FIELD GUIDE · ISSUE #n · date"), a coral accent
// rule, and a big Georgia serif title — balanced line breaks (`text-wrap:
// balance`), clamped to 3 lines so an unusually long title never overflows
// the fixed 1200x630 canvas instead of silently rendering broken.
//
// --upload needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (pull with
// `vercel env pull .env.local --environment=production --yes`, delete the
// file afterward — see NEWSLETTER-DRAFTING.md). A plain local render needs no
// env at all.
// ============================================================
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publicUrlFor, MAX_IMAGE_BYTES, sniffMime, imageDimensions } from '../lib/media.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MEDIA_BUCKET = 'media'; // literal used by app/api/media/{sign,finalize}/route.js — no exported const to import

// ---- Luminous tokens, copied verbatim from public/index.html's :root ------
const INK = '#171411';
const SURFACE = '#fffdf7';
const LIME = '#caff60';
const CORAL = '#e86f4a';
const MUTED = '#756b62';
const FAINT = '#5c554d';
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', monospace";

const WIDTH = 1200;
const HEIGHT = 630;

// ---- tiny .env.local loader (same pattern as every other script here) -----
function loadEnvLocal() {
  try {
    const txt = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env.local — env comes from the shell */ }
}

// ---- CLI args ---------------------------------------------------------------
function parseArgs(argv) {
  const out = { upload: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--upload') { out.upload = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i++; }
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node scripts/newsletter-hero.mjs --title "..." --issue <n> [--date "Jul 15, 2026"] [--out hero.png] [--upload]

  --title   required   the issue's headline (big Georgia serif, balanced, clamped to 3 lines)
  --issue   required   issue number (non-negative integer), shown as "ISSUE #<n>"
  --date    optional   defaults to today, e.g. "Jul 15, 2026"
  --out     optional   PNG output path, defaults to ./hero.png
  --upload  optional   also upload the PNG to the Supabase Storage "media" bucket
                        (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — see
                        NEWSLETTER-DRAFTING.md)`);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function defaultDate() {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
}

function findChromeBinary() {
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'darwin' && existsSync(macChrome)) return macChrome;
  const which = process.platform === 'win32' ? 'where' : 'which';
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { execFileSync(which, [bin], { stdio: 'ignore' }); return bin; } catch { /* try next */ }
  }
  return null;
}

// ---- the template -----------------------------------------------------------
function buildHtml({ title, issue, date }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Field Guide hero — issue ${esc(issue)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background:
      radial-gradient(1000px 620px at 6% -8%, rgba(202, 255, 96, 0.18), transparent 55%),
      radial-gradient(900px 560px at 106% 118%, rgba(232, 111, 74, 0.16), transparent 55%),
      ${INK};
  }
  .card {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 64px 68px;
  }
  .masthead { display: flex; align-items: center; gap: 20px; }
  .mark {
    flex: 0 0 auto; width: 58px; height: 58px;
    display: flex; align-items: center; justify-content: center;
    background: ${LIME}; border: 2px solid ${INK}; border-radius: 10px;
    font-family: ${SERIF}; font-weight: 900; font-size: 23px; color: ${INK};
  }
  .eyebrow {
    font-family: ${MONO}; font-size: 17px; font-weight: 700;
    letter-spacing: 0.15em; text-transform: uppercase; color: ${LIME};
  }
  .rule { margin-top: 30px; width: 76px; height: 4px; border-radius: 2px; background: ${CORAL}; }
  .title {
    font-family: ${SERIF}; font-weight: 700; font-size: 62px; line-height: 1.12;
    color: ${SURFACE}; max-width: 1010px;
    text-wrap: balance;
    display: -webkit-box; line-clamp: 3; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .footer { display: flex; align-items: center; justify-content: space-between; }
  .footer span { font-family: ${MONO}; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; }
  .footer .brand { color: ${MUTED}; }
  .footer .domain { color: ${FAINT}; }
</style>
</head>
<body>
  <div class="card">
    <div>
      <div class="masthead">
        <div class="mark">NC</div>
        <div class="eyebrow">THE FIELD GUIDE &middot; ISSUE #${esc(issue)} &middot; ${esc(date)}</div>
      </div>
      <div class="rule"></div>
    </div>
    <h1 class="title">${esc(title)}</h1>
    <div class="footer">
      <span class="brand">The Field Guide</span>
      <span class="domain">chennunagavenkatasai.com</span>
    </div>
  </div>
</body>
</html>`;
}

// ---- render via system Chrome headless ---------------------------------------
// Throws (never process.exit()s) on failure — process.exit() would skip the
// finally block below and leak the temp dir, since it terminates immediately
// without unwinding pending finally handlers. Callers catch and exit.
function renderPng(html, absOut) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'fg-hero-'));
  const htmlPath = join(tmpDir, 'hero.html');
  try {
    writeFileSync(htmlPath, html, 'utf8');
    const chrome = findChromeBinary();
    if (!chrome) {
      throw new Error(
        'No Chrome/Chromium binary found. Expected macOS Chrome at\n' +
        '  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n' +
        'or `google-chrome`/`chromium` on PATH.',
      );
    }
    mkdirSync(dirname(absOut), { recursive: true });
    const args = [
      '--headless',
      `--screenshot=${absOut}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1', // pin 1x so the PNG is exactly 1200x630 on Retina too
      `file://${htmlPath}`,
    ];
    const res = spawnSync(chrome, args, { stdio: 'pipe', timeout: 30000, encoding: 'utf8' });
    if (res.error || res.status !== 0) {
      throw new Error(
        `Chrome headless screenshot failed (status=${res.status}).\n${res.stdout || ''}\n${res.stderr || ''}`.trim(),
      );
    }
    if (!existsSync(absOut)) {
      throw new Error(`Chrome exited 0 but ${absOut} was not created.`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---- optional upload ----------------------------------------------------------
async function uploadHero(pngBytes, issue) {
  loadEnvLocal();
  const supaUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !key) {
    console.error('Cannot upload: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.');
    console.error('Run `vercel env pull .env.local --environment=production --yes` first, then delete it after.');
    process.exit(2);
  }
  if (pngBytes.length > MAX_IMAGE_BYTES) {
    console.error(`Refusing to upload: ${pngBytes.length} bytes exceeds the ${MAX_IMAGE_BYTES}-byte image cap (lib/media.js).`);
    process.exit(1);
  }
  const sniffed = sniffMime(pngBytes);
  if (sniffed !== 'image/png') {
    console.error(`Refusing to upload: content-sniffed mime is "${sniffed || 'unknown'}", expected image/png.`);
    process.exit(1);
  }
  const safeIssue = String(issue).replace(/[^a-z0-9-]/gi, '') || '0';
  const path = `newsletter/hero-issue-${safeIssue}-${Date.now()}.png`;
  const res = await fetch(`${supaUrl}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: pngBytes,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`Upload failed: ${res.status} ${res.statusText} ${detail}`.trim());
    process.exit(1);
  }
  return { path, publicUrl: publicUrlFor(supaUrl, path) };
}

// ---- main -----------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); process.exit(0); }

  const title = typeof args.title === 'string' ? args.title.trim() : '';
  const issueRaw = args.issue;
  if (!title) { console.error('Missing --title.\n'); usage(); process.exit(2); }
  if (issueRaw === undefined || !/^\d+$/.test(String(issueRaw))) {
    console.error('Missing/invalid --issue (must be a non-negative integer, e.g. --issue 1).\n');
    usage(); process.exit(2);
  }
  const issue = String(issueRaw);
  const date = typeof args.date === 'string' && args.date.trim() ? args.date.trim() : defaultDate();
  const outArg = typeof args.out === 'string' && args.out.trim() ? args.out.trim() : 'hero.png';
  const absOut = resolve(process.cwd(), outArg);

  const html = buildHtml({ title, issue, date });
  try {
    renderPng(html, absOut);
  } catch (e) {
    console.error(e?.message || e);
    process.exit(1);
  }

  const bytes = readFileSync(absOut);
  const mime = sniffMime(bytes);
  const dims = mime === 'image/png' ? imageDimensions(bytes, mime) : null;
  console.log(`Rendered: ${absOut}`);
  console.log(`  ${dims ? `${dims.width}x${dims.height}` : 'unknown dimensions'}, ${bytes.length} bytes, sniffed mime: ${mime || 'unknown'}`);
  if (mime !== 'image/png') {
    console.error('WARNING: output does not sniff as image/png — check the Chrome binary / flags.');
  }
  if (dims && (dims.width !== WIDTH || dims.height !== HEIGHT)) {
    console.error(`WARNING: expected ${WIDTH}x${HEIGHT}, got ${dims.width}x${dims.height} (Retina scaling? check --force-device-scale-factor).`);
  }

  let uploaded = null;
  if (args.upload) {
    uploaded = await uploadHero(bytes, issue);
    console.log(`Uploaded: ${uploaded.publicUrl}`);
    console.log(`  storage path: ${uploaded.path}`);
  }

  console.log(JSON.stringify({
    file: absOut, width: dims?.width ?? null, height: dims?.height ?? null, bytes: bytes.length,
    mime: mime || null, publicUrl: uploaded?.publicUrl ?? null, storagePath: uploaded?.path ?? null,
  }));
}

main().catch((err) => {
  console.error('Unexpected error:', err?.stack || err?.message || err);
  process.exit(1);
});
