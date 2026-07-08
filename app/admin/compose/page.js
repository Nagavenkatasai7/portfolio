// /admin/compose — the composer. Server shell that INDEPENDENTLY enforces the
// admin session (never trusts a page shell) and renders the client Composer.
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { adminCss } from '../ui';
import Composer from '../Composer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New post | Admin', robots: { index: false, follow: false } };

export default async function ComposePage() {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  return (
    <div className="adm">
      <style>{adminCss}</style>
      <div className="wrap narrow">
        <a className="backlink" href="/admin">← Dashboard</a>
        <div className="mark">NC</div>
        <p className="eyebrow">Composer</p>
        <h1>Create <span className="hl">content</span></h1>
        <p className="lede">
          Blog posts, newsletters, videos, images, or a hand-picked LinkedIn / X post —
          all flow through the one ingestion gate (dedupe upsert), and default to draft.
        </p>
        <div className="card">
          <Composer />
        </div>
      </div>
    </div>
  );
}
