// Shared admin styling, using the legacy site's "Luminous" design tokens
// (copied from public/index.html :root) so /admin reads as part of the same
// site: Georgia serif display, coral mono eyebrow, pill buttons with the
// signature offset lime hard-shadow, grid-paper backdrop. Server-safe (plain
// string + presentational components, no client hooks). Injected as an inline
// <style> (allowed by the /admin CSP's style-src 'unsafe-inline').

export const adminCss = `
  .adm {
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
    color: var(--ink); font-family: var(--sans); line-height: 1.6;
    padding: 40px 24px 96px;
  }
  .adm *, .adm *::before, .adm *::after { box-sizing: border-box; }
  .adm .wrap { max-width: 1120px; margin: 0 auto; }
  .adm .wrap.narrow { max-width: 720px; }
  .adm ::selection { background: var(--lime); color: var(--ink); }

  .adm .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .adm .mark {
    width: 46px; height: 46px; display: grid; place-items: center;
    border: 1px solid var(--ink); background: var(--lime); color: var(--ink);
    font-family: var(--serif); font-weight: 900; font-size: 19px;
    box-shadow: 4px 4px 0 rgba(23,20,17,.12);
  }
  .adm .eyebrow {
    font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: var(--coral); margin: 22px 0 8px;
  }
  .adm h1 {
    font-family: var(--serif); font-size: clamp(30px, 5vw, 48px); font-weight: 700;
    line-height: 1.03; letter-spacing: -0.01em; margin: 0 0 10px; text-wrap: balance;
  }
  .adm h1 .hl { background: linear-gradient(180deg, transparent 55%, rgba(202,255,96,.85) 55%); padding: 0 .04em; }
  .adm h2 { font-family: var(--serif); font-weight: 700; font-size: 24px; margin: 0 0 12px; }
  .adm p { color: var(--ink-soft); margin: 0 0 12px; }
  .adm .lede { color: var(--muted); margin: 0 0 28px; max-width: 62ch; }
  .adm .meta { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .adm a { color: inherit; }

  /* buttons — legacy pill + offset lime shadow signature */
  .adm .btn, .adm button.btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    border: 1px solid var(--ink); border-radius: 999px; padding: 10px 18px;
    background: var(--surface); color: var(--ink); text-decoration: none;
    font-weight: 800; font-size: 14px; cursor: pointer; line-height: 1;
    transition: transform 160ms var(--ease), box-shadow 160ms var(--ease), background 160ms var(--ease), color 160ms var(--ease);
  }
  .adm .btn:hover, .adm button.btn:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(23,20,17,.12); }
  .adm .btn:focus-visible { outline: 3px solid var(--lime); outline-offset: 2px; }
  .adm .btn.primary { background: var(--ink); color: #fff; box-shadow: 5px 5px 0 var(--lime); }
  .adm .btn.primary:hover { box-shadow: 7px 7px 0 var(--lime); transform: translateY(-2px); }
  .adm .btn.sm { padding: 6px 12px; font-size: 12.5px; font-weight: 700; }
  .adm .btn.danger { border-color: var(--coral); color: var(--coral); }
  .adm .btn.danger:hover { background: var(--coral); color: #fff; }
  .adm .btn[disabled] { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
  .adm .row-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

  /* cards */
  .adm .card {
    border: 1px solid var(--line); background: var(--surface);
    border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow);
  }
  .adm .card + .card { margin-top: 18px; }
  .adm .stat-row { display: flex; gap: 26px; flex-wrap: wrap; margin: 4px 0 0; }
  .adm .stat b { font-family: var(--serif); font-size: 26px; font-weight: 700; display: block; line-height: 1; }
  .adm .stat span { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }

  /* table */
  .adm .tablewrap { border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
  .adm .scroll { overflow-x: auto; }
  .adm table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 860px; }
  .adm thead th {
    text-align: left; padding: 13px 14px; background: var(--paper-2);
    font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-soft);
    font-weight: 800; border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  .adm tbody td { padding: 13px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .adm tbody tr:last-child td { border-bottom: none; }
  .adm tbody tr:hover td { background: rgba(202,255,96,.06); }
  .adm td.mono, .adm .mono { font-family: var(--mono); font-size: 12px; }
  .adm td .title-cell { font-weight: 700; color: var(--ink); }
  .adm td .ext { display: block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .adm .utc { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); }
  .adm .local { font-size: 11.5px; color: var(--muted); }
  .adm .rowtools { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .adm .rowtools form { margin: 0; }

  /* chips */
  .adm .chip {
    display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800;
    padding: 3px 9px; border: 1px solid var(--ink); border-radius: 999px;
    background: var(--paper-2); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap;
  }
  .adm .chip .dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; opacity: .8; }
  .adm .chip.published { background: var(--lime); }
  .adm .chip.draft { background: var(--paper-2); color: var(--ink-soft); }
  .adm .chip.removed { background: #f0d6cd; color: #7a2f18; border-color: #7a2f18; }
  .adm .chip.src-blog { background: var(--lime); }
  .adm .chip.src-newsletter { background: var(--gold); color: #241d09; }
  .adm .chip.src-video { background: var(--coral); color: #fff; }
  .adm .chip.src-image { background: var(--teal); color: #06231f; }
  .adm .chip.src-linkedin_manual { background: #dfe9ff; color: #123; border-color: #123; }
  .adm .chip.src-x_manual { background: #1a1a1a; color: #fff; }
  .adm .chip.src-linkedin_auto { background: #dfe9ff; color: #123; border-color: #123; }
  .adm .chip.src-x_auto { background: #1a1a1a; color: #fff; }

  /* forms */
  .adm .field { margin: 0 0 18px; }
  .adm label { display: block; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 7px; }
  .adm label .opt { color: var(--muted); font-weight: 600; text-transform: none; letter-spacing: 0; }
  .adm input[type=text], .adm input[type=url], .adm input[type=datetime-local], .adm textarea, .adm select {
    width: 100%; font: inherit; font-size: 15px; color: var(--ink);
    background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 12px 14px; transition: border-color 140ms var(--ease), box-shadow 140ms var(--ease);
  }
  .adm textarea { min-height: 220px; resize: vertical; font-family: var(--mono); font-size: 13.5px; line-height: 1.6; }
  .adm input:focus, .adm textarea:focus, .adm select:focus {
    outline: none; border-color: var(--ink); box-shadow: 0 0 0 3px rgba(202,255,96,.55);
  }
  .adm .hint { font-size: 12px; color: var(--muted); margin: 7px 0 0; }
  .adm .hint.mono { font-family: var(--mono); }

  /* segmented type selector */
  .adm .seg { display: flex; flex-wrap: wrap; gap: 8px; }
  .adm .seg button {
    border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft);
    border-radius: 999px; padding: 9px 16px; font-weight: 800; font-size: 13px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    transition: all 140ms var(--ease);
  }
  .adm .seg button .ic { font-size: 15px; line-height: 1; }
  .adm .seg button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); box-shadow: 4px 4px 0 var(--lime); }
  .adm .seg button:hover { border-color: var(--ink); }

  /* checkbox row */
  .adm .check { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px dashed var(--line); border-radius: var(--radius); background: var(--paper); }
  .adm .check input { width: 18px; height: 18px; accent-color: var(--ink); }
  .adm .check label { margin: 0; text-transform: none; letter-spacing: 0; font-size: 14px; font-weight: 700; }
  .adm .check .sub { font-weight: 500; color: var(--muted); font-size: 12.5px; }

  /* upload dropzone + thumbs */
  .adm .drop {
    border: 1.5px dashed var(--line); border-radius: var(--radius); background: var(--paper);
    padding: 26px; text-align: center; cursor: pointer; transition: all 140ms var(--ease);
  }
  .adm .drop:hover, .adm .drop.hot { border-color: var(--ink); background: rgba(202,255,96,.1); }
  .adm .drop .big { font-weight: 800; margin-bottom: 4px; }
  .adm .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-top: 14px; }
  .adm .thumb { position: relative; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--paper-2); }
  .adm .thumb img, .adm .thumb video { display: block; width: 100%; height: 110px; object-fit: cover; }
  .adm .thumb .rm { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 999px; border: 1px solid var(--ink); background: #fff; cursor: pointer; font-weight: 900; line-height: 1; }
  .adm .thumb .st { font-size: 10.5px; padding: 4px 6px; color: var(--muted); font-family: var(--mono); border-top: 1px solid var(--line); }
  .adm .thumb.err { border-color: var(--coral); }
  .adm .thumb.err .st { color: var(--coral); }

  /* banners */
  .adm .banner { border-radius: var(--radius); padding: 13px 16px; margin: 0 0 18px; font-size: 14px; font-weight: 600; border: 1px solid; }
  .adm .banner.ok { background: rgba(202,255,96,.25); border-color: var(--ink); color: var(--ink); }
  .adm .banner.err { background: #f7dcd2; border-color: #7a2f18; color: #7a2f18; }
  .adm .banner a { text-decoration: underline; font-weight: 800; }

  .adm .divider { height: 1px; background: var(--line); margin: 26px 0; border: none; }
  .adm .backlink { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 14px; color: var(--muted); margin-bottom: 10px; }
  .adm .backlink:hover { color: var(--ink); }
  .adm .spin { display: inline-block; width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 999px; animation: adm-spin .7s linear infinite; vertical-align: -2px; }
  @keyframes adm-spin { to { transform: rotate(360deg); } }
`;

const STATUS_LABEL = { published: 'Published', draft: 'Draft', removed: 'Removed' };
const SOURCE_LABEL = {
  blog: 'Blog', newsletter: 'Newsletter', video: 'Video', image: 'Image',
  linkedin_manual: 'LinkedIn', x_manual: 'X', linkedin_auto: 'LinkedIn', x_auto: 'X',
};

export function Chip({ kind, children }) {
  return <span className={`chip ${kind || ''}`}>{children}</span>;
}

export function StatusChip({ status, deleted }) {
  const s = deleted ? 'removed' : status;
  return <span className={`chip ${s}`}><span className="dot" />{STATUS_LABEL[s] || s}</span>;
}

export function SourceChip({ source }) {
  return <span className={`chip src-${source}`}>{SOURCE_LABEL[source] || source}</span>;
}
