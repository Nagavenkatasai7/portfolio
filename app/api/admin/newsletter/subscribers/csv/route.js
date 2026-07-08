// GET /api/admin/newsletter/subscribers/csv — stream the subscriber list as CSV.
//
// requireAdmin only (a non-mutating GET; a GET carries no Origin from a normal
// navigation, so isSameOrigin does not apply — the admin session cookie is
// sameSite=strict, which is the CSRF defense for reads). Returns text/csv with a
// download filename. Service-role read via the chokepoint; the PII never reaches
// anon. Optional ?q= filters by email substring (same as the table search).
import { requireAdmin } from '@/lib/auth/session';
import { json } from '@/lib/http';
import { listSubscribers, subscribersToCsv, IssueError } from '@/lib/newsletter_issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await requireAdmin();
  if (!session) return json({ error: 'unauthorized' }, 401);

  const q = new URL(request.url).searchParams.get('q') || '';
  try {
    const rows = await listSubscribers({ q });
    const csv = subscribersToCsv(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="field-guide-subscribers-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof IssueError && err.code === 'server_not_configured') {
      return json({ error: 'server_not_configured' }, 503);
    }
    return json({ error: 'export_failed' }, 500);
  }
}
