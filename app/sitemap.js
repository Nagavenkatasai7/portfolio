// /sitemap.xml — the blog index + every PUBLISHED post. Reads the anon
// public_content surface, so drafts / removed rows are never listed (RLS). No
// /admin or /api URLs appear. force-dynamic so it reflects the current set.
import { getAnonServerClient } from '@/lib/supabase/server';
import { siteBaseUrl } from '@/lib/site';
import { postPath } from '@/lib/post';

export const dynamic = 'force-dynamic';

export default async function sitemap() {
  const base = siteBaseUrl();
  const entries = [
    // "/" is an app route now (the COLDSTART graph), not a static file behind a
    // rewrite, so it belongs in the sitemap like any other page.
    { url: `${base}/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 1.0 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    // The linear, zero-JS reading of the homepage graph. Static, always present.
    { url: `${base}/plain`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ];

  const supabase = getAnonServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('public_content')
      .select('id, published_at, updated_at')
      .order('published_at', { ascending: false })
      .limit(1000);
    if (!error && Array.isArray(data)) {
      for (const p of data) {
        entries.push({
          url: `${base}${postPath(p.id)}`,
          lastModified: new Date(p.updated_at || p.published_at),
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }
  }

  return entries;
}
