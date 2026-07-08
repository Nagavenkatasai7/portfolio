// /admin/edit/[id] — edit one item. Server shell independently enforces the
// admin session, loads the row by id via the service-role gate reader, and
// renders the client EditForm. Media (image/attachments) stay as-is on edit;
// re-upload lives in the composer.
import { redirect, notFound } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { getContentById } from '@/lib/gate';
import { adminCss, SourceChip, StatusChip } from '../../ui';
import EditForm from '../../EditForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit | Admin', robots: { index: false, follow: false } };

export default async function EditPage({ params }) {
  if (!isAuthConfigured()) redirect('/admin/login');
  const session = await requireAdmin();
  if (!session) redirect('/admin/login');

  const { id } = await params;
  let row = null;
  try { row = await getContentById(id); } catch { row = null; }
  if (!row) notFound();

  // Only pass the fields the client form needs (no internal columns).
  const safeRow = {
    id: row.id, source: row.source, type: row.type, status: row.status,
    title: row.title, body_md: row.body_md,
    payload: { video: row.payload?.video ? { url: row.payload.video.url } : undefined },
  };

  return (
    <div className="adm">
      <style>{adminCss}</style>
      <div className="wrap narrow">
        <a className="backlink" href="/admin">← Dashboard</a>
        <div className="mark">NC</div>
        <p className="eyebrow">Edit item</p>
        <h1>Edit <span className="hl">content</span></h1>
        <div className="row-actions" style={{ margin: '4px 0 22px' }}>
          <SourceChip source={row.source} />
          <StatusChip status={row.status} deleted={Boolean(row.deleted_at)} />
          <span className="meta">{row.external_id}</span>
        </div>
        <div className="card">
          <EditForm row={safeRow} />
        </div>
      </div>
    </div>
  );
}
