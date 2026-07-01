/**
 * Blog post data access. Every query is parameterized via the `sql` tagged
 * template — request input is NEVER interpolated into SQL. Markdown is rendered
 * to HTML and SANITIZED before it is stored in `body_html`.
 */
import { sql } from './db';
import { marked } from 'marked';
import { sanitizeContentHtml } from './sanitize';

export type PostStatus = 'draft' | 'published' | 'archived';

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  body_html: string | null;
  cover_image: string | null;
  tags: string[];
  status: PostStatus;
  author_email: string;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostInput {
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  cover_image: string | null;
  tags: string[];
  status: PostStatus;
}

/** Slugs are a strict allowlist — validate before any DB lookup or write. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function renderMarkdown(md: string): Promise<string> {
  const raw = await marked.parse(md, { async: true });
  return sanitizeContentHtml(raw);
}

export async function listPublished(): Promise<Post[]> {
  const rows = await sql`
    SELECT * FROM posts
    WHERE status = 'published' AND published_at IS NOT NULL
    ORDER BY published_at DESC`;
  return rows as unknown as Post[];
}

export async function getPublishedBySlug(slug: string): Promise<Post | null> {
  if (!SLUG_RE.test(slug)) return null;
  const rows = await sql`
    SELECT * FROM posts WHERE slug = ${slug} AND status = 'published' LIMIT 1`;
  return (rows[0] as unknown as Post) ?? null;
}

export async function listAll(): Promise<Post[]> {
  const rows = await sql`SELECT * FROM posts ORDER BY updated_at DESC`;
  return rows as unknown as Post[];
}

export async function getById(id: string): Promise<Post | null> {
  const rows = await sql`SELECT * FROM posts WHERE id = ${id} LIMIT 1`;
  return (rows[0] as unknown as Post) ?? null;
}

export async function createPost(
  input: PostInput,
  authorEmail: string
): Promise<Post> {
  const bodyHtml = await renderMarkdown(input.body_md);
  const publishedAt =
    input.status === 'published' ? new Date().toISOString() : null;
  const rows = await sql`
    INSERT INTO posts
      (slug, title, excerpt, body_md, body_html, cover_image, tags, status, author_email, published_at)
    VALUES
      (${input.slug}, ${input.title}, ${input.excerpt}, ${input.body_md}, ${bodyHtml},
       ${input.cover_image}, ${input.tags}, ${input.status}, ${authorEmail}, ${publishedAt})
    RETURNING *`;
  return rows[0] as unknown as Post;
}

export async function updatePost(
  id: string,
  input: PostInput
): Promise<Post | null> {
  const bodyHtml = await renderMarkdown(input.body_md);
  const rows = await sql`
    UPDATE posts SET
      slug = ${input.slug},
      title = ${input.title},
      excerpt = ${input.excerpt},
      body_md = ${input.body_md},
      body_html = ${bodyHtml},
      cover_image = ${input.cover_image},
      tags = ${input.tags},
      status = ${input.status},
      published_at = CASE
        WHEN ${input.status} = 'published' AND published_at IS NULL THEN now()
        ELSE published_at END,
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return (rows[0] as unknown as Post) ?? null;
}

export async function deletePost(id: string): Promise<void> {
  await sql`DELETE FROM posts WHERE id = ${id}`;
}

export async function incrementViews(id: string): Promise<void> {
  await sql`UPDATE posts SET view_count = view_count + 1 WHERE id = ${id}`;
}
