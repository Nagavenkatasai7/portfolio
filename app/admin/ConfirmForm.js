'use client';
// A same-origin POST form whose submit asks for confirmation first. Used for the
// destructive "Remove" (tombstone) action on the dashboard. The mutation stays a
// real form POST (so the strict-sameSite cookie + Origin check still apply on the
// server); only the confirm prompt is client-side. The onSubmit handler runs
// under the strict /admin CSP because it's a React listener (nonce/strict-dynamic
// bundle), not an inline attribute.
export default function ConfirmForm({ action, fields = {}, confirm, className, title, children }) {
  return (
    <form method="POST" action={action} onSubmit={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={className} type="submit" title={title}>{children}</button>
    </form>
  );
}
