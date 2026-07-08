// ============================================================
// scripts/phase-e-verify.mjs — end-to-end verification for Phase E
// (public distribution + analytics + ops hardening).
//
//   node --conditions=react-server scripts/phase-e-verify.mjs
//   (npm run verify:phase-e)
//
// --conditions=react-server lets this plain-Node process import the REAL
// server-only modules the app uses (lib/gate.js, lib/analytics.js) so we
// exercise the true logic, not a re-implementation.
//
// It CANNOT log in (the admin session secret is unset by design), so it verifies
// the admin surface fail-closed and drives everything else over real HTTP:
//
//   A. PURE unit tests (always run; no network, no DB): the analytics
//      aggregation math, the id/bot/dedupe helpers.
//   B. Seed a PUBLISHED + a DRAFT + a REMOVED post through the REAL gate.
//   C. Cold build + next start, then assert the public distribution surface:
//      RSS (published only, valid XML, no draft/removed/admin data), sitemap
//      (published only), robots (disallow /admin + /api), per-post SEO
//      (OG/Twitter/JSON-LD/canonical + RSS alternate), draft/removed post 404,
//      the security headers (HSTS/Permissions-Policy/nosniff/frame) AND the
//      unchanged CSP the chatbot/embeds/uploads depend on, / byte-identical,
//      /admin/analytics -> login redirect.
//   D. Drive POST /api/analytics/view: valid -> ONE row; dedupe; burst -> 429;
//      unknown -> 404; malformed -> 400; bot UA / DNT -> 204 skip; bad origin
//      -> 403; and prove NO raw IP is stored (only a salted hash).
//   E. Full teardown (delete every test row) + confirm the slate is clean.
// ============================================================
import { readFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { ingestContent, moderateContent } from '../lib/gate.js';
import { isUuid, postTitle, postDescription, plainText } from '../lib/post.js';
import { aggregateAnalytics, lastNDays } from '../lib/analytics_aggregate.js';
import { hashIp, isBot, VIEW_LIMIT, parseDedupe, serializeDedupe, dayBucketUTC } from '../lib/analytics.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 3213;
const BASE = `http://127.0.0.1:${PORT}`;

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
// Pin the site base URL so canonical/OG/sitemap/robots resolve to a known host.
process.env.NEXT_PUBLIC_SITE_URL = BASE;

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPA_ORIGIN = (() => { try { return new URL(SB_URL).origin; } catch { return ''; } })();

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const info = (name, detail = '') => console.log(`INFO  ${name}${detail ? '  ' + detail : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------
// A. PURE unit tests (no network, no DB) — always run.
// ---------------------------------------------------------------
function pureTests() {
  console.log('\n== A. Pure unit tests (deterministic, no network) ==');

  // aggregateAnalytics — deterministic synthetic events.
  const now = new Date('2026-07-08T12:00:00Z');
  const today = now.toISOString().slice(0, 10);
  const yday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const events = [
    { content_id: 'A', kind: 'view', created_at: `${today}T01:00:00Z` },
    { content_id: 'A', kind: 'view', created_at: `${today}T02:00:00Z` },
    { content_id: 'B', kind: 'view', created_at: `${yday}T02:00:00Z` },
    { content_id: 'A', kind: 'view', created_at: `${yday}T03:00:00Z` },
    { content_id: 'C', kind: 'notaview', created_at: `${today}T04:00:00Z` }, // ignored (kind != view)
  ];
  const meta = { A: { title: 'Alpha', type: 'blog', source: 'blog' }, B: { title: 'Beta', type: 'thread', source: 'x_auto' } };
  const agg = aggregateAnalytics(events, meta, { days: 30, now });
  ok('agg: total counts only kind=view', agg.total === 4, `(got ${agg.total})`);
  ok('agg: postsTracked = 2 distinct viewed posts (A,B; C is not a view)', agg.postsTracked === 2, `(got ${agg.postsTracked})`);
  ok('agg: top post is A with 3', agg.top && agg.top.id === 'A' && agg.top.count === 3, JSON.stringify(agg.top));
  ok('agg: bySource has blog=3 (A) + x_auto=1 (B)',
    agg.bySource.find((s) => s.key === 'blog')?.count === 3 && agg.bySource.find((s) => s.key === 'x_auto')?.count === 1);
  ok('agg: byType has blog=3', agg.byType.find((t) => t.key === 'blog')?.count === 3);
  ok('agg: timeline length = 30', agg.timeline.length === 30);
  ok('agg: timeline sum = total', agg.timeline.reduce((s, x) => s + x.count, 0) === agg.total);
  ok('agg: today bucket = 2 (A,A)', agg.timeline[agg.timeline.length - 1].count === 2, `(got ${agg.timeline.at(-1).count})`);
  ok('agg: last7 covers all here', agg.last7 === 4);
  ok('agg: peakDay = 2', agg.peakDay === 2);
  const empty = aggregateAnalytics([], {}, { days: 30, now });
  ok('agg: empty -> zeros, no throw', empty.total === 0 && empty.postsTracked === 0 && empty.timeline.length === 30 && empty.top === null);
  ok('lastNDays: oldest..newest inclusive of today', lastNDays(30, now).at(-1) === today && lastNDays(30, now).length === 30);

  // helpers
  ok('isUuid: accepts a real uuid, rejects junk',
    isUuid('123e4567-e89b-42d3-a456-426614174000') && !isUuid('nope') && !isUuid('') && !isUuid(null));
  ok('isBot: flags crawlers + empty UA, allows a real browser',
    isBot('Googlebot/2.1') && isBot('python-requests/2.31') && isBot('') && isBot('curl/8')
    && !isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'));
  ok('plainText: strips markdown + collapses ws',
    plainText('# Hi\n\n**bold** and [link](http://x)') === 'Hi bold and link', JSON.stringify(plainText('# Hi\n\n**bold** and [link](http://x)')));
  ok('postDescription: falls back for untitled X post',
    typeof postDescription({ type: 'thread', payload: { thread: ['one two', 'three'] } }) === 'string');
  ok('postTitle: uses type label when no title', postTitle({ type: 'video' }) === 'Video');

  // dedupe cookie round-trip + day-reset
  const s1 = serializeDedupe(new Set(['id1', 'id2']));
  ok('dedupe: serialize prefixes today', s1.startsWith(`${dayBucketUTC()}.`), s1);
  ok('dedupe: parse round-trips ids for today', (() => { const p = parseDedupe(s1); return p.ids.has('id1') && p.ids.has('id2'); })());
  ok('dedupe: parse resets on a stale day', parseDedupe('2000-01-01.idX').ids.size === 0);

  // IP hashing: hash != raw, deterministic
  const h = hashIp('203.0.113.9');
  ok('hashIp: not the raw IP, deterministic, hex', h !== '203.0.113.9' && h === hashIp('203.0.113.9') && /^[0-9a-f]+$/.test(h));
}

// ---------------------------------------------------------------
// server lifecycle (mirrors phase-c/d)
// ---------------------------------------------------------------
function runBuild(tag) {
  try { rmSync(join(ROOT, '.next'), { recursive: true, force: true }); } catch { /* fine */ }
  console.log(`\n[${tag}] npm run build (cold) ...`);
  const res = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8', env: process.env });
  const clean = res.status === 0;
  ok(`${tag}: build succeeds`, clean, clean ? '' : (res.stderr || res.stdout || '').slice(-800));
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
    try { const r = await fetch(`${BASE}/api/health`, { cache: 'no-store' }); if (r.ok) return child; } catch { /* not up */ }
  }
  console.error('server did not become ready:\n' + log.slice(-1200));
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
  return null;
}
function stopServer(child) {
  if (!child) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
}

const curl = (path, opts = {}) => fetch(`${BASE}${path}`, { cache: 'no-store', redirect: 'manual', ...opts });

async function post(path, bodyObj, { ip, realip, ua, dnt, origin = BASE, cookie, rawBody } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (ip) headers['x-forwarded-for'] = ip;          // spoofable leftmost XFF
  if (realip) headers['x-real-ip'] = realip;        // Vercel-set, un-spoofable
  if (ua !== undefined) headers['user-agent'] = ua;
  if (dnt) headers.dnt = '1';
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  const body = rawBody !== undefined ? rawBody : JSON.stringify(bodyObj);
  return fetch(`${BASE}${path}`, { method: 'POST', headers, body, redirect: 'manual' });
}
function getSetCookie(res) {
  try { const a = res.headers.getSetCookie?.(); if (a && a.length) return a; } catch { /* */ }
  const one = res.headers.get('set-cookie');
  return one ? [one] : [];
}
function avCookie(res) {
  for (const c of getSetCookie(res)) { const m = c.match(/(^|;\s*)(av=[^;]+)/); if (m) return m[2]; }
  return '';
}

const sb = (SB_URL && SB_SVC) ? createClient(SB_URL, SB_SVC, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
async function countViews(id) {
  const { count } = await sb.from('analytics_event').select('id', { count: 'exact', head: true }).eq('content_id', id);
  return count ?? 0;
}

async function main() {
  pureTests();

  if (!sb) {
    info('DB not configured — skipping live seed/HTTP/analytics tests (pure tests above still ran).');
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
    process.exit(failures === 0 ? 0 : 1);
  }

  const STAMP = `pe${Date.now().toString(36)}`;
  const PUB_MARK = `pubmark_${STAMP}`;
  const DRAFT_MARK = `draftmark_${STAMP}`;
  const REMOVED_MARK = `rmmark_${STAMP}`;
  const created = [];
  let pubId, draftId, removedId;

  console.log('\n== B. Seed published + draft + removed via the REAL gate ==');
  try {
    const rPub = await ingestContent({
      source: 'blog', type: 'blog', external_id: `phase-e-pub-${STAMP}`,
      title: `${STAMP} Published Post`,
      body_md: `This is the **published** post body. Marker ${PUB_MARK}. It talks about scalable systems.`,
      published_at: new Date().toISOString(), status: 'published',
    });
    pubId = rPub.id; created.push(rPub.external_id);
    ok('seed: published created', rPub.created === true && isUuid(pubId));

    const rDraft = await ingestContent({
      source: 'blog', type: 'blog', external_id: `phase-e-draft-${STAMP}`,
      title: `${STAMP} Draft Post`, body_md: `secret ${DRAFT_MARK}`,
      published_at: new Date().toISOString(), status: 'draft',
    });
    draftId = rDraft.id; created.push(rDraft.external_id);
    ok('seed: draft created', rDraft.created === true && isUuid(draftId));

    const rRem = await ingestContent({
      source: 'blog', type: 'blog', external_id: `phase-e-removed-${STAMP}`,
      title: `${STAMP} Removed Post`, body_md: `gone ${REMOVED_MARK}`,
      published_at: new Date().toISOString(), status: 'published',
    });
    removedId = rRem.id; created.push(rRem.external_id);
    await moderateContent(removedId, { remove: true });
    ok('seed: removed (tombstoned)', isUuid(removedId));
  } catch (e) {
    ok('seed: gate ingest', false, String(e && e.message));
  }

  if (!runBuild('E')) { console.log(`\n${failures} FAILURE(S) (build)`); process.exit(1); }
  const child = await startServer();
  ok('server: started (health ok)', Boolean(child));
  if (!child) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }

  try {
    // ---- C. Public distribution surface ----
    console.log('\n== C. RSS / sitemap / robots / per-post SEO / headers ==');

    // RSS
    const rss = await curl('/blog/rss.xml');
    const rssType = rss.headers.get('content-type') || '';
    const rssXml = await rss.text();
    ok('rss: 200 + application/rss+xml', rss.status === 200 && /application\/rss\+xml/.test(rssType), rssType);
    ok('rss: well-formed <rss><channel> with items', /<rss[\s>]/.test(rssXml) && /<channel>/.test(rssXml) && /<item>/.test(rssXml));
    ok('rss: contains the PUBLISHED post', rssXml.includes(`${STAMP} Published Post`) && rssXml.includes(`/blog/${pubId}`));
    ok('rss: guid is the permalink', rssXml.includes(`<guid isPermaLink="true">${BASE}/blog/${pubId}</guid>`));
    ok('rss: has a valid pubDate (RFC-822)', /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/.test(rssXml));
    ok('rss: EXCLUDES the draft', !rssXml.includes(`${STAMP} Draft Post`) && !rssXml.includes(draftId) && !rssXml.includes(DRAFT_MARK));
    ok('rss: EXCLUDES the removed', !rssXml.includes(`${STAMP} Removed Post`) && !rssXml.includes(removedId));
    ok('rss: leaks no internal/admin columns', !/ingested_at|deleted_at|service_role|external_id/i.test(rssXml));

    // sitemap
    const sm = await curl('/sitemap.xml');
    const smXml = await sm.text();
    ok('sitemap: 200 + xml', sm.status === 200 && /xml/.test(sm.headers.get('content-type') || ''));
    ok('sitemap: lists the blog index', smXml.includes(`${BASE}/blog<`) || smXml.includes(`<loc>${BASE}/blog</loc>`));
    ok('sitemap: lists the PUBLISHED post', smXml.includes(`${BASE}/blog/${pubId}`));
    ok('sitemap: EXCLUDES draft + removed', !smXml.includes(draftId) && !smXml.includes(removedId));
    ok('sitemap: no /admin or /api URLs', !/\/admin|\/api\//.test(smXml));

    // robots
    const rob = await curl('/robots.txt');
    const robTxt = await rob.text();
    ok('robots: 200', rob.status === 200);
    ok('robots: Disallow /admin', /Disallow:\s*\/admin/i.test(robTxt), robTxt.replace(/\n/g, ' ').slice(0, 200));
    ok('robots: Disallow /api', /Disallow:\s*\/api/i.test(robTxt));
    ok('robots: Allow /blog', /Allow:\s*\/blog/i.test(robTxt));
    ok('robots: points at the sitemap', /Sitemap:\s*\S+\/sitemap\.xml/i.test(robTxt));

    // per-post SEO
    const pp = await curl(`/blog/${pubId}`);
    const ppHtml = await pp.text();
    ok('post: 200', pp.status === 200);
    ok('post: renders the title + body', ppHtml.includes(`${STAMP} Published Post`) && ppHtml.includes(PUB_MARK));
    ok('post: canonical link -> /blog/<id>', new RegExp(`<link[^>]+rel="canonical"[^>]+href="${BASE}/blog/${pubId}"`).test(ppHtml)
      || new RegExp(`<link[^>]+href="${BASE}/blog/${pubId}"[^>]+rel="canonical"`).test(ppHtml), 'canonical');
    ok('post: Open Graph tags', /property="og:title"/.test(ppHtml) && /property="og:type"\s+content="article"/.test(ppHtml) && ppHtml.includes(`property="og:url"`) && /property="og:image"/.test(ppHtml));
    ok('post: Twitter card', /name="twitter:card"\s+content="summary_large_image"/.test(ppHtml) && /name="twitter:title"/.test(ppHtml));
    ok('post: JSON-LD BlogPosting', /application\/ld\+json/.test(ppHtml) && /"@type":"BlogPosting"/.test(ppHtml) && ppHtml.includes(`"url":"${BASE}/blog/${pubId}"`));
    ok('post: RSS alternate link in head', /<link[^>]+rel="alternate"[^>]+type="application\/rss\+xml"[^>]+href="[^"]*\/blog\/rss\.xml"/.test(ppHtml)
      || /<link[^>]+type="application\/rss\+xml"[^>]+rel="alternate"/.test(ppHtml));
    ok('post: embeds the analytics beacon (POST /api/analytics/view)', ppHtml.includes('/api/analytics/view') && ppHtml.includes(pubId));
    ok('post: beacon respects DNT client-side', /doNotTrack/.test(ppHtml));

    // draft + removed per-post -> 404
    const draftPage = await curl(`/blog/${draftId}`);
    ok('post: DRAFT page 404s (not published)', draftPage.status === 404, `(got ${draftPage.status})`);
    const remPage = await curl(`/blog/${removedId}`);
    ok('post: REMOVED page 404s', remPage.status === 404, `(got ${remPage.status})`);
    const junkPage = await curl('/blog/not-a-uuid');
    ok('post: malformed id 404s', junkPage.status === 404, `(got ${junkPage.status})`);

    // headers on /blog
    const blog = await curl('/blog');
    const H = (r, k) => (r.headers.get(k) || '');
    ok('hdr /blog: HSTS present', /max-age=\d+/.test(H(blog, 'strict-transport-security')), H(blog, 'strict-transport-security'));
    ok('hdr /blog: Permissions-Policy locks camera/mic/geo', /camera=\(\)/.test(H(blog, 'permissions-policy')) && /microphone=\(\)/.test(H(blog, 'permissions-policy')) && /geolocation=\(\)/.test(H(blog, 'permissions-policy')));
    ok('hdr /blog: nosniff + referrer + frame DENY', H(blog, 'x-content-type-options') === 'nosniff' && /strict-origin-when-cross-origin/.test(H(blog, 'referrer-policy')) && /DENY/i.test(H(blog, 'x-frame-options')));

    // CSP regression — /blog
    const blogCsp = H(blog, 'content-security-policy');
    ok('CSP /blog: connect-src \'self\' intact (beacon + chatbot pattern)', /connect-src\s+'self'/.test(blogCsp), blogCsp.slice(0, 120));
    ok('CSP /blog: script-src \'self\' \'unsafe-inline\' (static page)', /script-src\s+'self'\s+'unsafe-inline'/.test(blogCsp));
    ok('CSP /blog: frame-src youtube-nocookie + vimeo (embeds survive)', /youtube-nocookie\.com/.test(blogCsp) && /player\.vimeo\.com/.test(blogCsp));
    ok('CSP /blog: frame-ancestors none', /frame-ancestors\s+'none'/.test(blogCsp));
    // Permissions-Policy must still allow the embed hosts the media features they use
    ok('hdr /blog: Permissions-Policy still delegates fullscreen to embed hosts',
      /fullscreen=\(self[^)]*youtube-nocookie/.test(H(blog, 'permissions-policy')));

    // CSP — /admin (nonce + supabase connect for uploads)
    const adminLogin = await curl('/admin/login');
    const admCsp = H(adminLogin, 'content-security-policy');
    ok('CSP /admin: nonce + strict-dynamic', /script-src\s+'self'\s+'nonce-[^']+'\s+'strict-dynamic'/.test(admCsp), admCsp.slice(0, 140));
    ok('CSP /admin: connect-src allows Supabase origin (upload)', SUPA_ORIGIN ? admCsp.includes(SUPA_ORIGIN) : true, SUPA_ORIGIN);
    ok('CSP /admin: img/media allow blob: (upload previews)', /img-src[^;]*blob:/.test(admCsp) && /media-src[^;]*blob:/.test(admCsp));

    // CSP — /api locked down
    const apiHealth = await curl('/api/health');
    ok('CSP /api: default-src none', /default-src\s+'none'/.test(H(apiHealth, 'content-security-policy')));

    // Chatbot host "/" must NOT be newly CSP-restricted (it has no CSP; fetch to /api/chat stays same-origin allowed)
    const home = await curl('/');
    const homeHtml = await home.text();
    ok('chatbot /: no restrictive CSP header on the legacy home', !home.headers.get('content-security-policy'));
    // / byte-identical to public/index.html
    const idx = readFileSync(join(ROOT, 'public', 'index.html'));
    ok('/ byte-identical to public/index.html', sha256hex(homeHtml) === sha256hex(idx.toString()), `${Buffer.byteLength(homeHtml)} vs ${idx.length} bytes`);

    // vercel.json edge headers are NOT emitted by `next start`, so assert the
    // anti-clickjacking header for "/" at the config level (Finding 6). The
    // legacy "/" is served statically from public/ under the vercel.json /(.*)
    // header block — adding a response header keeps the body byte-identical.
    const vjson = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    const rootHdrs = (vjson.headers || []).find((h) => h.source === '/(.*)')?.headers || [];
    ok('config: vercel.json "/(.*)" sets X-Frame-Options: DENY (clickjacking on /)',
      rootHdrs.some((h) => h.key === 'X-Frame-Options' && /DENY/i.test(h.value)), JSON.stringify(rootHdrs.map((h) => h.key)));

    // admin analytics fail-closed
    const an = await curl('/admin/analytics');
    const loc = an.headers.get('location') || '';
    ok('admin/analytics: redirects to login without a session', (an.status === 307 || an.status === 308) && /\/admin\/login/.test(loc), `${an.status} -> ${loc}`);

    // ---- D. Analytics beacon ----
    console.log('\n== D. POST /api/analytics/view ==');
    const ipA = '203.0.113.10';
    const before = await countViews(pubId);

    // valid -> 200 ok + exactly ONE new row
    const r1 = await post('/api/analytics/view', { id: pubId, path: `/blog/${pubId}` }, { ip: ipA, ua: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120 Safari/537.36' });
    const j1 = await r1.json().catch(() => ({}));
    const after1 = await countViews(pubId);
    ok('beacon: valid id -> 200 ok', r1.status === 200 && j1.ok === true, `(status ${r1.status})`);
    ok('beacon: writes exactly ONE row', after1 === before + 1, `(${before} -> ${after1})`);
    const cookie = avCookie(r1);
    ok('beacon: sets an httpOnly dedupe cookie', /^av=/.test(cookie) && /HttpOnly/i.test(getSetCookie(r1).join(';')), cookie.slice(0, 24));

    // dedupe -> 200 deduped + NO new row
    const r2 = await post('/api/analytics/view', { id: pubId }, { ip: ipA, ua: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120 Safari/537.36', cookie });
    const j2 = await r2.json().catch(() => ({}));
    const after2 = await countViews(pubId);
    ok('beacon: same visitor same day -> deduped (no new row)', r2.status === 200 && j2.deduped === true && after2 === after1, `(${after1} -> ${after2})`);

    // burst from one IP -> 429 after the limit
    const ipBurst = '198.51.100.7';
    let got429 = false; let firstOkBefore429 = false; let firstError = 0;
    for (let i = 0; i < VIEW_LIMIT + 8; i++) {
      const rb = await post('/api/analytics/view', { id: pubId }, { ip: ipBurst, ua: 'Mozilla/5.0 (X11) AppleWebKit Chrome/119 Safari/537.36' });
      if (rb.status === 200 && !got429) firstOkBefore429 = true;
      if (rb.status === 429) { got429 = true; if (!firstError) firstError = i; break; }
    }
    ok('beacon: burst from one IP gets rate-limited (429)', got429, `(first 429 at request #${firstError})`);
    ok('beacon: rate limit triggers at/after the configured N', firstError >= VIEW_LIMIT, `(N=${VIEW_LIMIT}, first429=${firstError})`);
    ok('beacon: allowed some before limiting', firstOkBefore429);

    // ---- ABUSE HARDENING (reviewed findings) ----
    // (i) Rate-limit runs BEFORE request.json(): ipBurst is already over the
    // limit, so even an INVALID body returns 429 (a parse-first route would 400).
    const rLimitPreParse = await post('/api/analytics/view', null, { ip: ipBurst, ua: 'Mozilla/5.0 (X11) AppleWebKit Chrome/119 Safari/537.36', rawBody: '{ not valid json' });
    ok('beacon: over-limit IP -> 429 BEFORE json parse (limit precedes parse)', rLimitPreParse.status === 429, `(got ${rLimitPreParse.status})`);

    // (ii) Content-Length cap runs BEFORE request.json(): an oversized body is
    // 413 even though it is not valid JSON.
    const rCap = await post('/api/analytics/view', null, { realip: '198.51.100.220', ua: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/123 Safari/537.36', rawBody: 'x'.repeat(3 * 1024) });
    ok('beacon: oversized body -> 413 BEFORE json parse (cap precedes parse)', rCap.status === 413, `(got ${rCap.status})`);

    // (iii) Spoofed rotating XFF no longer bypasses the IP limit: a FIXED
    // x-real-ip (as Vercel sets) with a DIFFERENT leftmost XFF per request must
    // STILL hit the limit — proving x-real-ip is the rate-limit key, not the
    // client-controlled XFF (which, as the primary key, would give a fresh
    // bucket per request and never rate-limit).
    const realFixed = '198.51.100.200';
    let spoofGot429 = false; let spoofFirst = -1;
    for (let i = 0; i < VIEW_LIMIT + 8; i++) {
      const rs = await post('/api/analytics/view', { id: pubId }, { realip: realFixed, ip: `10.0.0.${i}`, ua: 'Mozilla/5.0 (X11 Linux) AppleWebKit Chrome/121 Safari/537.36' });
      if (rs.status === 429) { spoofGot429 = true; spoofFirst = i; break; }
    }
    ok('beacon: spoofed rotating XFF does NOT bypass the limit (x-real-ip is the key)', spoofGot429, `(first 429 at #${spoofFirst})`);

    // (iv) Server-side dedupe: a cookie-less replay from the same visitor/post/
    // day collapses to ONE row via UNIQUE(content_id, ip_hash, day_bucket).
    const dedIp = '198.51.100.210';
    const beforeDed = await countViews(pubId);
    const rDed1 = await post('/api/analytics/view', { id: pubId }, { realip: dedIp, ua: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/122 Safari/537.36' });
    const midDed = await countViews(pubId);
    const rDed2 = await post('/api/analytics/view', { id: pubId }, { realip: dedIp, ua: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/122 Safari/537.36' }); // NO cookie forwarded
    const afterDed = await countViews(pubId);
    ok('beacon: first no-cookie view writes exactly one row', rDed1.status === 200 && midDed === beforeDed + 1, `(${beforeDed}->${midDed})`);
    ok('beacon: cookie-less replay is server-deduped to ONE row', rDed2.status === 200 && afterDed === midDed, `(${midDed}->${afterDed})`);

    // unknown (well-formed uuid, not in DB) -> 404
    const rUnknown = await post('/api/analytics/view', { id: '123e4567-e89b-42d3-a456-426614174000' }, { ip: '203.0.113.55', ua: 'Mozilla/5.0 (Windows NT) AppleWebKit Chrome/120 Safari/537.36' });
    ok('beacon: unknown id rejected (404)', rUnknown.status === 404, `(got ${rUnknown.status})`);

    // malformed id -> 400
    const rBad = await post('/api/analytics/view', { id: 'not-a-uuid' }, { ip: '203.0.113.56', ua: 'Mozilla/5.0 (Windows NT) AppleWebKit Chrome/120 Safari/537.36' });
    ok('beacon: malformed id rejected (400)', rBad.status === 400, `(got ${rBad.status})`);

    // bot UA -> 204 skip, no new row
    const beforeBot = await countViews(pubId);
    const rBot = await post('/api/analytics/view', { id: pubId }, { ip: '203.0.113.57', ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
    const afterBot = await countViews(pubId);
    ok('beacon: bot UA skipped (204, no row)', rBot.status === 204 && afterBot === beforeBot, `(status ${rBot.status}, ${beforeBot}->${afterBot})`);

    // DNT -> 204 skip, no new row
    const beforeDnt = await countViews(pubId);
    const rDnt = await post('/api/analytics/view', { id: pubId }, { ip: '203.0.113.58', ua: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120 Safari/537.36', dnt: true });
    const afterDnt = await countViews(pubId);
    ok('beacon: DNT skipped (204, no row)', rDnt.status === 204 && afterDnt === beforeDnt, `(status ${rDnt.status}, ${beforeDnt}->${afterDnt})`);

    // cross-site origin -> 403
    const rEvil = await post('/api/analytics/view', { id: pubId }, { ip: '203.0.113.59', ua: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120 Safari/537.36', origin: 'https://evil.example' });
    ok('beacon: cross-site Origin rejected (403)', rEvil.status === 403, `(got ${rEvil.status})`);

    // PII: NO raw IP stored anywhere; the limiter stores a salted hash
    const { data: rlRows } = await sb.from('auth_rate_limit').select('ip, route').eq('route', 'analytics:view');
    const ips = (rlRows || []).map((r) => r.ip);
    ok('PII: raw client IP is NEVER stored in the limiter', !ips.includes(ipA) && !ips.includes(ipBurst));
    ok('PII: the limiter stores the SALTED HASH of the IP instead', ips.includes(hashIp(ipA)), `(expected hash present, ${ips.length} rows)`);
    const { data: evRows } = await sb.from('analytics_event').select('*').eq('content_id', pubId).limit(10);
    const cols = Object.keys(evRows?.[0] || {});
    // No RAW ip/ua/visitor/email column. The salted `ip_hash` + `day_bucket`
    // dedupe key added in 0009 is NOT PII and is expected.
    const rawPiiCols = cols.filter((c) => /(^|_)(ip|ua|user_?agent|visitor|email)(_|$)/i.test(c) && c !== 'ip_hash');
    ok('PII: analytics_event has NO raw ip/ua/visitor column (salted ip_hash OK)', rawPiiCols.length === 0, cols.join(','));
    ok('PII: dedupe key columns ip_hash + day_bucket present', cols.includes('ip_hash') && cols.includes('day_bucket'), cols.join(','));
    // The stored ip_hash is the one-way salted hash — never the raw IP.
    ok('PII: stored ip_hash is the salted hash, not any raw IP',
      (evRows || []).every((r) => r.ip_hash == null || (r.ip_hash !== ipA && r.ip_hash !== dedIp && !/\b(203\.0\.113|198\.51\.100|10\.0\.0)\b/.test(String(r.ip_hash)))));
    ok('PII: no view row carries a raw IP in path', !(evRows || []).some((r) => String(r.path || '').includes('203.0.113')));

    // aggregate over the real seeded rows resolves the published post as top
    const { data: liveEvents } = await sb.from('analytics_event').select('content_id, kind, path, created_at').eq('content_id', pubId);
    const liveAgg = aggregateAnalytics(liveEvents || [], { [pubId]: { title: 'x', type: 'blog', source: 'blog' } });
    ok('aggregate: live rows attribute to the published post', liveAgg.total >= 1 && liveAgg.top?.id === pubId, `(total ${liveAgg.total})`);
  } finally {
    stopServer(child);
  }

  // ---- E. Teardown ----
  console.log('\n== E. Teardown ==');
  try {
    for (const id of [pubId, draftId, removedId].filter(Boolean)) {
      await sb.from('analytics_event').delete().eq('content_id', id);
    }
    await sb.from('auth_rate_limit').delete().eq('route', 'analytics:view');
    for (const ext of created) {
      await sb.from('content').delete().eq('source', 'blog').eq('external_id', ext);
    }
    // confirm clean
    let residual = 0;
    for (const id of [pubId, draftId, removedId].filter(Boolean)) residual += await countViews(id);
    const { count: rlLeft } = await sb.from('auth_rate_limit').select('id', { count: 'exact', head: true }).eq('route', 'analytics:view');
    const { data: leftRows } = await sb.from('content').select('id').in('external_id', created);
    ok('teardown: analytics rows removed', residual === 0, `(residual ${residual})`);
    ok('teardown: analytics limiter rows removed', (rlLeft ?? 0) === 0, `(left ${rlLeft})`);
    ok('teardown: seeded content removed', (leftRows || []).length === 0, `(left ${(leftRows || []).length})`);
  } catch (e) {
    ok('teardown: clean', false, String(e && e.message));
  }

  console.log(`\n${failures === 0 ? 'ALL PASS ✅' : failures + ' FAILURE(S) ❌'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
