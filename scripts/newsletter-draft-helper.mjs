// ============================================================
// scripts/newsletter-draft-helper.mjs — the weekly drafting session's CLI
// (Phase N3). Every write goes through the SAME server-only chokepoints the
// admin composer + newsletter studio use — lib/compose.js#buildComposerItem,
// lib/gate.js#ingestContent, lib/newsletter_issues.js — never a raw
// insert/update, never psql/raw SQL. Requires --conditions=react-server
// (these libs `import 'server-only'`), same as every other verify/backfill
// script in this repo:
//
//   node --conditions=react-server scripts/newsletter-draft-helper.mjs links
//   node --conditions=react-server scripts/newsletter-draft-helper.mjs create-draft \
//     --title "..." --subject "..." --preheader "..." --hero <url|-> --body-file issue.md
//   node --conditions=react-server scripts/newsletter-draft-helper.mjs mark-used \
//     --issue <contentId> --ids <id,id,...>
//   (equivalently: npm run newsletter:draft -- <subcommand> ...)
//
// NEVER approves/sends/publishes anything: every content row create-draft
// makes is type='newsletter' status='draft' (built through the exact same
// buildComposerItem() the /admin/compose UI uses, with publishNow ALWAYS
// false), and its issue meta row starts — and stays — status='draft' unless
// the OWNER approves it by hand in /admin/newsletter. See
// NEWSLETTER-DRAFTING.md for the full weekly workflow this CLI serves.
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function loadEnvLocal() {
  try {
    const txt = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env.local — env comes from the shell */ }
}
loadEnvLocal();

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_SVC) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.');
  console.error('Run `vercel env pull .env.local --environment=production --yes` first, then delete it after.');
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i++; }
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node --conditions=react-server scripts/newsletter-draft-helper.mjs <command> [options]

Commands:
  links
      Print queued newsletter_links + the last 7 days of linkedin_auto posts,
      as clean JSON candidate material.

  create-draft --title "..." --subject "..." [--preheader "..."] --hero <url|-> --body-file <path.md>
      Create a DRAFT newsletter content row (through the same composer
      chokepoint /admin/compose uses) + its issue meta. Never approves/sends.
      Pass --hero - to skip a hero image.

  mark-used --issue <contentId> --ids <id,id,...>
      Flip the given newsletter_links to used, stamped with the issue that
      consumed them. Safe to re-run (already-used ids are reported, not an error).`);
}

// ---- links -----------------------------------------------------------------
async function cmdLinks() {
  const { listLinks } = await import('../lib/newsletter_issues.js');
  const { getServiceClient } = await import('../lib/supabase/server.js');

  const allLinks = await listLinks({ limit: 500 });
  const queuedLinks = allLinks
    .filter((l) => l.status === 'queued')
    .map((l) => ({ id: l.id, url: l.url, note: l.note, added: l.added_at }));

  const supabase = getServiceClient();
  if (!supabase) throw new Error('server_not_configured');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('content')
    .select('id, body_md, payload, published_at')
    .eq('source', 'linkedin_auto')
    .eq('status', 'published')
    .gte('published_at', sevenDaysAgo)
    .order('published_at', { ascending: false });
  if (error) throw new Error(`content read failed: ${error.message}`);

  const linkedinCandidates = (rows || []).map((r) => {
    const text = typeof r.body_md === 'string' ? r.body_md.trim().replace(/\s+/g, ' ') : '';
    return { id: r.id, excerpt: text.slice(0, 80), url: r.payload?.link?.url || null };
  });

  console.log(JSON.stringify({ queuedLinks, linkedinCandidates }, null, 2));
}

// ---- create-draft ------------------------------------------------------------
async function cmdCreateDraft(args) {
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
  const preheader = typeof args.preheader === 'string' ? args.preheader.trim() : '';
  const hero = typeof args.hero === 'string' ? args.hero.trim() : '';
  const bodyFile = typeof args['body-file'] === 'string' ? args['body-file'] : '';

  const missing = [];
  if (!title) missing.push('--title');
  if (!subject) missing.push('--subject');
  if (!hero) missing.push('--hero (pass "-" for none)');
  if (!bodyFile) missing.push('--body-file');
  if (missing.length) {
    console.error(`Missing required option(s): ${missing.join(', ')}\n`);
    usage(); process.exit(2);
  }

  let bodyMd;
  try {
    bodyMd = readFileSync(resolve(process.cwd(), bodyFile), 'utf8');
  } catch (e) {
    console.error(`Could not read --body-file "${bodyFile}": ${e.message}`);
    process.exit(1);
  }
  if (!bodyMd.trim()) {
    console.error(`--body-file "${bodyFile}" is empty.`);
    process.exit(1);
  }

  const { buildComposerItem, ComposeError } = await import('../lib/compose.js');
  const { ingestContent, GateError } = await import('../lib/gate.js');
  const { ensureIssueMeta, IssueError } = await import('../lib/newsletter_issues.js');
  const { siteBaseUrl } = await import('../lib/site.js');

  let item;
  try {
    // publishNow is NEVER set — every draft-helper row is created as a draft,
    // exactly like an /admin/compose submission with "Publish now" unticked.
    item = buildComposerItem({ kind: 'newsletter', title, body_md: bodyMd, publishNow: false });
  } catch (e) {
    if (e instanceof ComposeError) { console.error(`Invalid input: ${e.code}`); process.exit(1); }
    throw e;
  }

  let result;
  try {
    result = await ingestContent(item);
  } catch (e) {
    if (e instanceof GateError) {
      console.error(`Content write failed: ${e.code}${e.detail ? ` (${e.detail})` : ''}`);
      process.exit(e.code === 'server_not_configured' ? 2 : 1);
    }
    throw e;
  }

  let meta;
  try {
    meta = await ensureIssueMeta(result.id, {
      subject,
      preheader: preheader || null,
      heroImageUrl: hero === '-' ? null : hero,
    });
  } catch (e) {
    if (e instanceof IssueError) {
      console.error(`Issue meta write failed: ${e.code}${e.detail ? ` (${e.detail})` : ''}`);
      process.exit(1);
    }
    throw e;
  }

  const adminUrl = `${siteBaseUrl()}/admin/newsletter`;
  console.log(`Draft created: "${title}"`);
  console.log(`  content row: ${result.id} (${result.created ? 'new' : 'updated'}, external_id=${result.external_id})`);
  console.log(`  issue meta: status=${meta.status}, subject="${meta.subject}"`);
  console.log(JSON.stringify({ contentId: result.id, adminUrl }, null, 2));
}

// ---- mark-used ---------------------------------------------------------------
async function cmdMarkUsed(args) {
  const issue = typeof args.issue === 'string' ? args.issue.trim() : '';
  const idsRaw = typeof args.ids === 'string' ? args.ids : '';
  const ids = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  if (!issue || !ids.length) {
    console.error('Usage: mark-used --issue <contentId> --ids <id,id,...>\n');
    usage(); process.exit(2);
  }

  const { getIssueMeta, markLinksUsed, IssueError } = await import('../lib/newsletter_issues.js');

  let meta;
  try {
    meta = await getIssueMeta(issue);
  } catch {
    console.error(`--issue "${issue}" is not a valid content id.`);
    process.exit(2);
  }
  if (!meta) {
    console.error(`No issue meta found for content id ${issue}. Run create-draft first (or check the id).`);
    process.exit(1);
  }

  let result;
  try {
    result = await markLinksUsed(ids, issue);
  } catch (e) {
    if (e instanceof IssueError) {
      console.error(`mark-used failed: ${e.code}${e.detail ? ` (${e.detail})` : ''}`);
      process.exit(1);
    }
    throw e;
  }

  console.log(`Marked used: ${result.updated.length} link(s) for issue ${issue}.`);
  if (result.skipped.length) {
    console.log(`Skipped (already used/discarded, or unknown id): ${result.skipped.join(', ')}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

// ---- dispatch ------------------------------------------------------------
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (cmd) {
    case 'links': await cmdLinks(); break;
    case 'create-draft': await cmdCreateDraft(args); break;
    case 'mark-used': await cmdMarkUsed(args); break;
    case '--help':
    case '-h':
      usage(); process.exit(0);
      break;
    default:
      if (cmd) console.error(`Unknown command: ${cmd}\n`);
      usage(); process.exit(2);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err?.stack || err?.message || err);
  process.exit(1);
});
