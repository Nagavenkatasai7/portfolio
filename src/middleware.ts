import { defineMiddleware } from 'astro:middleware';
import { verifySession, SESSION_COOKIE } from './lib/auth';

// Guards every /admin-dashboard* request at runtime (these routes are
// prerender=false, so middleware genuinely runs). Unauthenticated requests get
// a 404 — not a redirect — so the route's existence is never advertised.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith('/admin-dashboard')) {
    const user = await verifySession(
      context.cookies.get(SESSION_COOKIE)?.value
    );
    if (!user) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    context.locals.user = user;
  }

  return next();
});
