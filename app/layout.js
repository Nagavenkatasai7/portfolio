// Root layout for the Next.js app surface.
//
// This wraps every HTML route under app/ — which since the COLDSTART homepage
// means "/" and "/plain" as well as /blog, /blog/[id] and /admin. (/api/* are
// route handlers and aren't wrapped by an HTML layout.) The static homepage that
// used to be served from public/index.html via a rewrite is gone; there is no
// route left that bypasses this layout, so <head> tags belong here.
//
// Note that "/" and "/plain" get no Content-Security-Policy: middleware.js's
// matcher covers only /blog and /admin. That matches what the old static page
// had, but it is now a choice rather than something inherited — see middleware.js.
//
// The two Google faces are declared here rather than @import-ed from
// coldstart.css, so the browser can open the connections while the route CSS is
// still downloading instead of after it (spec §13). Both --mono and --serif
// carry real system fallbacks, so a slow font request costs nothing but a swap.
//
// metadataBase makes every page's relative canonical / Open Graph / Twitter URL
// resolve to an absolute one. It reads lib/site.js (optional NEXT_PUBLIC_SITE_URL
// -> Vercel system vars -> localhost), so no new required env var is introduced.
import { siteBaseUrl } from '@/lib/site';

export const metadata = {
  metadataBase: new URL(siteBaseUrl()),
  title: "Naga Venkata Sai Chennu",
};

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600' +
  '&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_CSS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
