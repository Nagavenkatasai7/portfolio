import { SITE_URL } from '@/content/profile';

export default function sitemap() {
  return [{ url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1 }];
}
