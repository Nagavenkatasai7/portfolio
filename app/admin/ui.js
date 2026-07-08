// Shared admin styling, using the legacy site's design tokens (copied from
// public/index.html :root) so /admin reads as part of the same site. Server-
// safe (plain string + presentational components, no client hooks).

export const adminCss = `
  .adm {
    --ink: #171411; --ink-soft: #423b34; --muted: #756b62;
    --paper: #fbf7ec; --paper-2: #f3ead8; --surface: #fffdf7;
    --line: #ddceb8; --lime: #caff60; --teal: #4db6aa; --coral: #e86f4a;
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
    color: var(--ink); font-family: var(--sans); line-height: 1.6;
    padding: 40px 24px;
  }
  .adm .wrap { max-width: 1100px; margin: 0 auto; }
  .adm .mark {
    width: 44px; height: 44px; display: grid; place-items: center;
    border: 1px solid var(--ink); background: var(--lime); color: var(--ink);
    font-family: var(--serif); font-weight: 900; font-size: 18px;
  }
  .adm .eyebrow {
    font-size: 12px; font-weight: 700; letter-spacing: .13em;
    text-transform: uppercase; color: var(--muted); margin: 16px 0 6px;
  }
  .adm h1 { font-size: clamp(24px, 4vw, 36px); font-weight: 900; margin: 0 0 8px; }
  .adm p { color: var(--ink-soft); margin: 0 0 12px; }
  .adm a.btn, .adm button.btn {
    display: inline-block; border: 1px solid var(--ink); border-radius: 8px;
    padding: 10px 18px; background: var(--surface); color: var(--ink);
    text-decoration: none; font-weight: 600; font-size: 14px; cursor: pointer;
  }
  .adm a.btn.primary, .adm button.btn.primary { background: var(--lime); }
  .adm .card {
    border: 1px solid var(--line); background: var(--surface);
    border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow);
  }
  .adm .meta { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .adm table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .adm th, .adm td {
    text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  .adm th { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .adm td.mono { font-family: var(--mono); font-size: 12px; }
  .adm .chip {
    display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px;
    border: 1px solid var(--ink); border-radius: 999px; background: var(--paper-2);
  }
  .adm .chip.published { background: var(--lime); }
  .adm .chip.draft { background: var(--paper-2); }
  .adm .chip.removed { background: #f0d6cd; }
  .adm .row-actions { display: flex; gap: 10px; align-items: center; margin: 18px 0; flex-wrap: wrap; }
  .adm .scroll { overflow-x: auto; }
`;

export function Chip({ kind, children }) {
  return <span className={`chip ${kind || ''}`}>{children}</span>;
}
