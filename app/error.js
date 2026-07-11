'use client';
// Route-segment error boundary for the app-router surfaces. Catches a render/data
// error in a page and offers a recover (reset) plus a safe exit. Client component
// with the required { error, reset } props. Shows only the error digest (a hash),
// never the raw message, so nothing internal leaks.
import { boundaryCss } from './boundary-ui';

export default function Error({ error, reset }) {
  return (
    <div className="bnd">
      <style>{boundaryCss}</style>
      <div className="card">
        <div className="mark">NC</div>
        <p className="eyebrow">Something broke</p>
        <h1>An <span className="hl">unexpected error</span> occurred</h1>
        <p>This page hit a snag. Try again, or head back to safety.</p>
        {error?.digest && <p className="digest">ref: {error.digest}</p>}
        <div className="row">
          <button type="button" className="primary" onClick={() => reset()}>Try again</button>
          <a href="/blog">View the blog</a>
        </div>
      </div>
    </div>
  );
}
