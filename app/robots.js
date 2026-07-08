// /robots.txt — allow the public site + /blog, keep crawlers out of the admin
// dashboard and the API surface, and point at the sitemap.
import { siteBaseUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default function robots() {
  const base = siteBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog'],
        disallow: ['/admin', '/api'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
