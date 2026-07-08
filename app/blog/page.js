// /blog — the real, polished feed. Server component reading the public_content
// view (published, non-deleted rows only; internal columns excluded) with the
// anon key server-side. Statically generated with ISR (revalidate below) PLUS
// on-demand revalidatePath('/blog') fired by the gate after any write.
//
// Renders EACH content type well — native blog article, newsletter, a
// LinkedIn/X post (note + link to original), a video (privacy-friendly embed),
// and images — as a clean reverse-chronological feed with a source chip + date.
// Colors/fonts are the legacy site's "Luminous" :root tokens so it reads as
// native. Markdown bodies are sanitized server-side (formatting only; no raw
// HTML/script/iframe/svg — the sole iframe is the controlled VideoEmbed).
import { getAnonServerClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';
import VideoEmbed from './VideoEmbed';

export const metadata = {
  title: 'Blog | Naga Venkata Sai Chennu',
  description: 'Writing and posts on scalable systems, test automation, and AI-assisted development.',
};

// Static + ISR: rebuilt at most every 5 minutes, or immediately on ingest.
export const revalidate = 300;

// Source → chip label + class (chips are keyed on SOURCE, the most informative).
const SOURCE = {
  blog: { label: 'Blog', cls: 'blog' },
  newsletter: { label: 'Newsletter', cls: 'newsletter' },
  video: { label: 'Video', cls: 'video' },
  image: { label: 'Image', cls: 'image' },
  linkedin_manual: { label: 'LinkedIn', cls: 'linkedin' },
  linkedin_auto: { label: 'LinkedIn', cls: 'linkedin' },
  x_manual: { label: 'X', cls: 'x' },
  x_auto: { label: 'X', cls: 'x' },
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
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return ''; }
}

function imageMedia(media) {
  if (!Array.isArray(media)) return [];
  return media.filter((m) => m && typeof m.url === 'string' && /^https:\/\//i.test(m.url) && m.kind === 'image').slice(0, 8);
}
function videoMedia(media) {
  if (!Array.isArray(media)) return [];
  return media.filter((m) => m && typeof m.url === 'string' && /^https:\/\/\S+\.(mp4|webm)(?:$|[?#])/i.test(m.url) && m.kind === 'video').slice(0, 4);
}

const css = `
  .blog {
    --ink: #171411; --ink-soft: #423b34; --muted: #756b62;
    --paper: #fbf7ec; --paper-2: #f3ead8; --surface: #fffdf7;
    --line: #ddceb8; --lime: #caff60; --teal: #4db6aa; --coral: #e86f4a;
    --plum: #6e4d7d; --gold: #d7ad52;
    --radius: 8px; --shadow: 0 24px 70px rgba(23,20,17,.11);
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
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
    padding: 64px 24px 96px;
  }
  .blog *, .blog *::before, .blog *::after { box-sizing: border-box; }
  .blog ::selection { background: var(--lime); color: var(--ink); }
  .blog .wrap { max-width: 760px; margin: 0 auto; }
  .blog a { color: inherit; }

  .blog .head { position: relative; margin-bottom: 44px; }
  .blog .mark {
    width: 50px; height: 50px; display: grid; place-items: center;
    border: 1px solid var(--ink); background: var(--lime); color: var(--ink);
    font-family: var(--serif); font-weight: 900; font-size: 21px;
    box-shadow: 5px 5px 0 rgba(23,20,17,.12);
  }
  .blog .eyebrow {
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: var(--coral); margin: 22px 0 8px;
  }
  .blog h1 {
    font-family: var(--serif); font-size: clamp(34px, 6vw, 60px); font-weight: 700;
    line-height: 1.0; letter-spacing: -0.015em; margin: 0 0 12px; text-wrap: balance;
  }
  .blog h1 .hl { background: linear-gradient(180deg, transparent 56%, rgba(202,255,96,.85) 56%); padding: 0 .04em; }
  .blog .lede { color: var(--muted); margin: 0; font-size: 17px; max-width: 56ch; }
  .blog .navrow { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
  .blog .navrow a {
    display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ink);
    border-radius: 999px; padding: 8px 16px; font-weight: 800; font-size: 13px; background: var(--surface);
    transition: transform 160ms var(--ease), box-shadow 160ms var(--ease);
  }
  .blog .navrow a:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(23,20,17,.12); }

  .blog .empty {
    border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 56px 40px; text-align: center;
  }
  .blog .empty .em-mark { font-family: var(--serif); font-size: 40px; color: var(--muted); margin-bottom: 8px; }
  .blog .empty h2 { margin: 0 0 8px; font-family: var(--serif); font-size: 26px; font-weight: 700; }
  .blog .empty p { color: var(--muted); margin: 0 0 22px; }
  .blog .empty a {
    display: inline-block; border: 1px solid var(--ink); border-radius: 999px;
    padding: 10px 20px; color: #fff; background: var(--ink); text-decoration: none; font-weight: 800;
    box-shadow: 5px 5px 0 var(--lime);
  }

  .blog .feed { display: flex; flex-direction: column; gap: 24px; }
  .blog article {
    border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 28px; position: relative;
    animation: blog-rise .5s var(--ease) both;
    transition: transform 200ms var(--ease), box-shadow 200ms var(--ease);
  }
  .blog article:hover { transform: translateY(-3px); box-shadow: 0 30px 80px rgba(23,20,17,.14); }
  @keyframes blog-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .blog article { animation: none; } .blog article:hover { transform: none; } }

  .blog .top { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; flex-wrap: wrap; }
  .blog .chip {
    font-size: 11px; font-weight: 800; padding: 3px 10px; border: 1px solid var(--ink);
    border-radius: 999px; background: var(--paper-2); text-transform: uppercase; letter-spacing: .05em;
  }
  .blog .chip.blog { background: var(--lime); }
  .blog .chip.newsletter { background: var(--gold); color: #241d09; }
  .blog .chip.video { background: var(--coral); color: #fff; }
  .blog .chip.image { background: var(--teal); color: #06231f; }
  .blog .chip.linkedin { background: #dfe9ff; color: #0a2540; border-color: #0a2540; }
  .blog .chip.x { background: #1a1a1a; color: #fff; }
  .blog time { font-size: 13px; color: var(--muted); font-family: var(--mono); }
  .blog .top .orig { margin-left: auto; font-size: 12.5px; font-weight: 800; color: var(--coral); font-family: var(--mono); }
  .blog .top .orig:hover { text-decoration: underline; }

  .blog h2.title { font-family: var(--serif); font-size: 27px; font-weight: 700; margin: 0 0 14px; line-height: 1.15; letter-spacing: -0.01em; }
  .blog .body { color: var(--ink-soft); font-size: 16px; }
  .blog .body :is(h1,h2,h3,h4) { color: var(--ink); font-family: var(--serif); font-weight: 700; margin: 22px 0 10px; line-height: 1.2; }
  .blog .body h1 { font-size: 26px; } .blog .body h2 { font-size: 22px; } .blog .body h3 { font-size: 19px; }
  .blog .body p { margin: 0 0 14px; }
  .blog .body a { color: var(--coral); text-decoration: underline; text-underline-offset: 2px; }
  .blog .body ul, .blog .body ol { margin: 0 0 14px; padding-left: 22px; }
  .blog .body li { margin: 4px 0; }
  .blog .body pre { background: #221d18; color: #f3ead8; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: var(--mono); font-size: 13px; margin: 0 0 14px; }
  .blog .body code { font-family: var(--mono); font-size: .92em; }
  .blog .body :not(pre) > code { background: var(--paper-2); padding: 1px 5px; border-radius: 4px; }
  .blog .body blockquote { border-left: 3px solid var(--lime); margin: 0 0 14px; padding: 4px 0 4px 16px; color: var(--muted); font-style: italic; }

  .blog .embed { position: relative; aspect-ratio: 16 / 9; margin: 16px 0 4px; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); background: #000; }
  .blog .embed iframe, .blog .embed video { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }

  .blog .media { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0 0; }
  .blog .media.single { grid-template-columns: 1fr; }
  .blog .media a { display: block; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); background: var(--paper-2); }
  .blog .media img { width: 100%; height: 100%; max-height: 460px; object-fit: cover; display: block; transition: transform 300ms var(--ease); }
  .blog .media a:hover img { transform: scale(1.03); }
  .blog .vidfile { width: 100%; border-radius: 8px; border: 1px solid var(--line); margin-top: 12px; display: block; background: #000; }

  .blog .foot { margin-top: 48px; text-align: center; }
  .blog .foot a { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ink); border-radius: 999px; padding: 10px 20px; font-weight: 800; font-size: 14px; background: var(--surface); }
  .blog .foot a:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(23,20,17,.12); }
  .blog .count { font-family: var(--mono); font-size: 12px; color: var(--muted); margin: 14px 0 0; text-align: center; }
`;

function OriginalLink({ post }) {
  const url = post.payload?.link?.url;
  if (!url || !/^https:\/\//i.test(url)) return null;
  const label = post.source?.startsWith('linkedin') ? 'View on LinkedIn ↗' : post.source?.startsWith('x') ? 'View on X ↗' : 'View original ↗';
  return <a className="orig" href={url} rel="nofollow noopener noreferrer" target="_blank">{label}</a>;
}

function PostMedia({ post }) {
  const imgs = imageMedia(post.media);
  const vids = videoMedia(post.media);
  return (
    <>
      {post.type === 'video' && post.payload?.video && <VideoEmbed video={post.payload.video} />}
      {vids.map((m, i) => (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video key={`v${i}`} className="vidfile" src={m.url} controls preload="metadata" playsInline />
      ))}
      {imgs.length > 0 && (
        <div className={`media${imgs.length === 1 ? ' single' : ''}`}>
          {imgs.map((m, i) => (
            <a key={`i${i}`} href={m.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={typeof m.alt === 'string' ? m.alt : ''} loading="lazy"
                width={m.width || undefined} height={m.height || undefined} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div className="blog">
      <style>{css}</style>
      <div className="wrap">
        <header className="head">
          <div className="mark">NC</div>
          <p className="eyebrow">Field notes</p>
          <h1>Writing &amp; <span className="hl">posts</span></h1>
          <p className="lede">Notes on scalable systems, test automation, and AI-assisted development — plus cross-posted updates from LinkedIn and X.</p>
          <div className="navrow">
            <a href="/">← Portfolio</a>
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
                    {post.title && <h2 className="title">{post.title}</h2>}
                    {html && <div className="body" dangerouslySetInnerHTML={{ __html: html }} />}
                    <PostMedia post={post} />
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
