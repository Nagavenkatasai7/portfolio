// Instant loading skeleton for the force-dynamic /admin/* routes. Shown while the
// server component fetches session + content, so a slow DB round-trip doesn't
// leave a blank screen. Reuses the admin stylesheet + spinner. Server component.
import { adminCss } from './ui';

export default function AdminLoading() {
  return (
    <div className="adm">
      <style>{adminCss}</style>
      <div className="wrap">
        <div className="mark">NC</div>
        <p className="eyebrow">Admin</p>
        <h1><span className="hl">Loading</span> your workspace</h1>
        <p className="lede" style={{ marginTop: 12 }}>
          <span className="spin" /> Fetching the latest from the database…
        </p>
      </div>
    </div>
  );
}
