// Proves the Next.js app layer works end to end. Phase A only — later phases
// add real backend routes (admin, Supabase, ingestion, X automation).
export async function GET() {
  return Response.json({ ok: true });
}
