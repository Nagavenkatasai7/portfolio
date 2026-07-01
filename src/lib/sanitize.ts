/**
 * HTML sanitization for any stored/rendered rich text (blog post bodies,
 * newsletter HTML). Astro's `set:html` performs NO sanitization, so anything
 * that ends up in `set:html` or an email must pass through here first to prevent
 * stored XSS — especially in the admin preview, where the privileged cookie is
 * in scope.
 */
import sanitizeHtml from 'sanitize-html';

const contentTags: string[] = sanitizeHtml.defaults.allowedTags.concat([
  'img',
  'h1',
  'h2',
  'figure',
  'figcaption',
  'span',
]);

const baseAttributes: Record<string, string[]> = {
  ...sanitizeHtml.defaults.allowedAttributes,
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  a: ['href', 'name', 'target', 'rel'],
  span: ['class'],
  code: ['class'],
};

const options: sanitizeHtml.IOptions = {
  allowedTags: contentTags,
  allowedAttributes: baseAttributes,
  allowedSchemes: ['http', 'https', 'mailto'],
  // Force safe rel on every anchor.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer nofollow',
    }),
  },
  // Drop <script>, <style>, and their contents entirely.
  disallowedTagsMode: 'discard',
};

/** Sanitize rich HTML for on-site rendering (blog). */
export function sanitizeContentHtml(dirty: string): string {
  return sanitizeHtml(dirty, options);
}

/**
 * Sanitize HTML destined for email. Emails need inline styles and table
 * layout, so we allow the `style` ATTRIBUTE and table tags, but still strip
 * scripts and the (vulnerable) <style> tag.
 */
export function sanitizeEmailHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    ...options,
    allowedTags: contentTags.concat([
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'center',
    ]),
    allowedAttributes: {
      ...baseAttributes,
      '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'class'],
    },
  });
}
