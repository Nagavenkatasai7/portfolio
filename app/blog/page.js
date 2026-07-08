// /blog — the real, polished feed. Server component reading the public_content
// view (published, non-deleted rows only; internal columns excluded) with the
// anon key server-side. Statically generated with ISR (revalidate below) PLUS
// on-demand revalidatePath('/blog') fired by the gate after any write.
//
// Renders EACH content type well — native blog article, newsletter, a
// LinkedIn/X post (note + link to original), a video (privacy-friendly embed),
// and images — as a clean reverse-chronological feed with a source chip + date.
// Each item links to its own /blog/[id] page (per-post SEO + view analytics).
// Markdown bodies are sanitized server-side (formatting only; no raw
// HTML/script/iframe/svg — the sole iframe is the controlled VideoEmbed).
import { getAnonServerClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';
import {
  BLOG_CSS, SOURCE, formatDate, OriginalLink, ThreadView, PostMedia, PostPermalink,
} from './render';

export const metadata = {
  title: 'Blog | Naga Venkata Sai Chennu',
  description: 'Writing and posts on scalable systems, test automation, and AI-assisted development.',
  // Advertise the RSS feed in the document head for feed readers + browsers.
  alternates: {
    canonical: '/blog',
    types: { 'application/rss+xml': '/blog/rss.xml' },
  },
};

// Static + ISR: rebuilt at most every 5 minutes, or immediately on ingest.
export const revalidate = 300;

async function getPosts() {
  const supabase = getAnonServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('public_content')
    .select('id, source, type, title, body_md, payload, media, published_at')
    .order('published_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return data || [];
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div className="blog">
      <style>{BLOG_CSS}</style>
      <div className="wrap">
        <header className="head">
          <div className="mark">NC</div>
          <p className="eyebrow">Field notes</p>
          <h1>Writing &amp; <span className="hl">posts</span></h1>
          <p className="lede">Notes on scalable systems, test automation, and AI-assisted development — plus cross-posted updates from LinkedIn and X.</p>
          <div className="navrow">
            <a href="/">← Portfolio</a>
            <a href="/blog/rss.xml">RSS feed</a>
          </div>
        </header>

        {posts.length === 0 ? (
          <div className="empty">
            <div className="em-mark">¶</div>
            <h2>No posts yet</h2>
            <p>Long-form writing and cross-posted updates will show up here.</p>
            <a href="/">Back to portfolio</a>
          </div>
        ) : (
          <>
            <div className="feed">
              {posts.map((post, idx) => {
                const html = renderMarkdown(post.body_md);
                const src = SOURCE[post.source] || { label: post.source, cls: '' };
                return (
                  <article key={post.id} style={{ animationDelay: `${Math.min(idx, 8) * 0.05}s` }}>
                    <div className="top">
                      <span className={`chip ${src.cls}`}>{src.label}</span>
                      <time dateTime={new Date(post.published_at).toISOString()}>{formatDate(post.published_at)}</time>
                      <OriginalLink post={post} />
                    </div>
                    {post.title && <h2 className="title"><a href={`/blog/${post.id}`}>{post.title}</a></h2>}
                    {post.type === 'thread'
                      ? <ThreadView post={post} />
                      : (html && <div className="body" dangerouslySetInnerHTML={{ __html: html }} />)}
                    <PostMedia post={post} />
                    <PostPermalink id={post.id} />
                  </article>
                );
              })}
            </div>
            <p className="count">{posts.length} post{posts.length === 1 ? '' : 's'}</p>
            <div className="foot"><a href="/">← Back to portfolio</a></div>
          </>
        )}
      </div>
    </div>
  );
}
