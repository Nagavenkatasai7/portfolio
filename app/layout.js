// Root layout for the new Next.js app surface (Phase A).
//
// This ONLY wraps routes that actually live under app/ (/blog, /blog/[id],
// /admin — /api/* are route handlers and aren't wrapped by HTML layout). The
// legacy site at "/" is served as a raw static file from public/ via a rewrite
// in next.config.mjs and never passes through this layout.
//
// metadataBase makes every page's relative canonical / Open Graph / Twitter URL
// resolve to an absolute one. It reads lib/site.js (optional NEXT_PUBLIC_SITE_URL
// -> Vercel system vars -> localhost), so no new required env var is introduced.
import { siteBaseUrl } from '@/lib/site';

export const metadata = {
  metadataBase: new URL(siteBaseUrl()),
  title: "Naga Venkata Sai Chennu",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
