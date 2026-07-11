'use client';
// Last-resort error boundary: catches errors thrown in the ROOT layout itself.
// It REPLACES the root layout, so it must render its own <html> and <body>.
// Client component with { error, reset }; self-contained, on-brand, no deps.
import { boundaryCss } from './boundary-ui';

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body>
        <div className="bnd">
          <style>{boundaryCss}</style>
          <div className="card">
            <div className="mark">NC</div>
            <p className="eyebrow">Something broke</p>
            <h1>The site hit an <span className="hl">unexpected error</span></h1>
            <p>Please try again. If it keeps happening, come back in a little while.</p>
            {error?.digest && <p className="digest">ref: {error.digest}</p>}
            <div className="row">
              <button type="button" className="primary" onClick={() => reset()}>Try again</button>
              <a href="/">Portfolio home</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
