export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <main className="hero" style={{ minHeight: '100svh' }}>
      <div className="container">
        <span className="eyebrow">404</span>
        <h1 className="section-title" style={{ marginTop: 16 }}>
          This page doesn’t exist.
        </h1>
        <p className="section-sub">The site was rebuilt, and some old links no longer work.</p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="/">
            Go to the homepage
          </a>
        </div>
      </div>
    </main>
  );
}
