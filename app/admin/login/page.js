// /admin/login — starts the GitHub OAuth flow (or explains, fail-closed, that
// admin auth isn't configured yet). If already signed in, bounces to /admin.
import { redirect } from 'next/navigation';
import { requireAdmin, isAuthConfigured } from '@/lib/auth/session';
import { adminCss } from '../ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin sign-in | Naga Venkata Sai Chennu', robots: { index: false, follow: false } };

export default async function LoginPage() {
  const configured = isAuthConfigured();
  if (configured) {
    const session = await requireAdmin();
    if (session) redirect('/admin');
  }

  return (
    <div className="adm">
      <style>{adminCss}</style>
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="mark">NC</div>
        <p className="eyebrow">Admin</p>
        <h1>Sign in</h1>
        {configured ? (
          <>
            <p>Admin access is restricted to a single GitHub account.</p>
            <div className="row-actions">
              {/* Plain link → GET /api/auth/login (which sets state + 302s to GitHub). */}
              <a className="btn primary" href="/api/auth/login">Continue with GitHub</a>
              <a className="btn" href="/">Back to portfolio</a>
            </div>
          </>
        ) : (
          <>
            <p>
              Admin sign-in isn&apos;t configured on this deployment yet. The owner needs to
              set <span className="meta">GITHUB_OAUTH_CLIENT_ID</span>,{' '}
              <span className="meta">GITHUB_OAUTH_CLIENT_SECRET</span>,{' '}
              <span className="meta">ADMIN_GITHUB_ID</span> and{' '}
              <span className="meta">SESSION_SECRET</span>.
            </p>
            <div className="row-actions">
              <a className="btn" href="/">Back to portfolio</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
