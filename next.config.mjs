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
const nextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
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
