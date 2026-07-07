// Root layout for the new Next.js app surface (Phase A).
//
// This ONLY wraps routes that actually live under app/ (currently just
// /blog — /api/health is a route handler and isn't wrapped by HTML layout).
// The legacy site at "/" is served as a raw static file from public/ via a
// rewrite in next.config.mjs and never passes through this layout.
export const metadata = {
  title: "Naga Venkata Sai Chennu",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
