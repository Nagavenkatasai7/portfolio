// /admin/x — the X draft studio. Server shell that INDEPENDENTLY enforces the
// admin session (never trusts a page shell, exactly like /admin/compose), then
// renders the client XStudio inside its own terminal "command deck" styling —
// a deliberately distinct look from the warm-paper composer, still on the site's
// tokens. No content is generated or written here; that all happens through the
// admin-gated /api/x/* routes the client calls.
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { xCss } from '../xui';
import XStudio from '../XStudio';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'X draft studio | Admin', robots: { index: false, follow: false } };

export default async function XStudioPage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  return (
    <div className="xst">
      <style>{xCss}</style>
      <div className="wrap">
        <a className="backlink" href="/admin">← Dashboard</a>
        <XStudio />
      </div>
    </div>
  );
}
