// Shared shell + styling for the small /newsletter/* landing pages (pending,
// confirmed, unsubscribed). Same "Luminous" design tokens + pill buttons as
// /blog, scoped under .nl. Server component only (no client JS). The CSS is an
// inline <style> template string — the repo-wide App Router styling convention
// (see app/blog/render.js). These pages are noindex (see each page's metadata).
export const NEWSLETTER_CSS = `
  .nl {
    --ink: #171411; --ink-soft: #423b34; --muted: #756b62;
    --paper: #fbf7ec; --paper-2: #f3ead8; --surface: #fffdf7;
    --line: #ddceb8; --lime: #caff60; --coral: #e86f4a; --plum: #6e4d7d;
    --radius: 8px; --shadow: 0 24px 70px rgba(23,20,17,.11);
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --serif: Georgia, "Times New Roman", serif;
    --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background:
      linear-gradient(90deg, rgba(23,20,17,.035) 1px, transparent 1px),
      linear-gradient(180deg, rgba(23,20,17,.03) 1px, transparent 1px),
      var(--paper);
    background-size: 44px 44px;
    color: var(--ink); font-family: var(--sans); line-height: 1.65; padding: 64px 24px;
  }
  .nl *, .nl *::before, .nl *::after { box-sizing: border-box; }
  .nl ::selection { background: var(--lime); color: var(--ink); }
  .nl .card {
    max-width: 560px; width: 100%; text-align: center;
    border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 48px 40px;
    animation: nl-rise .5s var(--ease) both;
  }
  @keyframes nl-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .nl .card { animation: none; } }
  .nl .mark {
    width: 52px; height: 52px; margin: 0 auto; display: grid; place-items: center;
    border: 1px solid var(--ink); background: var(--lime); color: var(--ink);
    font-family: var(--serif); font-weight: 900; font-size: 22px;
    box-shadow: 5px 5px 0 rgba(23,20,17,.12);
  }
  .nl .eyebrow {
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: var(--coral); margin: 26px 0 8px;
  }
  .nl h1 {
    font-family: var(--serif); font-size: clamp(30px, 5vw, 46px); font-weight: 700;
    line-height: 1.05; letter-spacing: -0.015em; margin: 0 0 14px; text-wrap: balance;
  }
  .nl p { color: var(--muted); margin: 0 auto 8px; font-size: 16px; max-width: 46ch; }
  .nl .navrow { margin-top: 26px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .nl .navrow a {
    display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ink);
    border-radius: 999px; padding: 9px 18px; font-weight: 800; font-size: 13px;
    background: var(--surface); color: inherit; text-decoration: none;
    transition: transform 160ms var(--ease), box-shadow 160ms var(--ease);
  }
  .nl .navrow a:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(23,20,17,.12); }
`;

export function NewsletterShell({ mark = 'NC', eyebrow, title, children }) {
  return (
    <main className="nl">
      <style>{NEWSLETTER_CSS}</style>
      <div className="card">
        <div className="mark">{mark}</div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
        <div className="navrow">
          <a href="/">← Portfolio</a>
          <a href="/blog">Read the blog</a>
        </div>
      </div>
    </main>
  );
}
