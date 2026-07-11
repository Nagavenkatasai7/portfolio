// Global 404 for the app-router surfaces (/blog, /admin/*). Rendered for any
// notFound() call (e.g. /admin/edit/[id] on a missing row) and unmatched app
// routes. Server component, on-brand, no client JS.
import { boundaryCss } from './boundary-ui';

export const metadata = { title: 'Not found', robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <div className="bnd">
      <style>{boundaryCss}</style>
      <div className="card">
        <div className="mark">NC</div>
        <p className="eyebrow">404</p>
        <h1>This page <span className="hl">wandered off</span></h1>
        <p>The link may be broken, or the content was moved or removed.</p>
        <div className="row">
          <a href="/blog" className="primary">View the blog</a>
          <a href="/">Portfolio home</a>
        </div>
      </div>
    </div>
  );
}
