export const prerender = false;

import type { APIRoute, APIContext } from 'astro';
import { z } from 'zod';
import { getAdmin, json, sameOrigin } from '../../lib/http';
import {
  createPost,
  updatePost,
  deletePost,
  normalizeSlug,
  SLUG_RE,
  type PostInput,
} from '../../lib/posts';

const PostInputSchema = z.object({
  slug: z.string().max(120).optional().default(''),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(500).nullable().optional(),
  body_md: z.string().min(1).max(100_000),
  cover_image: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  status: z.enum(['draft', 'published', 'archived']),
});

type ParsedInput = z.infer<typeof PostInputSchema>;

function toInput(data: ParsedInput): PostInput {
  return {
    slug: normalizeSlug(data.slug && data.slug.length > 0 ? data.slug : data.title),
    title: data.title.trim(),
    excerpt: data.excerpt?.trim() ? data.excerpt.trim() : null,
    body_md: data.body_md,
    cover_image: data.cover_image?.trim() ? data.cover_image.trim() : null,
    tags: (data.tags ?? []).map((t) => t.trim()).filter(Boolean),
    status: data.status,
  };
}

/** Returns the admin email, or a Response to short-circuit with. */
async function gate(context: APIContext): Promise<string | Response> {
  const user = await getAdmin(context);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!sameOrigin(context.request)) return json({ error: 'forbidden' }, 403);
  return user.email;
}

export const POST: APIRoute = async (context) => {
  const auth = await gate(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = PostInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation', issues: parsed.error.issues }, 400);

  const input = toInput(parsed.data);
  if (!SLUG_RE.test(input.slug)) return json({ error: 'invalid slug' }, 400);

  try {
    const post = await createPost(input, auth);
    return json({ ok: true, post });
  } catch {
    return json({ error: 'create failed' }, 500);
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await gate(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const id = (body as { id?: unknown })?.id;
  if (typeof id !== 'string' || id.length === 0) return json({ error: 'missing id' }, 400);

  const parsed = PostInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'validation', issues: parsed.error.issues }, 400);

  const input = toInput(parsed.data);
  if (!SLUG_RE.test(input.slug)) return json({ error: 'invalid slug' }, 400);

  try {
    const post = await updatePost(id, input);
    if (!post) return json({ error: 'not found' }, 404);
    return json({ ok: true, post });
  } catch {
    return json({ error: 'update failed' }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await gate(context);
  if (auth instanceof Response) return auth;

  const id = new URL(context.request.url).searchParams.get('id') ?? '';
  if (!id) return json({ error: 'missing id' }, 400);

  try {
    await deletePost(id);
    return json({ ok: true });
  } catch {
    return json({ error: 'delete failed' }, 500);
  }
};
