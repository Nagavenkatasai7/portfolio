/**
 * Two-call Claude pipeline for the weekly newsletter draft:
 *   1) research + write (web_search server tool)  -> markdown + citations
 *   2) format (no tools)                          -> structured email JSON
 *
 * Structured output is parsed DEFENSIVELY and Zod-validated, with a markdown
 * fallback, so a schema hiccup never loses the researched content. The web
 * search tool shape is version-sensitive; it is isolated here and cast loosely.
 * This module only runs server-side and requires ANTHROPIC_API_KEY at runtime.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { marked } from 'marked';
import { requireEnv } from './env';
import { sanitizeEmailHtml } from './sanitize';

const MODEL = 'claude-opus-4-8';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  return client;
}

export const DraftSchema = z.object({
  subject: z.string().min(1).max(160),
  preheader: z.string().max(200).default(''),
  html: z.string().min(1),
  plaintext: z.string().min(1),
});
export type Draft = z.infer<typeof DraftSchema>;

export interface Note {
  content: string;
  url: string | null;
}

function textOf(content: Anthropic.ContentBlock[]): {
  text: string;
  citations: unknown[];
} {
  let text = '';
  const citations: unknown[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      text += block.text;
      const cites = (block as { citations?: unknown[] }).citations;
      if (Array.isArray(cites)) citations.push(...cites);
    }
  }
  return { text, citations };
}

async function research(
  isoWeek: string,
  notes: Note[]
): Promise<{ text: string; citations: unknown[] }> {
  const notesBlock = notes.length
    ? notes.map((n) => `- ${n.content}${n.url ? ` (${n.url})` : ''}`).join('\n')
    : '(none provided this week)';

  const prompt = `You are drafting the ${isoWeek} issue of a software engineer's personal weekly newsletter.
Theme: practical tech tutorials/learnings + a curated "links worth your time" roundup (software engineering, web dev, AI).
Use web search to find 4-6 genuinely notable and RECENT items (new releases, tools, techniques, well-written articles). Prefer primary sources and include the real URL for each.
Also weave in these owner-supplied notes/links where relevant:
${notesBlock}

Write the issue in clean Markdown — first person, concise, no hype:
- a 2-3 sentence intro
- a short "This week's read" tutorial/deep-dive paragraph
- a "Links worth your time" list of 4-6 bullets, each a real link with a one-line reason it matters.`;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
  ] as unknown as Anthropic.Tool[];

  let text = '';
  const citations: unknown[] = [];
  // Handle the web-search tool loop (pause_turn) with a hard iteration cap.
  for (let i = 0; i < 5; i++) {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages,
      tools,
    });
    const collected = textOf(res.content);
    text += collected.text;
    citations.push(...collected.citations);
    if ((res.stop_reason as string) === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.ContentBlockParam[] });
      continue;
    }
    break;
  }
  return { text, citations };
}

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

function extractJson(s: string): string | null {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return s.slice(start, end + 1);
}

async function formatDraft(markdown: string): Promise<Draft> {
  const prompt = `Convert this newsletter draft into an email. Return ONLY minified JSON (no markdown fences) with keys:
- "subject": <=120 chars, compelling but honest, no clickbait
- "preheader": <=140 chars
- "html": email-safe HTML — inline styles only, no <script>, no external CSS, links as <a href>
- "plaintext": a readable plain-text version

DRAFT:
${markdown}`;

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const { text } = textOf(res.content);

  const jsonStr = extractJson(stripFences(text));
  if (jsonStr) {
    try {
      const parsed = DraftSchema.safeParse(JSON.parse(jsonStr));
      if (parsed.success) {
        return { ...parsed.data, html: sanitizeEmailHtml(parsed.data.html) };
      }
    } catch {
      /* fall through to markdown fallback */
    }
  }

  const html = sanitizeEmailHtml(await marked.parse(markdown, { async: true }));
  return {
    subject: 'This week in software & AI',
    preheader: '',
    html,
    plaintext: markdown,
  };
}

export async function generateDraft(
  isoWeek: string,
  notes: Note[]
): Promise<{ draft: Draft; sources: unknown[] }> {
  const r = await research(isoWeek, notes);
  const draft = await formatDraft(r.text || 'No content was generated this week.');
  return { draft, sources: r.citations };
}
