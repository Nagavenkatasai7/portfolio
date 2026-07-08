// GET /blog/rss.xml — RSS 2.0 feed of PUBLISHED public content, newest first.
//
// Reads the same anon public_content surface /blog does, so drafts/removed rows
// can never appear (RLS enforces it) and no internal/admin column is exposed.
// Everything is XML-escaped; served as application/rss+xml with CDN cache
// headers. force-dynamic so the feed always reflects the current published set.
import { getAnonServerClient } from '@/lib/supabase/server';
import { postTitle, postDescription, postPath } from '@/lib/post';
import { originFromHeaders, SITE_AUTHOR } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEED_LIMIT = 50;

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rfc822(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date(0).toUTCString() : d.toUTCString();
}

export async function GET(request) {
  const base = originFromHeaders(request.headers);
  const supabase = getAnonServerClient();

  let posts = [];
  if (supabase) {
    const { data, error } = await supabase
      .from('public_content')
      .select('id, source, type, title, body_md, payload, published_at, updated_at')
      .order('published_at', { ascending: false })
      .limit(FEED_LIMIT);
    if (!error && Array.isArray(data)) posts = data;
  }

  const items = posts.map((p) => {
    const link = `${base}${postPath(p.id)}`;
    return [
      '    <item>',
      `      <title>${xmlEscape(postTitle(p))}</title>`,
      `      <link>${xmlEscape(link)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      `      <pubDate>${rfc822(p.published_at)}</pubDate>`,
      `      <description>${xmlEscape(postDescription(p, 320))}</description>`,
      '    </item>',
    ].join('\n');
  }).join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(`${SITE_AUTHOR} — Blog`)}</title>`,
    `    <link>${xmlEscape(`${base}/blog`)}</link>`,
    `    <atom:link href="${xmlEscape(`${base}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    '    <description>Writing and posts on scalable systems, test automation, and AI-assisted development.</description>',
    '    <language>en-us</language>',
    `    <lastBuildDate>${rfc822(Date.now())}</lastBuildDate>`,
    items ? items : '',
    '  </channel>',
    '</rss>',
    '',
  ].filter((l) => l !== '').join('\n');

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
