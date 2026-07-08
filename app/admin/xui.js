// Terminal "command deck" styling for the X draft studio (/admin/x). A
// DELIBERATELY distinct visual identity from the warm-paper /admin composer and
// /blog: near-black surface, monospace-forward, the site's lime (#caff60) used
// as a phosphor accent + coral (#e86f4a) for over-limit warnings, faint grid +
// scanline texture. Still coherent with the site tokens (same lime/coral, same
// pill-button DNA, same grid motif) — just flipped dark and tightened. Server-
// safe plain string, injected as an inline <style> (allowed by /admin's CSP
// style-src 'unsafe-inline'). No external fonts (CSP font-src 'self') — the
// monospace system stack IS the characterful choice for a dev's X deck.
export const xCss = `
  .xst {
    --bg: #0b0b0d; --panel: #141418; --panel-2: #1b1b21; --panel-3: #232329;
    --line: #2b2b33; --line-2: #3a3a44;
    --ink: #ece9e2; --ink-soft: #c7c3ba; --dim: #8c887f; --faint: #605c55;
    --phosphor: #caff60; --phosphor-dim: #9dc94a; --coral: #ff7a52; --teal: #56c9ba; --gold: #e7c15a;
    --radius: 10px; --radius-sm: 7px;
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --mono: "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", "Roboto Mono", monospace;
    --sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    min-height: 100vh;
    background:
      radial-gradient(900px 500px at 12% -8%, rgba(202,255,96,.10), transparent 60%),
      radial-gradient(700px 500px at 108% 4%, rgba(86,201,186,.07), transparent 55%),
      linear-gradient(90deg, rgba(255,255,255,.020) 1px, transparent 1px),
      linear-gradient(180deg, rgba(255,255,255,.018) 1px, transparent 1px),
      var(--bg);
    background-size: auto, auto, 40px 40px, 40px 40px;
    color: var(--ink); font-family: var(--mono); line-height: 1.6;
    padding: 34px 22px 120px; -webkit-font-smoothing: antialiased;
  }
  .xst *, .xst *::before, .xst *::after { box-sizing: border-box; }
  .xst .wrap { max-width: 1000px; margin: 0 auto; }
  .xst ::selection { background: var(--phosphor); color: #10130a; }
  .xst a { color: inherit; text-decoration: none; }
  .xst .backlink { display: inline-flex; align-items: center; gap: 7px; color: var(--dim); font-size: 12.5px; font-weight: 600; letter-spacing: .02em; margin-bottom: 16px; transition: color 140ms var(--ease); }
  .xst .backlink:hover { color: var(--phosphor); }

  /* ---- terminal window ---- */
  .xst .term {
    border: 1px solid var(--line-2); border-radius: var(--radius);
    background: linear-gradient(180deg, #101014, var(--panel));
    box-shadow: 0 40px 120px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.03);
    overflow: hidden; position: relative;
  }
  /* faint CRT scanlines over the whole deck */
  .xst .term::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 5; opacity: .35;
    background: repeating-linear-gradient(180deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px);
    mix-blend-mode: overlay;
  }
  .xst .titlebar {
    display: flex; align-items: center; gap: 10px; padding: 11px 15px;
    background: linear-gradient(180deg, #1a1a20, #141419); border-bottom: 1px solid var(--line);
    font-size: 12px; color: var(--dim);
  }
  .xst .dots { display: flex; gap: 7px; }
  .xst .dots i { width: 11px; height: 11px; border-radius: 999px; display: block; border: 1px solid rgba(0,0,0,.4); }
  .xst .dots i:nth-child(1) { background: #ff5f57; } .xst .dots i:nth-child(2) { background: #febc2e; } .xst .dots i:nth-child(3) { background: var(--phosphor); }
  .xst .titlebar .path { margin-left: 6px; font-weight: 600; color: var(--ink-soft); letter-spacing: .01em; }
  .xst .titlebar .path b { color: var(--phosphor); font-weight: 700; }
  .xst .titlebar .live { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--phosphor-dim); }
  .xst .titlebar .live .pulse { width: 7px; height: 7px; border-radius: 999px; background: var(--phosphor); box-shadow: 0 0 8px var(--phosphor); animation: xpulse 2s var(--ease) infinite; }

  .xst .screen { padding: 26px 26px 30px; position: relative; z-index: 2; }

  /* ---- header ---- */
  .xst .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .32em; text-transform: uppercase; color: var(--phosphor-dim); margin: 2px 0 12px; }
  .xst h1 { font-family: var(--mono); font-size: clamp(26px, 4.4vw, 40px); font-weight: 700; line-height: 1.04; letter-spacing: -0.01em; margin: 0 0 8px; color: var(--ink); }
  .xst h1 .cursor { display: inline-block; width: .58ch; height: 1.05em; margin-left: .12ch; background: var(--phosphor); transform: translateY(.14em); box-shadow: 0 0 12px var(--phosphor); animation: xblink 1.05s steps(1) infinite; }
  .xst .lede { color: var(--dim); font-size: 13.5px; margin: 0 0 22px; max-width: 66ch; line-height: 1.7; }
  .xst .lede code { color: var(--phosphor-dim); background: rgba(202,255,96,.08); padding: 1px 6px; border-radius: 5px; }

  /* ---- info banner ---- */
  .xst .note {
    display: flex; gap: 11px; align-items: flex-start; border: 1px dashed var(--line-2);
    background: rgba(86,201,186,.05); border-radius: var(--radius-sm); padding: 12px 15px; margin: 0 0 24px;
    font-size: 12.5px; color: var(--ink-soft); line-height: 1.6;
  }
  .xst .note .ic { color: var(--teal); font-size: 15px; line-height: 1.3; }
  .xst .note b { color: var(--ink); }

  /* ---- command bar ---- */
  .xst .cmd { border: 1px solid var(--line); background: var(--panel-2); border-radius: var(--radius); padding: 18px; margin: 0 0 22px; box-shadow: inset 0 1px 0 rgba(255,255,255,.02); }
  .xst .lbl { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--dim); margin: 0 0 8px; }
  .xst .promptline { display: flex; align-items: flex-start; gap: 10px; }
  .xst .promptline .caret { color: var(--phosphor); font-weight: 800; padding-top: 12px; user-select: none; }
  .xst textarea, .xst input[type=text], .xst select {
    width: 100%; font-family: var(--mono); font-size: 14px; color: var(--ink);
    background: #0d0d10; border: 1px solid var(--line-2); border-radius: var(--radius-sm);
    padding: 11px 13px; transition: border-color 140ms var(--ease), box-shadow 140ms var(--ease);
  }
  .xst textarea { resize: vertical; line-height: 1.6; }
  .xst textarea::placeholder, .xst input::placeholder { color: var(--faint); }
  .xst input:focus, .xst textarea:focus, .xst select:focus { outline: none; border-color: var(--phosphor-dim); box-shadow: 0 0 0 3px rgba(202,255,96,.14); }
  .xst .topic { min-height: 62px; }
  .xst .controls { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; margin-top: 16px; }
  .xst .controls .col { flex: 1 1 200px; min-width: 170px; }
  .xst select { appearance: none; -webkit-appearance: none; cursor: pointer;
    background-image: linear-gradient(45deg, transparent 50%, var(--dim) 50%), linear-gradient(135deg, var(--dim) 50%, transparent 50%);
    background-position: calc(100% - 18px) 17px, calc(100% - 13px) 17px; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; padding-right: 34px; }

  /* segmented format toggle */
  .xst .seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 999px; padding: 3px; background: #0d0d10; gap: 3px; }
  .xst .seg button {
    border: none; background: transparent; color: var(--dim); cursor: pointer;
    font-family: var(--mono); font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
    padding: 8px 16px; border-radius: 999px; display: inline-flex; align-items: center; gap: 7px; transition: all 160ms var(--ease);
  }
  .xst .seg button[aria-pressed="true"] { background: var(--phosphor); color: #10130a; box-shadow: 0 0 16px rgba(202,255,96,.35); }
  .xst .seg button:not([aria-pressed="true"]):hover { color: var(--ink); }

  /* ---- buttons ---- */
  .xst .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    border: 1px solid var(--line-2); border-radius: 999px; padding: 9px 16px; cursor: pointer;
    background: var(--panel-3); color: var(--ink); font-family: var(--mono); font-weight: 700; font-size: 12.5px; letter-spacing: .01em; line-height: 1;
    transition: transform 140ms var(--ease), box-shadow 140ms var(--ease), background 140ms var(--ease), color 140ms var(--ease), border-color 140ms var(--ease);
  }
  .xst .btn:hover { transform: translateY(-1px); border-color: var(--dim); }
  .xst .btn:focus-visible { outline: 2px solid var(--phosphor); outline-offset: 2px; }
  .xst .btn.go { background: var(--phosphor); color: #10130a; border-color: var(--phosphor); font-weight: 800; padding: 11px 26px; font-size: 13.5px; box-shadow: 0 0 22px rgba(202,255,96,.28); }
  .xst .btn.go:hover { box-shadow: 0 0 34px rgba(202,255,96,.45); transform: translateY(-1px); }
  .xst .btn.primary { border-color: var(--phosphor-dim); color: var(--phosphor); }
  .xst .btn.primary:hover { background: rgba(202,255,96,.1); }
  .xst .btn.ghost { background: transparent; color: var(--dim); }
  .xst .btn.ghost:hover { color: var(--ink); }
  .xst .btn.danger { background: transparent; border-color: rgba(255,122,82,.4); color: var(--coral); }
  .xst .btn.danger:hover { background: rgba(255,122,82,.12); border-color: var(--coral); }
  .xst .btn[disabled] { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }
  .xst .genrow { display: flex; align-items: center; gap: 14px; margin-top: 18px; flex-wrap: wrap; }
  .xst .genrow .hint { color: var(--faint); font-size: 12px; }

  /* ---- output / variants ---- */
  .xst .outhead { display: flex; align-items: center; gap: 12px; margin: 30px 0 14px; }
  .xst .outhead .rule { flex: 1; height: 1px; background: linear-gradient(90deg, var(--line-2), transparent); }
  .xst .outhead .label { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--dim); }
  .xst .outhead .label b { color: var(--phosphor-dim); }

  .xst .variants { display: flex; flex-direction: column; gap: 18px; }
  .xst .vc {
    border: 1px solid var(--line); background: linear-gradient(180deg, var(--panel-2), var(--panel)); border-radius: var(--radius);
    overflow: hidden; animation: xrise .45s var(--ease) both;
  }
  .xst .vc.saved { border-color: var(--phosphor-dim); box-shadow: 0 0 0 1px rgba(202,255,96,.18); }
  .xst .vc.gone { opacity: .5; }
  .xst .vc-head { display: flex; align-items: center; gap: 12px; padding: 12px 15px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.015); }
  .xst .vc-head .tag { font-size: 11.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--phosphor-dim); }
  .xst .vc-head .state { font-size: 11px; letter-spacing: .04em; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line-2); color: var(--dim); }
  .xst .vc-head .state.ok { color: var(--phosphor); border-color: var(--phosphor-dim); background: rgba(202,255,96,.08); }
  .xst .vc-head .state.pub { color: #10130a; background: var(--phosphor); border-color: var(--phosphor); }
  .xst .vc-head .state.rm { color: var(--coral); border-color: rgba(255,122,82,.4); }
  .xst .vc-head .spacer { margin-left: auto; }
  .xst .vc-body { padding: 15px; }
  .xst .vc-body textarea { min-height: 92px; background: #0c0c0f; }

  /* meter */
  .xst .meter { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .xst .meter .bar { flex: 1; height: 5px; border-radius: 999px; background: #0d0d10; overflow: hidden; border: 1px solid var(--line); }
  .xst .meter .fill { height: 100%; background: var(--phosphor); transition: width 180ms var(--ease), background 180ms var(--ease); box-shadow: 0 0 10px rgba(202,255,96,.5); }
  .xst .meter .fill.warn { background: var(--gold); box-shadow: none; }
  .xst .meter .fill.over { background: var(--coral); box-shadow: 0 0 10px rgba(255,122,82,.5); }
  .xst .meter .num { font-size: 12px; font-weight: 700; color: var(--dim); min-width: 62px; text-align: right; font-variant-numeric: tabular-nums; }
  .xst .meter .num.over { color: var(--coral); }

  /* thread preview */
  .xst .thread { margin-top: 14px; display: flex; flex-direction: column; gap: 9px; }
  .xst .tw { border: 1px solid var(--line); border-radius: var(--radius-sm); background: #0d0d11; padding: 11px 13px; position: relative; }
  .xst .tw .tw-top { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
  .xst .tw .idx { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; color: var(--phosphor-dim); }
  .xst .tw .cc { margin-left: auto; font-size: 11px; color: var(--faint); font-variant-numeric: tabular-nums; }
  .xst .tw .cc.over { color: var(--coral); }
  .xst .tw .txt { font-size: 13px; color: var(--ink-soft); white-space: pre-wrap; word-break: break-word; line-height: 1.55; }
  .xst .tw .thread-line { position: absolute; left: 20px; top: -9px; width: 2px; height: 9px; background: var(--line-2); }

  /* actions */
  .xst .vc-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 15px; border-top: 1px solid var(--line); background: rgba(0,0,0,.18); align-items: center; }
  .xst .vc-actions .sep { width: 1px; height: 20px; background: var(--line-2); margin: 0 3px; }
  .xst .vc-actions .grow { flex: 1; }
  .xst .msg { font-size: 12px; color: var(--phosphor-dim); display: inline-flex; align-items: center; gap: 6px; }
  .xst .msg a { color: var(--phosphor); text-decoration: underline; text-underline-offset: 2px; }
  .xst .msg.err { color: var(--coral); }

  /* soft failure / empty states */
  .xst .fail { border: 1px solid rgba(255,122,82,.35); background: rgba(255,122,82,.06); border-radius: var(--radius); padding: 16px 18px; margin: 22px 0 0; }
  .xst .fail h3 { margin: 0 0 6px; font-size: 14px; color: var(--coral); font-weight: 700; letter-spacing: .01em; }
  .xst .fail p { margin: 0 0 12px; font-size: 12.5px; color: var(--ink-soft); line-height: 1.6; }
  .xst .placeholder { text-align: center; color: var(--faint); font-size: 12.5px; padding: 34px 20px; border: 1px dashed var(--line); border-radius: var(--radius); margin-top: 4px; }
  .xst .placeholder b { color: var(--dim); display: block; margin-bottom: 4px; font-size: 13px; }

  .xst .spin { display: inline-block; width: 13px; height: 13px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 999px; animation: xspin .7s linear infinite; }
  .xst .dotdot::after { content: ""; animation: xdots 1.4s steps(4, end) infinite; }

  @keyframes xspin { to { transform: rotate(360deg); } }
  @keyframes xblink { 50% { opacity: 0; } }
  @keyframes xpulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes xrise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes xdots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }
  @media (prefers-reduced-motion: reduce) {
    .xst .vc { animation: none; }
    .xst h1 .cursor, .xst .titlebar .live .pulse, .xst .spin, .xst .dotdot::after { animation: none; }
  }
  @media (max-width: 560px) {
    .xst .screen { padding: 20px 16px 24px; }
    .xst .controls { gap: 14px; }
  }
`;
