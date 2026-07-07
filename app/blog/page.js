// Placeholder /blog route (Phase A). A later phase wires this up to real
// content (Supabase-backed ingestion). Colors/fonts below are copied
// verbatim from the legacy site's :root custom properties and body rules in
// public/index.html so this page reads as part of the same site.
export const metadata = {
  title: "Blog | Naga Venkata Sai Chennu",
};

const css = `
  .blog-placeholder {
    --ink: #171411;
    --muted: #756b62;
    --paper: #fbf7ec;
    --line: #ddceb8;
    --lime: #caff60;
    --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --serif: Georgia, "Times New Roman", serif;

    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      linear-gradient(90deg, rgba(23, 20, 17, 0.035) 1px, transparent 1px),
      linear-gradient(180deg, rgba(23, 20, 17, 0.03) 1px, transparent 1px),
      var(--paper);
    background-size: 44px 44px;
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.65;
    text-align: center;
    padding: 48px 24px;
  }

  .blog-placeholder .mark {
    width: 48px;
    height: 48px;
    margin: 0 auto 24px;
    display: grid;
    place-items: center;
    border: 1px solid var(--ink);
    background: var(--lime);
    color: var(--ink);
    font-family: var(--serif);
    font-weight: 900;
    font-size: 20px;
  }

  .blog-placeholder .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
  }

  .blog-placeholder h1 {
    font-size: clamp(28px, 5vw, 44px);
    font-weight: 900;
    margin-bottom: 12px;
  }

  .blog-placeholder p {
    color: var(--muted);
    font-size: 16px;
    max-width: 40ch;
    margin: 0 auto 28px;
  }

  .blog-placeholder a {
    display: inline-block;
    border: 1px solid var(--ink);
    border-radius: 8px;
    padding: 10px 20px;
    color: var(--ink);
    text-decoration: none;
    font-weight: 600;
    transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .blog-placeholder a:hover {
    transform: translateY(-2px);
    box-shadow: 0 24px 70px rgba(23, 20, 17, 0.11);
  }
`;

export default function BlogPage() {
  return (
    <div className="blog-placeholder">
      <style>{css}</style>
      <div>
        <div className="mark">NC</div>
        <p className="eyebrow">Blog</p>
        <h1>Coming soon</h1>
        <p>Long-form writing on scalable systems, test automation, and AI-assisted development is on the way.</p>
        <a href="/">Back to portfolio</a>
      </div>
    </div>
  );
}
