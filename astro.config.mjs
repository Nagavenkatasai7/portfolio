// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Static-by-default: marketing/portfolio pages are prerendered to the Vercel CDN.
// Dynamic routes (admin dashboard, /api/*, blog data) opt into on-demand rendering
// with `export const prerender = false`. See ~/Desktop/portfolio-rebuild-plan.md §1.
//
// Web Analytics is intentionally NOT enabled here — the adapter's webAnalytics flag
// is a no-op on @vercel/analytics >= 1.4. We render <Analytics/> in BaseLayout (Phase 9).
export default defineConfig({
  site: 'https://chennunagavenkatasai.com',
  // maxDuration (seconds) covers the weekly AI draft cron, which can run long.
  // 300s is the Vercel fluid-compute ceiling (valid on Hobby).
  adapter: vercel({ maxDuration: 300 }),
});
