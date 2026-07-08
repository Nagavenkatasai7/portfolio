// /blog/[id] — a single post's own page: the canonical permalink where SEO
// (title/description/canonical/Open Graph/Twitter/JSON-LD) lives and where the
// privacy-friendly view beacon fires. Keyed on the immutable content uuid so it
// is well-defined for every content type. force-dynamic: always reflects the
// current published set (a removed post 404s immediately, no stale ISR cache).
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getAnonServerClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';
import { isUuid, postTitle, postDescription, postPath } from '@/lib/post';
import { siteBaseUrl, DEFAULT_OG_IMAGE, SITE_AUTHOR } from '@/lib/site';
import {
  BLOG_CSS, SOURCE, formatDate, OriginalLink, ThreadView, PostMedia,
} from '../render';

export const dynamic = 'force-dynamic';

// One DB read per request, shared by generateMetadata + the component.
const getPost = cache(async (id) => {
  if (!isUuid(id)) return null;
  const supabase = getAnonServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('public_content')
    .select('id, source, type, title, body_md, payload, media, published_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return data || null;
});

export async function generateMetadata({ params }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) {
    return { title: 'Post not found | Naga Venkata Sai Chennu', robots: { index: false, follow: false } };
  }
  const title = postTitle(post);
  const description = postDescription(post);
  const url = postPath(post.id);
  return {
    title: `${title} | Naga Venkata Sai Chennu`,
    description,
    alternates: {
      canonical: url,
      types: { 'application/rss+xml': '/blog/rss.xml' },
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: SITE_AUTHOR,
      publishedTime: safeIso(post.published_at),
      modifiedTime: safeIso(post.updated_at),
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

function safeIso(ts) {
  try { return new Date(ts).toISOString(); } catch { return undefined; }
}

function jsonLd(post) {
  const base = siteBaseUrl();
  const abs = `${base}${postPath(post.id)}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: postTitle(post),
    description: postDescription(post),
    url: abs,
    mainEntityOfPage: abs,
    datePublished: safeIso(post.published_at),
    dateModified: safeIso(post.updated_at) || safeIso(post.published_at),
    image: `${base}${DEFAULT_OG_IMAGE}`,
    author: { '@type': 'Person', name: SITE_AUTHOR, url: base },
    publisher: { '@type': 'Person', name: SITE_AUTHOR },
  };
  // Escape "<" so the serialized JSON can never terminate the <script> block.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Fire-and-forget view beacon: respects DNT/GPC, sends the (validated) uuid to
// the public analytics endpoint. Inline (allowed by the /blog CSP's
// script-src 'self' 'unsafe-inline'); connect-src 'self' allows the same-origin
// POST. `id` is a server-validated uuid, embedded via JSON.stringify.
function beaconScript(id) {
  return `(function(){try{var d=navigator.doNotTrack||window.doNotTrack||navigator.msDoNotTrack;`
    + `if(d==='1'||d==='yes')return;if(navigator.globalPrivacyControl)return;`
    + `var b=JSON.stringify({id:${JSON.stringify(id)},path:location.pathname});`
    + `fetch('/api/analytics/view',{method:'POST',headers:{'content-type':'application/json'},`
    + `body:b,keepalive:true,credentials:'same-origin'}).catch(function(){});`
    + `}catch(e){}})();`;
}

const POST_TITLE_CSS = `.blog h1.title{font-family:var(--serif);font-size:clamp(30px,5vw,44px);`
  + `font-weight:700;line-height:1.12;letter-spacing:-0.015em;margin:4px 0 10px;text-wrap:balance;}`
  + `.blog article.single{animation:none;}`;

export default async function PostPage({ params }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  const html = post.type === 'thread' ? '' : renderMarkdown(post.body_md);
  const src = SOURCE[post.source] || { label: post.source, cls: '' };
  const title = postTitle(post);

  return (
    <div className="blog">
      <style>{BLOG_CSS}</style>
      <style>{POST_TITLE_CSS}</style>
      {/* Structured data for search engines. Non-executable data block. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(post) }} />

      <div className="wrap">
        <div className="navrow backrow">
          <a href="/blog">← All posts</a>
          <a href="/">Portfolio</a>
        </div>

        <article className="single">
          <div className="top">
            <span className={`chip ${src.cls}`}>{src.label}</span>
            <time dateTime={safeIso(post.published_at)}>{formatDate(post.published_at)}</time>
            <OriginalLink post={post} />
          </div>
          <h1 className="title">{title}</h1>
          {post.type === 'thread'
            ? <ThreadView post={post} />
            : (html && <div className="body" dangerouslySetInnerHTML={{ __html: html }} />)}
          <PostMedia post={post} />
        </article>

        <div className="foot"><a href="/blog">← Back to all posts</a></div>
      </div>

      {/* View beacon — last, so it never blocks render. */}
      <script dangerouslySetInnerHTML={{ __html: beaconScript(post.id) }} />
    </div>
  );
}
