/**
 * Server-only environment access.
 *
 * We read from `process.env` (available at runtime in Vercel Functions / Astro
 * SSR). Vite does NOT statically inline `process.env` in SSR builds, so these
 * resolve at runtime — never `import.meta.env`, which would be build-time.
 *
 * Requireds throw only when ACCESSED (lazily), so `astro build` never fails just
 * because a secret is absent locally — prerendered pages don't call these paths.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

/** Public site origin, used to build absolute links in emails/redirects. */
export const PUBLIC_SITE_URL = optionalEnv(
  'PUBLIC_SITE_URL',
  'https://chennunagavenkatasai.com'
);

/** The one Google account allowed into /admin-dashboard (Phase 3). */
export const ADMIN_EMAIL = optionalEnv(
  'ADMIN_EMAIL',
  'chennunagavenkatasai@gmail.com'
).toLowerCase();

/** Newsletter sender identity. */
export const NEWSLETTER_FROM = optionalEnv(
  'NEWSLETTER_FROM',
  'Naga Venkata Sai Chennu <newsletter@chennunagavenkatasai.com>'
);
export const NEWSLETTER_REPLY_TO = optionalEnv(
  'NEWSLETTER_REPLY_TO',
  'chennunagavenkatasai@gmail.com'
);
/** Where contact-form submissions are emailed. */
export const CONTACT_TO = optionalEnv('CONTACT_TO', 'chennunagavenkatasai@gmail.com');
/** CAN-SPAM physical postal address rendered in newsletter footers. */
export const NEWSLETTER_POSTAL_ADDRESS = optionalEnv(
  'NEWSLETTER_POSTAL_ADDRESS',
  ''
);
