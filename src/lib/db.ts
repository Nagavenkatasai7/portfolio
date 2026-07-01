/**
 * Neon Postgres client (HTTP serverless driver).
 *
 * Use as a tagged template so every value is PARAMETERIZED — never
 * string-interpolate request input into SQL:
 *
 *   const rows = await sql`SELECT * FROM posts WHERE slug = ${slug}`;
 *
 * The client is created lazily so importing this module never requires
 * DATABASE_URL at build time — only when a query actually runs (SSR/runtime).
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { requireEnv } from './env';

let client: NeonQueryFunction<false, false> | null = null;

function getClient(): NeonQueryFunction<false, false> {
  if (!client) {
    client = neon(requireEnv('DATABASE_URL'));
  }
  return client;
}

export function sql(
  strings: TemplateStringsArray,
  ...params: unknown[]
): Promise<Record<string, unknown>[]> {
  return getClient()(strings, ...params) as Promise<Record<string, unknown>[]>;
}
