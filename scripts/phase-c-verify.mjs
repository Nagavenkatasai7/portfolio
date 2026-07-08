// ============================================================
// scripts/phase-c-verify.mjs — end-to-end verification for Phase C.
//
//   node --conditions=react-server scripts/phase-c-verify.mjs
//   (npm run verify:phase-c)
//
// The --conditions=react-server flag lets this plain-Node process import the
// REAL server-only ingestion gate (lib/gate.js) exactly as the app does, so we
// exercise the true write path — not a re-implementation.
//
// What it does (guarded: SKIPs cleanly if Supabase creds are unset):
//   1. Build #1 (empty DB): npm run build && next start, then curl and assert
//      the fail-closed surface — / byte-identical to public/index.html, /admin
//      -> login redirect, and every admin API (ingest, content/*, media/*)
//      returns 401 without a session — plus the "No posts yet" empty state.
//   2. Seed ONE of every content type through lib/gate.js#ingestContent:
//      blog, newsletter, video, image (tiny PNG via the REAL presigned →
//      direct-PUT → content-sniff flow), linkedin_manual + x_manual paste URLs,
//      and one DRAFT. Assert dedupe still holds (re-ingest = same row).
//   3. Build #2 (seeded DB): rebuild so /blog's static prerender bakes the
//      published rows, start, and assert every PUBLISHED type renders (video
//      embed, image URL, sanitized markdown, correct source chips) and the
//      draft is ABSENT.
//   4. Delete every test row + storage object and confirm the slate is clean.
//   Kills the server and never leaves the DB dirty (try/finally).
// ============================================================
import { readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { ingestContent } from '../lib/gate.js';
import { buildComposerItem } from '../lib/compose.js';
import {
  validateDeclaredUpload, storagePathFor, publicUrlFor,
  sniffMime, resolveSniffedMime, imageDimensions, kindForMime,
} from '../lib/media.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3210;
const BASE = `http://127.0.0.1:${PORT}`;

// ---- env ----
function loadEnvLocal() {
  try {
    const txt = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fine */ }
}
loadEnvLocal();

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SB_ORIGIN = (SB_URL || '').replace(/\/+$/, '');

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SB_URL || !SB_SVC) {
  console.log('SKIP  Supabase creds unset (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). `vercel env pull`, then re-run.');
  process.exit(0);
}

const svc = createClient(SB_URL, SB_SVC, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- server lifecycle ----
function runBuild(tag) {
  // Cold build: clear .next so the /blog static prerender reads the DB fresh
  // (Next's on-disk Data Cache honours the page's revalidate=300 and would
  // otherwise reuse the previous build's read across builds — in production
  // the gate's revalidatePath('/blog') busts that after every write). This
  // mirrors a clean deploy so each build reflects the current DB.
  try { rmSync(join(ROOT, '.next'), { recursive: true, force: true }); } catch { /* fine */ }
  console.log(`\n[${tag}] npm run build (cold) ...`);
  const res = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8', env: process.env });
  const clean = res.status === 0;
  ok(`${tag}: build succeeds`, clean, clean ? '' : (res.stderr || '').slice(-400));
  return clean;
}

async function startServer() {
  const child = spawn(join(ROOT, 'node_modules', '.bin', 'next'), ['start', '-p', String(PORT)], {
    cwd: ROOT, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try {
      const r = await fetch(`${BASE}/api/health`, { cache: 'no-store' });
      if (r.ok) return child;
    } catch { /* not up yet */ }
    if (child.exitCode != null) break;
  }
  throw new Error('server did not become ready:\n' + log.slice(-600));
}

function stopServer(child) {
  if (!child || child.pid == null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* */ } }
}

// ---- helpers ----
async function curl(path, opts) {
  const r = await fetch(`${BASE}${path}`, { cache: 'no-store', ...opts });
  return r;
}
async function post(path) {
  return curl(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
}

// The 1x1 PNG used to exercise the real presigned upload flow.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// The full presigned → direct-PUT → server-sniff flow (mirrors the sign +
// finalize routes, minus the auth wrapper which is verified separately).
async function uploadViaPresign() {
  const d = validateDeclaredUpload({ filename: 'phasec.png', contentType: 'image/png', size: PNG.length });
  const path = storagePathFor(d);
  const { data, error } = await svc.storage.from('media').createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw new Error('presign failed: ' + (error?.message || 'no url'));
  const uploadUrl = /^https?:\/\//i.test(data.signedUrl) ? data.signedUrl : `${SB_ORIGIN}/storage/v1${data.signedUrl}`;
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png', 'x-upsert': 'true' }, body: PNG });
  if (!put.ok) throw new Error('direct PUT failed: ' + put.status);
  const publicUrl = publicUrlFor(SB_ORIGIN, path);
  const res = await fetch(publicUrl, { headers: { Range: 'bytes=0-65535' }, cache: 'no-store' });
  const buf = new Uint8Array(await res.arrayBuffer());
  const mime = resolveSniffedMime(sniffMime(buf)); // throws on svg/unknown
  const kind = kindForMime(mime);
  const dims = kind === 'image' ? imageDimensions(buf, mime) : null;
  return { path, publicUrl, mime, kind, dims, putStatus: put.status };
}

const created = []; // { source, external_id }
const storagePaths = [];
const STAMP = Date.now();
let imagePublicUrl = '';
const DRAFT_MARK = `phasecdraftsecret${STAMP}`;
const BOLD_MARK = `boldmark${STAMP}`;

async function seedAll() {
  console.log('\n[seed] creating one of each content type through lib/gate.js#ingestContent ...');

  // 1. blog (published) — body carries an XSS probe to prove sanitization.
  const blog = buildComposerItem({
    kind: 'blog', title: `${STAMP} Blog Post`,
    body_md: `Intro **${BOLD_MARK}** text.\n\n<script>alert(9)</script>\n\n[evil](javascript:alert(9))`,
    publishNow: true,
  }, STAMP);
  const rBlog = await ingestContent(blog);
  created.push({ source: 'blog', external_id: rBlog.external_id });
  ok('seed blog created', rBlog.created === true);

  // 2. newsletter (published)
  const nl = buildComposerItem({ kind: 'newsletter', title: `${STAMP} Newsletter`, body_md: 'Newsletter **body** here.', publishNow: true }, STAMP);
  const rNl = await ingestContent(nl);
  created.push({ source: 'newsletter', external_id: rNl.external_id });
  ok('seed newsletter created', rNl.created === true);

  // 3. video (published) — YouTube -> privacy embed
  const vid = buildComposerItem({ kind: 'video', title: `${STAMP} Video`, videoUrl: 'https://youtu.be/dQw4w9WgXcQ', publishNow: true }, STAMP);
  const rVid = await ingestContent(vid);
  created.push({ source: 'video', external_id: rVid.external_id });
  ok('seed video created', rVid.created === true);
  ok('video payload has privacy embed', vid.payload?.video?.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

  // 4. image (published) — REAL presigned upload + content-sniff
  const up = await uploadViaPresign();
  storagePaths.push(up.path);
  imagePublicUrl = up.publicUrl;
  ok('presign flow: direct PUT ok', up.putStatus === 200);
  ok('presign flow: server-sniff = image/png', up.mime === 'image/png');
  ok('presign flow: dimensions parsed (1x1)', up.dims?.width === 1 && up.dims?.height === 1);
  const img = buildComposerItem({
    kind: 'image', title: `${STAMP} Image Post`,
    media: [{ kind: 'image', url: up.publicUrl, type: up.mime, width: up.dims.width, height: up.dims.height }],
    publishNow: true,
  }, STAMP);
  const rImg = await ingestContent(img);
  created.push({ source: 'image', external_id: rImg.external_id });
  ok('seed image created', rImg.created === true);

  // 5. linkedin_manual paste (published)
  const li = buildComposerItem({ kind: 'paste', url: `https://www.linkedin.com/posts/naga-${STAMP}`, title: `${STAMP} LinkedIn`, body_md: 'My note on this LinkedIn post.', publishNow: true }, STAMP);
  const rLi = await ingestContent(li);
  created.push({ source: 'linkedin_manual', external_id: rLi.external_id });
  ok('seed linkedin_manual created', rLi.created === true && li.source === 'linkedin_manual');

  // 6. x_manual paste (published) — with a tracking param to test dedupe next
  const xUrl = `https://x.com/naga/status/${STAMP}?s=20`;
  const x1 = buildComposerItem({ kind: 'paste', url: xUrl, title: `${STAMP} X`, body_md: 'My note on this X post.', publishNow: true }, STAMP);
  const rX1 = await ingestContent(x1);
  created.push({ source: 'x_manual', external_id: rX1.external_id });
  ok('seed x_manual created', rX1.created === true && x1.source === 'x_manual');

  // dedupe: same X post, different tracking param -> SAME row, no duplicate
  const x2 = buildComposerItem({ kind: 'paste', url: `https://x.com/naga/status/${STAMP}?t=zzz`, title: `${STAMP} X edited`, body_md: 'edited note', publishNow: true }, STAMP);
  const rX2 = await ingestContent(x2);
  ok('dedupe: re-ingest (diff tracking) UPDATES same row', rX2.created === false && rX2.id === rX1.id && rX2.external_id === rX1.external_id);
  const { count: xCount } = await svc.from('content').select('id', { count: 'exact', head: true })
    .eq('source', 'x_manual').eq('external_id', rX1.external_id);
  ok('dedupe: exactly one row for the X post', xCount === 1);

  // 7. DRAFT (must never surface on /blog)
  const draft = buildComposerItem({ kind: 'blog', title: `${DRAFT_MARK} Draft`, body_md: `secret ${DRAFT_MARK}`, publishNow: false }, STAMP + 1);
  const rDraft = await ingestContent(draft);
  created.push({ source: 'blog', external_id: rDraft.external_id });
  ok('seed draft created as draft', rDraft.created === true && draft.status === 'draft');

  // Isolate data-visibility from render caching: confirm the anon key (the
  // exact path /blog reads through) sees the published rows but NOT the draft.
  if (SB_ANON) {
    const anon = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    const { data: pubRows } = await anon.from('public_content').select('title').ilike('title', `${STAMP}%`);
    ok('published rows visible to anon via public_content', Array.isArray(pubRows) && pubRows.length >= 6, `(saw ${pubRows?.length})`);
    const { data: draftRows } = await anon.from('public_content').select('id').ilike('title', `${DRAFT_MARK}%`);
    ok('draft NOT visible to anon via public_content', Array.isArray(draftRows) && draftRows.length === 0);
  }
}

async function assertFailClosed(baselinePublished) {
  // BASELINE (2026-07-08): public/index.html was intentionally edited for the first
  // time — a "Blog" header-nav link (<a href="/blog">) was added; nothing else changed.
  // New baseline SHA-256 500a5823…6903, 85356 bytes. This check is self-referential
  // (served "/" vs the COMMITTED local file) so it stays green; the byte-parity-WITH-
  // PRODUCTION guarantee is superseded until cutover (prod serves the pre-Blog page).
  // / byte-identical to public/index.html
  const rootRes = await curl('/');
  const rootBody = Buffer.from(await rootRes.arrayBuffer());
  const fileSha = sha256(readFileSync(join(ROOT, 'public', 'index.html')));
  ok('/ is byte-identical to public/index.html', sha256(rootBody) === fileSha, `(${rootBody.length} bytes)`);

  // /admin -> redirect to login (fail-closed; auth not configured)
  const adminRes = await curl('/admin', { redirect: 'manual' });
  const loc = adminRes.headers.get('location') || '';
  ok('/admin redirects to /admin/login', (adminRes.status === 307 || adminRes.status === 308) && loc.includes('/admin/login'), `(${adminRes.status} ${loc})`);

  // every admin API returns 401 without a session
  for (const p of ['/api/ingest', '/api/content/create', '/api/content/update', '/api/content/moderate', '/api/media/sign', '/api/media/finalize']) {
    const r = await post(p);
    ok(`${p} without session -> 401`, r.status === 401, `(${r.status})`);
  }

  // empty-state (only meaningful if the DB started with no published rows)
  const blogRes = await curl('/blog');
  const html = await blogRes.text();
  if (baselinePublished === 0) {
    ok('empty /blog renders "No posts yet"', html.includes('No posts yet') && !html.includes('<article'));
  } else {
    console.log(`SKIP  empty-state render assertion (${baselinePublished} pre-existing published row(s) — cannot show empty)`);
  }
}

async function assertSeededRender() {
  const html = await (await curl('/blog')).text();

  ok('blog article renders (title)', html.includes(`${STAMP} Blog Post`));
  ok('markdown bold preserved', html.includes(`<strong>${BOLD_MARK}</strong>`));
  ok('markdown <script> stripped (no alert payload)', !html.includes('alert(9)') && !html.includes('<script>alert'));
  ok('markdown javascript: link neutralized', !html.includes('javascript:alert'));
  ok('newsletter renders', html.includes(`${STAMP} Newsletter`));
  ok('video privacy embed present', html.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
  ok('image public URL present in feed', imagePublicUrl && html.includes(imagePublicUrl));
  ok('linkedin post renders w/ source chip + original link', html.includes('chip linkedin') && html.includes('View on LinkedIn'));
  ok('x post renders w/ source chip + original link', html.includes('chip x') && html.includes('View on X'));
  ok('blog source chip present', html.includes('chip blog'));
  ok('newsletter source chip present', html.includes('chip newsletter'));
  ok('video source chip present', html.includes('chip video'));
  ok('image source chip present', html.includes('chip image'));
  ok('DRAFT is ABSENT from /blog', !html.includes(DRAFT_MARK));
}

async function cleanup() {
  console.log('\n[cleanup] deleting test rows + storage objects ...');
  for (const c of created) {
    await svc.from('content').delete().eq('source', c.source).eq('external_id', c.external_id);
  }

  let rmOk = true;
  if (storagePaths.length) {
    const { error: rmErr } = await svc.storage.from('media').remove(storagePaths);
    rmOk = !rmErr;
  }

  const extIds = created.map((c) => c.external_id);
  const { count } = await svc.from('content').select('id', { count: 'exact', head: true }).in('external_id', extIds);
  ok('all test rows deleted (0 remain)', count === 0, `(count=${count})`);

  if (storagePaths.length) {
    // Authoritative existence check via the storage API (NOT the public CDN URL,
    // which caches deleted objects for a while): a removed object can no longer
    // be downloaded through the service role.
    const { data: dl, error: dlErr } = await svc.storage.from('media').download(storagePaths[0]);
    ok('test storage object removed (not downloadable)', rmOk && !dl && Boolean(dlErr), `(rmOk=${rmOk})`);
  }
}

// ---- run ----
let server = null;
try {
  const { count: baseline } = await svc.from('content').select('id', { count: 'exact', head: true })
    .eq('status', 'published').is('deleted_at', null);
  console.log(`baseline published rows: ${baseline}`);

  // Build #1 — empty/fail-closed surface.
  if (runBuild('build#1')) {
    server = await startServer();
    console.log('\n== Fail-closed + empty-state (build #1) ==');
    await assertFailClosed(baseline || 0);
    stopServer(server); server = null;
    await sleep(1200);
  }

  // Seed everything.
  console.log('\n== Seed one of each type + dedupe (real ingestContent) ==');
  await seedAll();

  // Build #2 — seeded render.
  if (runBuild('build#2')) {
    server = await startServer();
    console.log('\n== Published rendering + draft hidden (build #2) ==');
    await assertSeededRender();
    stopServer(server); server = null;
    await sleep(800);
  }
} catch (err) {
  console.error('\nERROR during verification:', err?.message || err);
  failures++;
} finally {
  if (server) { stopServer(server); await sleep(500); }
  try { await cleanup(); } catch (e) { console.error('cleanup error:', e?.message || e); failures++; }
}

console.log(`\n${failures === 0 ? 'PHASE C VERIFY: ALL PASS' : `PHASE C VERIFY: ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
