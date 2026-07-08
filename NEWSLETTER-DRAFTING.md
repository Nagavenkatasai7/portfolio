# NEWSLETTER-DRAFTING.md — the weekly Field Guide drafting session (Phase N3)

This is the playbook a **fresh Claude Code session** follows, start to finish,
to draft one issue of "The Field Guide." It assumes nothing carried over from
any prior conversation — everything it needs is either in this file or
discoverable from the commands below.

**The one rule that matters more than any other: this session never approves,
never sends, never publishes.** It produces exactly one thing — a `draft`
content row + a `draft` issue meta row, sitting in `/admin/newsletter` — and
then stops and reports. A human (the owner) reviews it, test-sends it, and
clicks **Approve** themselves. Nothing in this workflow can reach a
subscriber's inbox on its own; `create-draft` only ever calls
`ensureIssueMeta` (which never touches lifecycle `status`), never
`approveIssue`/`sendNow`/`sendTestIssue`.

## Trigger

The owner says **"draft this week's issue"** (or equivalent) at any time —
run the workflow below on demand. An optional recurring trigger (e.g. every
Monday 8PM ET) can be layered on top by whatever orchestrates this session's
schedule — that's configured outside this repo and outside this doc; once
triggered, everything below is the same either way.

## Tooling this session uses

| Tool | Purpose |
| --- | --- |
| `node --conditions=react-server scripts/newsletter-draft-helper.mjs links` | list candidate material |
| Web research (`WebFetch`/`WebSearch`, or an `Agent`/fork per story) | verify each candidate against its primary source |
| `node scripts/newsletter-hero.mjs ... --upload` | render + host the issue's hero image |
| `node --conditions=react-server scripts/newsletter-draft-helper.mjs create-draft` | write the draft (content row + issue meta) |
| `node --conditions=react-server scripts/newsletter-draft-helper.mjs mark-used` | close the loop on the link bin |

Both scripts live in `scripts/`. The draft-helper needs `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` — if a local run 503s/errors on missing env, pull
them first: `vercel env pull .env.local --environment=production --yes`, and
**delete `.env.local` when you're done** (it holds the service-role key —
never commit it; `.gitignore` already excludes it, but don't leave it lying
around either). The hero generator needs no env at all unless you pass
`--upload`, in which case it needs the same two Supabase vars.

---

## Voice rules (this is the product)

The site's own pitch to subscribers is the spec: *"One email a week: the
three or four AI stories that actually matter, what they mean in plain
English, and one thing you can try yourself. I read the noise so you don't
have to."* Every issue has to actually deliver that. Concretely:

- **Audience: zero AI background.** Write for someone who has used ChatGPT a
  handful of times and nothing else. If a sentence assumes the reader knows
  what "inference," "fine-tuning," "context window," "agent," or "RAG" means,
  it's not ready.
- **Every story follows the same three beats, in order:**
  1. **What happened** — 2–4 sentences. Concrete and factual. No
     throat-clearing ("In an exciting development...").
  2. **Why it matters to you** — connects to the reader's own life or work,
     not "the industry" or "the future of AI." If you can't name a concrete
     reader (someone job-hunting, someone who manages email, someone who
     codes on the side), the "why" is too abstract — rewrite it.
  3. **One thing to try** — a specific, doable action the reader can take in
     the next five minutes: a phrase to type into a tool they already have, a
     setting to check, a question to ask. Never "keep an eye on this" or
     "stay informed" — that's not a thing to *try*.
- **≤4 stories.** That's a ceiling, not a target — 3 tight stories beat 4
  padded ones.
- **Short sentences.** If a sentence has more than one subordinate clause or
  runs past ~25 words, split it.
- **Concrete analogies over abstractions.** E.g. "a context window is like a
  whiteboard — once it's full, old notes get erased to fit new ones," not "a
  context window is the model's working memory buffer."
- **No unexplained jargon.** The first time a technical term appears, give it
  a same-sentence plain-English gloss. After that, you can use the term
  alone.
- **No hype words.** Banned, no exceptions: *revolutionary, game-changing,
  groundbreaking, unprecedented, disruptive, paradigm shift, cutting-edge,
  next-level, supercharge, unleash, transform your life, game changer.* If a
  sentence needs one of these to sound impressive, the sentence is doing the
  wrong job — replace the adjective with a specific fact.
- **Subject line ≤55 characters.** Longer truncates in most inbox previews.
- **Preheader ≤90 characters.** The inbox preview snippet — it should add
  information, not just restate the subject.
- **Consistent sign-off**, every issue, verbatim:

  ```
  That's this week's Field Guide. Reply if a story raised a question — I read every reply.

  — Naga
  ```

### What the body markdown can and can't render

The issue body goes through the exact sanitizer `/blog` uses
(`lib/markdown.js`), which only allows: `p, br, hr, strong, em, b, i, del,
code, pre, blockquote, ul, ol, li, h1–h4, a`. **No images, no tables.** Don't
write `![...](...)`  into a story — it will be silently stripped both on
`/blog` and in the email. The ONLY image in an issue is the hero, which is
set separately via `--hero` / `ensureIssueMeta.hero_image_url` and rendered
at the top of the email by `lib/email/issue_template.js` — not part of the
body markdown at all. Use `##`/`###` for each story's heading, `**bold**` for
emphasis, and `[text](url)` for the "read the source" links.

---

## Workflow

### 1. Pull candidate material

```
node --conditions=react-server scripts/newsletter-draft-helper.mjs links
```

Prints clean JSON: `queuedLinks` (owner-curated URLs sitting in the link bin,
each `{id, url, note, added}`) and `linkedinCandidates` (the last 7 days of
auto-synced LinkedIn posts, each `{id, excerpt, url}`). Both are raw
material, not vetted stories — treat `note` and `excerpt` as a pointer to go
verify, not as something to summarize directly into the issue.

Pick up to 4 items total. Prefer `queuedLinks` (the owner explicitly queued
these) over `linkedinCandidates` when both cover similar ground, and prefer
variety over four takes on the same sub-topic.

### 2. Research every candidate against its primary source

For each item you picked, actually go read it — don't draft off the 80-char
excerpt or the owner's short note. Use `WebFetch`/`WebSearch` directly, or
fan out one `Agent`/fork per story if you're covering several at once:

- Read the **primary source** — the actual announcement, paper, product
  page, or the LinkedIn post itself (for `linkedinCandidates`, the `url` is
  the post).
- Find **1–2 corroborating sources** that independently confirm the same
  facts (a second outlet, the vendor's own docs, a second post from someone
  who tried it). If you can't corroborate a claim, either soften it ("X says
  ...") or drop the story — don't publish something you can't back up.
- Note exactly what changed and for whom — that's the raw material for "what
  happened" and "why it matters."

### 3. Write the issue markdown

Structure (repeat the story block up to 4 times):

```markdown
## <Story 1 headline, plain language, no jargon>

<What happened — 2–4 sentences.>

**Why it matters to you:** <1–3 sentences, concrete reader.>

**One thing to try:** <a specific five-minute action.>

[Read the source](https://the-primary-source-url)

## <Story 2 headline>

...

---

That's this week's Field Guide. Reply if a story raised a question — I read every reply.

— Naga
```

Save it to a file, e.g. `/tmp/field-guide-issue-N.md` (anywhere off-repo is
fine — it's only read once by `create-draft`).

Also settle on, separately from the body:
- **Title** (`--title`) — the headline shown on `/blog` and in
  `/admin/newsletter`'s issue list. Can mirror the subject or be a touch
  longer/more descriptive; no hard length cap (truncated to 300 chars).
- **Subject** (`--subject`) — the email subject line, **≤55 characters**.
  This is also what renders as the big `<h1>` at the top of the email itself
  (`renderIssueEmail` falls back subject → title, and every draft here always
  sets subject, so subject wins).
- **Preheader** (`--preheader`) — **≤90 characters**, the inbox preview text.

### 4. Generate and upload the hero image

```
node scripts/newsletter-hero.mjs \
  --title "<same headline as the subject, or close to it>" \
  --issue <issue number> \
  --date "<e.g. Jul 15, 2026>" \
  --out /tmp/field-guide-hero-N.png \
  --upload
```

Prints the render's dimensions/size, then (with `--upload`) the object's
public URL — pass that straight to `create-draft --hero`. If you'd rather
ship without a hero image, skip this step and pass `--hero -` in step 5.

### 5. Create the draft

```
node --conditions=react-server scripts/newsletter-draft-helper.mjs create-draft \
  --title "<title>" \
  --subject "<≤55-char subject>" \
  --preheader "<≤90-char preheader>" \
  --hero "<the public URL from step 4, or - for none>" \
  --body-file /tmp/field-guide-issue-N.md
```

Writes the content row through the exact same chokepoint
`/admin/compose` uses (`lib/compose.js#buildComposerItem` →
`lib/gate.js#ingestContent`, always `status: draft`), then
`ensureIssueMeta` for subject/preheader/hero (which never touches the
armed-queue `status` — the issue meta row is created, and stays, `draft`).
Prints `{contentId, adminUrl}`.

### 6. Close the loop on the link bin

For every `queuedLinks` item you actually used in step 3 (not the
`linkedinCandidates` you used — those aren't in the link bin, there's nothing
to flip):

```
node --conditions=react-server scripts/newsletter-draft-helper.mjs mark-used \
  --issue <contentId from step 5> \
  --ids <id,id,...>
```

Safe to re-run — an id that's already `used`/`discarded` is reported back in
`skipped`, not an error.

### 7. Report to the owner — and stop

Reply with exactly:
- The **subject line**.
- The **story list** (one line each — headline + which source it came from).
- The **adminUrl** from step 5.

Then stop. **Do not** call `approveIssue`, `sendNow`, or `sendTestIssue`, and
don't ask the owner to auto-approve through this session — they review the
draft, test-send it, and approve it themselves in `/admin/newsletter`. That
review step is the whole reason this pipeline stops at `draft`.

---

## Worked example (fake links, real structure)

Say step 1 returns:

```json
{
  "queuedLinks": [
    { "id": "11111111-1111-1111-1111-111111111111", "url": "https://example.com/news/browser-agent-update", "note": "assistant can now click through a real browser", "added": "2026-07-06T14:00:00Z" }
  ],
  "linkedinCandidates": [
    { "id": "22222222-2222-2222-2222-222222222222", "excerpt": "Most context windows fill up faster than people expect, and when they do the model starts...", "url": "https://linkedin.com/feed/update/urn:li:ugcPost:0000000000000000000" }
  ]
}
```

After reading the primary source for each (the vendor's release notes; the
LinkedIn post + the paper it links to) and finding a corroborating second
source, the issue markdown (`/tmp/field-guide-issue-1.md`):

```markdown
## Your AI assistant can now click things, not just talk

OpenAI shipped an update that lets its assistant control a real browser tab —
clicking buttons, filling in forms, submitting a search — instead of only
describing what you should click.

**Why it matters to you:** the assistant that drafts your email can now also
send it, book the appointment, or fill in the web form, without you
copy-pasting between windows.

**One thing to try:** next time you'd normally ask "write me the steps to do
X on this website," ask instead if the assistant can "just do X" — a growing
number of tools can now act directly instead of only advising.

[Read the source](https://example.com/news/browser-agent-update)

## AI "memory" just got roomier — here's what that actually buys you

A major model provider doubled how much text one of its mid-tier models can
hold in a single conversation.

**Why it matters to you:** think of a context window like a whiteboard —
once it's full, older notes get erased to make room for new ones. A bigger
whiteboard means you can paste in a whole contract or a long code file and
the assistant can talk about all of it, not just the last page you pasted.

**One thing to try:** if a chat has started "forgetting" the beginning of a
long conversation, don't keep scrolling up and repeating yourself — start a
fresh conversation and paste in just the parts that still matter. A clean
whiteboard beats a full one.

[Read the source](https://linkedin.com/feed/update/urn:li:ugcPost:0000000000000000000)

---

That's this week's Field Guide. Reply if a story raised a question — I read every reply.

— Naga
```

Then:

```
node scripts/newsletter-hero.mjs \
  --title "Your AI can finally click buttons" --issue 1 --date "Jul 15, 2026" \
  --out /tmp/field-guide-hero-1.png --upload
# -> prints a public URL, e.g. https://<project>.supabase.co/storage/v1/object/public/media/newsletter/hero-issue-1-....png

node --conditions=react-server scripts/newsletter-draft-helper.mjs create-draft \
  --title "Your AI can finally click buttons" \
  --subject "Your AI can finally click buttons" \
  --preheader "Plus: why a bigger AI memory changes what you can paste in" \
  --hero "https://<project>.supabase.co/storage/v1/object/public/media/newsletter/hero-issue-1-....png" \
  --body-file /tmp/field-guide-issue-1.md
# -> {"contentId": "...", "adminUrl": "https://chennunagavenkatasai.com/admin/newsletter"}

node --conditions=react-server scripts/newsletter-draft-helper.mjs mark-used \
  --issue <contentId> --ids 11111111-1111-1111-1111-111111111111
```

("Your AI can finally click buttons" is 33 characters — comfortably under the
55-char subject cap. The preheader above is 58 characters, under the 90 cap.)

Final report to the owner:

> **Subject:** Your AI can finally click buttons
> **Stories:** (1) Browser-controlling AI assistants — from example.com;
> (2) Bigger context windows, what that buys you — from LinkedIn.
> **Review at:** https://chennunagavenkatasai.com/admin/newsletter

---

## Notes

- If `adminUrl` prints as `http://localhost:3000/admin/newsletter`, that's
  `lib/site.js#siteBaseUrl()` falling back because `NEXT_PUBLIC_SITE_URL`
  wasn't in the pulled env — not a bug in the draft-helper. Send the owner to
  the real `/admin/newsletter` on the deployed site regardless.
- `create-draft` always creates a **new** content row — it's the same
  identity rule the composer uses (`external_id` = a slug + random suffix),
  so running it twice makes two drafts, not an update. If a draft needs
  fixing after creation, that's a normal edit in `/admin` (`EditForm` /
  `updateContentFields`), not a re-run of `create-draft`.
- This CLI never touches `RESEND_API_KEY` — nothing it does can send email.
  Sending only happens when the owner clicks **Approve** and either the
  Tuesday cron or **Send now** in `/admin/newsletter` picks it up (see
  `RUNBOOK-NEWSLETTER.md`, Phase N2).
