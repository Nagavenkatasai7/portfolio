// Shared, dependency-free styling for the app-router boundary pages
// (not-found / error / global-error). Uses the site's "Luminous" tokens inline
// so a boundary reads as part of the same site without importing the larger
// route stylesheets. A plain string const — safe to import from BOTH the server
// not-found page and the client error boundaries. Injected as an inline <style>
// (style-src 'unsafe-inline' is allowed on every app surface).
export const boundaryCss = `
  .bnd {
    min-height: 100vh; display: grid; place-items: center; padding: 40px 24px;
    background:
      linear-gradient(90deg, rgba(23,20,17,.035) 1px, transparent 1px),
      linear-gradient(180deg, rgba(23,20,17,.03) 1px, transparent 1px),
      #fbf7ec;
    background-size: 44px 44px; color: #171411; line-height: 1.6;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .bnd * { box-sizing: border-box; }
  .bnd .card {
    max-width: 520px; text-align: center; border: 1px solid #ddceb8; background: #fffdf7;
    border-radius: 8px; padding: 44px 36px; box-shadow: 0 24px 70px rgba(23,20,17,.11);
  }
  .bnd .mark {
    width: 50px; height: 50px; display: grid; place-items: center; margin: 0 auto 18px;
    border: 1px solid #171411; background: #caff60; color: #171411;
    font-family: Georgia, "Times New Roman", serif; font-weight: 900; font-size: 21px;
    box-shadow: 5px 5px 0 rgba(23,20,17,.12);
  }
  .bnd .eyebrow {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12px;
    font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #e86f4a; margin: 0 0 8px;
  }
  .bnd h1 {
    font-family: Georgia, "Times New Roman", serif; font-size: clamp(28px, 5vw, 40px);
    font-weight: 700; line-height: 1.05; margin: 0 0 12px;
  }
  .bnd h1 .hl { background: linear-gradient(180deg, transparent 55%, rgba(202,255,96,.85) 55%); padding: 0 .04em; }
  .bnd p { color: #756b62; margin: 0 0 22px; }
  .bnd .digest { font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; color: #a79c8f; margin: 0 0 18px; }
  .bnd .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .bnd a, .bnd button {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    border: 1px solid #171411; border-radius: 999px; padding: 11px 20px; background: #fffdf7;
    color: #171411; text-decoration: none; font-weight: 800; font-size: 14px; cursor: pointer;
    font-family: inherit; line-height: 1;
  }
  .bnd a.primary, .bnd button.primary { background: #171411; color: #fff; box-shadow: 5px 5px 0 #caff60; }
`;
