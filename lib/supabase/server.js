// ============================================================
// Server-only Supabase clients.
//
// IMPORTANT — import boundary: this module holds the service-role key. The
// `server-only` import below makes the build FAIL if it is ever pulled into a
// Client Component bundle. Never import this from a "use client" file.
//
// Why supabase-js (HTTPS/PostgREST) and NOT a raw POSTGRES_URL: the `portfolio`
// Vercel project already carries a Neon integration's POSTGRES_URL / PG* vars.
// Talking to Supabase via SUPABASE_URL + keys avoids that name collision at
// runtime entirely — the app never touches the ambiguous POSTGRES_URL. (Raw
// psql, used only for migrations, is a separate out-of-band connection string.)
// ============================================================
import 'server-only';
import { createClient } from '@supabase/supabase-js';

// The Vercel Supabase integration may expose the URL/anon key with or without
// a NEXT_PUBLIC_ prefix depending on how it is connected; accept either.
function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}
function anonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}
function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && anonKey());
}

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };

// Anon client for public reads (used server-side by /blog to read the
// public_content view). RLS applies. Returns null when env is unset so callers
// can degrade to an empty state instead of crashing.
export function getAnonServerClient() {
  const url = supabaseUrl();
  const key = anonKey();
  if (!url || !key) return null;
  return createClient(url, key, clientOpts);
}

// Service-role client for privileged server-side writes (the ingestion gate,
// the rate limiter, the admin dashboard's all-status read). Bypasses RLS.
// Returns null when unset so callers can return a controlled "not configured"
// error rather than throwing an opaque one.
export function getServiceClient() {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, clientOpts);
}
