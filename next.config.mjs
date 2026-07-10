/**
 * Phase A platform conversion.
 *
 * The legacy portfolio (index.html + its CSS/JS/images, plus the "Ask Naga"
 * chatbot widget assets) lives untouched under public/, exactly as it was
 * previously served. This rewrite maps the site root to that static file so
 * the existing page keeps serving byte-identical at "/", the same URL it has
 * always been served at.
 *
 * Nothing else about the legacy page is touched: no JSX conversion, no
 * layout wrapping. It is served as a plain static file, unmodified.
 */

// Scheme+host the browser may load a newsletter hero <img> from inside the
// isolated email-preview iframe. Read at build time from the server env (falls
// back to the NEXT_PUBLIC alias), mirroring middleware.js' supabaseOrigin().
function supabaseOrigin() {
  const raw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try { return raw ? new URL(raw).origin : ""; } catch { return ""; }
}

const nextConfig = {
  // `pg` (the Postgres driver used by the READ-ONLY LinkedIn sync — Phase F) is
  // a Node-only library with an OPTIONAL native dep (`pg-native`). Keep it out
  // of the webpack bundle and require it at runtime from node_modules, so its
  // conditional requires don't emit resolution warnings/errors at build. It is
  // only ever loaded (lazily) on the Node-runtime cron route / backfill.
  serverExternalPackages: ["pg"],
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
    ];
  },
  // Security headers for the NEW app routes only. The page routes (/blog,
  // /admin) get their CSP from middleware.js (nonce-based); here we add the
  // non-CSP headers for them, and a locked-down CSP for /api (JSON, plus the
  // controlled HTML error page from the OAuth callback — hence style-src is
  // left inline-capable so that error page stays legible). The legacy static
  // site at "/" is untouched: its headers stay in vercel.json.
  async headers() {
    // Non-CSP security headers for the app routes (/blog, /admin, /api). Set
    // here so `next start` emits them (locally verifiable); the same HSTS +
    // Permissions-Policy values are ALSO in vercel.json so the legacy "/" and
    // static assets get them at the edge in production (identical values, so
    // any overlap on app routes is a no-op).
    //
    // Permissions-Policy locks the sensitive features (camera/mic/geo/payment/
    // usb/sensors/topics) to nobody. The four features the /blog VideoEmbed
    // iframes actually use (autoplay/fullscreen/encrypted-media/picture-in-
    // picture) are EXPLICITLY allow-listed to self + the two privacy-friendly
    // video hosts, so the embeds keep working regardless of delegation-
    // semantics subtleties. HSTS has no 'preload' (a reversible, safe choice).
    const V = '"https://www.youtube-nocookie.com" "https://player.vimeo.com"';
    const PERMISSIONS_POLICY = [
      "accelerometer=()",
      `autoplay=(self ${V})`,
      "camera=()",
      "display-capture=()",
      `encrypted-media=(self ${V})`,
      `fullscreen=(self ${V})`,
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      `picture-in-picture=(self ${V})`,
      "usb=()",
      "midi=()",
      "serial=()",
      "bluetooth=()",
      "hid=()",
      "browsing-topics=()",
      "interest-cohort=()",
    ].join(", ");
    const HSTS = "max-age=63072000; includeSubDomains";
    const staticSecurity = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Strict-Transport-Security", value: HSTS },
      { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    ];
    // The inline email-preview endpoint is the ONE /api route that must be
    // frameable by the same-origin /admin studio, so it needs the OPPOSITE of the
    // locked-down /api framing defaults. Next applies these config headers OVER a
    // Route Handler's own Response headers, so this override MUST live here. We
    // (a) exclude that single path from the global strict /api CSP via a negative
    // lookahead — so `frame-ancestors 'none'` / X-Frame-Options DENY never reach
    // it — and (b) give it a dedicated self-isolating CSP that permits only the
    // email's inline styles + data:/Supabase hero images and lets /admin embed it
    // (frame-ancestors 'self'). Every OTHER /api route is untouched.
    const PREVIEW_PATH = "/api/admin/newsletter/preview";
    const sb = supabaseOrigin();
    const PREVIEW_CSP = [
      "default-src 'none'",
      `img-src data: ${sb || "https:"}`,
      "style-src 'unsafe-inline'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
    ].join("; ");
    // Reuse the shared non-CSP security headers but drop the two we deliberately
    // override for the preview (framing + referrer), so no key is emitted twice.
    const previewBase = staticSecurity.filter(
      (h) => h.key !== "X-Frame-Options" && h.key !== "Referrer-Policy"
    );
    return [
      { source: "/blog/:path*", headers: staticSecurity },
      { source: "/admin/:path*", headers: staticSecurity },
      {
        // All /api EXCEPT the inline preview keep the strict locked-down CSP.
        source: "/api/((?!admin/newsletter/preview).*)",
        headers: [
          ...staticSecurity,
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; style-src 'unsafe-inline'",
          },
        ],
      },
      {
        source: PREVIEW_PATH,
        headers: [
          ...previewBase,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: PREVIEW_CSP },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  // Nothing in this app uses next/image (legacy images are plain static
  // files under public/; the /blog placeholder doesn't render images
  // either). Disabling image optimization removes the /_next/image route's
  // attack surface entirely, which also sidesteps CVE-2026-27980 (unbounded
  // /_next/image disk-cache growth, fixed upstream in next@16.1.7 — not yet
  // available in the Next 15 line this project intentionally pins to). See
  // PLATFORM.md for the full rationale.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
