// /blog — the real feed. Server component reading the public_content view
// (published rows only, internal columns excluded) with the anon key,
// server-side. Statically generated with ISR (revalidate below) PLUS on-demand
// revalidatePath('/blog') fired by the ingestion gate after a write.
//
// Colors/fonts are the legacy site's :root tokens (public/index.html) so the
// feed reads as native. Markdown bodies are sanitized server-side. Renders a
// clean empty state when there are no posts (or the DB isn't connected yet).
import { getAnonServerClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = {
  title: 'Blog | Naga Venkata Sai Chennu',
  description: 'Writing and posts on scalable systems, test automation, and AI-assisted development.',
};

// Static + ISR: rebuilt at most every 5 minutes, or immediately on ingest.
export const revalidate = 300;

const TYPE_LABELS = {
  text: 'Post', blog: 'Blog', newsletter: 'Newsletter',
  video: 'Video', image: 'Image', link: 'Link',
};

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

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return '';
  }
}

function mediaImages(media) {
  if (!Array.isArray(media)) return [];
  return media
    .filter((m) => m && typeof m.url === 'string' && /^https:\/\//i.test(m.url) && (m.kind === 'image' || !m.kind))
    .slice(0, 4);
}

const css = `
  .blog {
    --ink: #171411; --ink-soft: #423b34; --muted: #756b62;
    --paper: #fbf7ec; --paper-2: #f3ead8; --surface: #fffdf7;
    --line: #ddceb8; --lime: #caff60; --teal: #4db6aa; --coral: #e86f4a;
    --plum: #6e4d7d; --gold: #d7ad52;
    --radius: 8px; --shadow: 0 24px 70px rgba(23,20,17,.11);
    --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --serif: Georgia, "Times New Roman", serif;
    --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    min-height: 100vh;
    background:
      linear-gradient(90deg, rgba(23,20,17,.035) 1px, transparent 1px),
      linear-gradient(180deg, rgba(23,20,17,.03) 1px, transparent 1px),
      var(--paper);
    background-size: 44px 44px;
    color: var(--ink); font-family: var(--sans); line-height: 1.65;
    padding: 56px 24px;
  }
  .blog .wrap { max-width: 760px; margin: 0 auto; }
  .blog .mark {
    width: 48px; height: 48px; display: grid; place-items: center;
    border: 1px solid var(--ink); background: var(--lime); color: var(--ink);
    font-family: var(--serif); font-weight: 900; font-size: 20px;
  }
  .blog .eyebrow {
    font-size: 12px; font-weight: 700; letter-spacing: .13em;
    text-transform: uppercase; color: var(--muted); margin: 18px 0 6px;
  }
  .blog h1 { font-size: clamp(28px, 5vw, 44px); font-weight: 900; margin: 0 0 6px; }
  .blog .lede { color: var(--muted); margin: 0 0 36px; }
  .blog .empty {
    border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 40px; text-align: center;
  }
  .blog .empty h2 { margin: 0 0 8px; font-size: 22px; font-weight: 900; }
  .blog .empty p { color: var(--muted); margin: 0 0 20px; }
  .blog a.back, .blog .empty a {
    display: inline-block; border: 1px solid var(--ink); border-radius: 8px;
    padding: 10px 18px; color: var(--ink); text-decoration: none; font-weight: 600;
    background: var(--surface);
  }
  .blog article {
    border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 26px; margin: 0 0 22px;
  }
  .blog .row { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; flex-wrap: wrap; }
  .blog .chip {
    font-size: 11px; font-weight: 700; padding: 2px 9px; border: 1px solid var(--ink);
    border-radius: 999px; background: var(--paper-2); text-transform: uppercase; letter-spacing: .05em;
  }
  .blog .chip.blog, .blog .chip.text { background: var(--lime); }
  .blog .chip.newsletter { background: var(--gold); color: #241d09; }
  .blog .chip.video { background: var(--coral); color: #fff; }
  .blog .chip.image { background: var(--teal); color: #06231f; }
  .blog time { font-size: 13px; color: var(--muted); font-family: var(--mono); }
  .blog h2.title { font-size: 22px; font-weight: 900; margin: 0 0 12px; line-height: 1.25; }
  .blog .body { color: var(--ink-soft); }
  .blog .body :is(h1,h2,h3,h4) { color: var(--ink); font-weight: 800; margin: 18px 0 8px; }
  .blog .body p { margin: 0 0 12px; }
  .blog .body a { color: var(--coral); }
  .blog .body pre {
    background: #221d18; color: #f3ead8; padding: 14px; border-radius: 8px;
    overflow-x: auto; font-family: var(--mono); font-size: 13px;
  }
  .blog .body code { font-family: var(--mono); font-size: .92em; }
  .blog .body blockquote {
    border-left: 3px solid var(--line); margin: 0 0 12px; padding: 2px 0 2px 14px; color: var(--muted);
  }
  .blog .media { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 14px 0 0; }
  .blog .media img { width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--line); display: block; }
  .blog .footer { margin-top: 40px; }
`;

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div className="blog">
      <style>{css}</style>
      <div className="wrap">
        <div className="mark">NC</div>
        <p className="eyebrow">Blog</p>
        <h1>Writing &amp; posts</h1>
        <p className="lede">Notes on scalable systems, test automation, and AI-assisted development.</p>

        {posts.length === 0 ? (
          <div className="empty">
            <h2>No posts yet</h2>
            <p>Long-form writing and cross-posted updates will show up here.</p>
            <a href="/">Back to portfolio</a>
          </div>
        ) : (
          <>
            {posts.map((post) => {
              const html = renderMarkdown(post.body_md);
              const imgs = mediaImages(post.media);
              const typeLabel = TYPE_LABELS[post.type] || post.type;
              return (
                <article key={post.id}>
                  <div className="row">
                    <span className={`chip ${post.type}`}>{typeLabel}</span>
                    <time dateTime={new Date(post.published_at).toISOString()}>{formatDate(post.published_at)}</time>
                  </div>
                  {post.title && <h2 className="title">{post.title}</h2>}
                  {html && <div className="body" dangerouslySetInnerHTML={{ __html: html }} />}
                  {imgs.length > 0 && (
                    <div className="media">
                      {imgs.map((m, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={m.url} alt={typeof m.alt === 'string' ? m.alt : ''} loading="lazy" />
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
            <div className="footer">
              <a className="back" href="/">Back to portfolio</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
