# Venkat Portfolio Design System

A personal brand & design system for **Chennu Naga Venkata Sai** — AI/ML Engineer, CS Researcher, and graduate student at George Mason University. Purpose-built for the personal portfolio site at [nagavenkatasai7.github.io/portfolio](https://nagavenkatasai7.github.io/portfolio/), but extensible to slides, resumes, research posters, and any future personal-brand artifacts.

---

## Brand at a Glance

- **Person:** Chennu Naga Venkata Sai (goes by "Venkat" or "Sai")
- **Role:** AI/ML Engineer · Graduate Research Assistant · CS MS candidate (GMU, May 2026)
- **Positioning:** Serious researcher + hands-on builder. Production AI pipelines *and* peer-reviewed publications.
- **Signals:** 5 publications · 50+ citations · NVIDIA GenAI certified · 3× AWS certified · Claude Code certified
- **Focus areas:** LLM interpretability, multilingual NLP, RAG systems, multi-agent architectures, AI-driven automation
- **Audience:** Recruiters, hiring managers for AI/ML roles, research collaborators, PhD admissions committees
- **Vibe:** Academic rigor meets Silicon Valley polish. Calm, credible, quietly confident. Not flashy — substance-first.

## Sources

- **Live site:** https://nagavenkatasai7.github.io/portfolio/ (fetched content analyzed)
- **Resume PDF:** https://nagavenkatasai7.github.io/portfolio/Naga_Venkata_Sai_Chennu_Career_Fair_Resume.pdf
- **GitHub:** https://github.com/Nagavenkatasai7
- **LinkedIn:** https://www.linkedin.com/in/nagavenkatasaichennu
- **ORCID:** https://orcid.org/0009-0000-8252-8682

> No codebase or Figma was attached. The design system was reverse-engineered from the live site's content architecture, copy, and information hierarchy. The visual style below is a **considered recommendation** aligned with the portfolio's positioning — it may not match the current live CSS exactly. Flag this on first iteration.

---

## Index

Root files:
- `README.md` — this document
- `colors_and_type.css` — CSS variables + semantic classes (fg, bg, h1, body, mono, etc.)
- `SKILL.md` — Agent Skill for generating branded artifacts
- `fonts/` — self-hosted webfonts (or Google Fonts loader)
- `assets/` — logos, profile image references, icon sprites
- `preview/` — design-system cards (typography, color, components) rendered for the Design System tab
- `ui_kits/portfolio/` — React component recreation of the personal portfolio site

---

## Content Fundamentals

**Voice:** First-person, matter-of-fact, quietly confident. No hype language, no "passionate," no "rockstar." Let the numbers do the talking.

**Tone:** Academic-adjacent but not stuffy. Reads like a researcher who ships production code — because that's what he is.

**Person:** Primarily **I** in About/bio copy ("I'm an AI/ML Engineer…"). Shifts to noun phrases and imperative in section taglines ("Get in touch", "What I work with").

**Casing:**
- **Section eyebrows:** ALL CAPS or Title Case single words — `About`, `Skills`, `Projects`, `Key Projects`
- **Section headers (H2):** Sentence case with a period, occasionally an em-dash. Declarative.
  - ✓ "Research meets real-world AI engineering."
  - ✓ "What I work with"
  - ✓ "What I've built"
  - ✓ "Let's work together."
- **Card/Project titles:** Title Case — "Multi-Agent AI Research Discovery Platform"
- **Tags & chips:** Title Case short form — "Claude API", "RAG", "Vector DB"

**Numbers as hooks.** The site leads with quantifiable proof points as display-scale numerals. Use them.
- `5` Peer-Reviewed Publications
- `50+` Research Citations
- `3.52` GPA at George Mason
- `6` Professional Certifications
- `May '26` Graduation Date

Pair a big number with a short sub-label underneath. This is the single most distinctive content pattern on the site.

**Copy structure patterns:**
- **Headline stat line:** "AI/ML Engineer. 5 publications. 50+ citations." — three period-terminated fragments, escalating.
- **Bulleted achievements:** Action-verb opener, specific numbers, named technologies.
  - ✓ "Built an AI automation pipeline analyzing 1,000+ trademark opposition cases using Claude API…"
  - ✗ "Passionate about AI and love solving hard problems"
- **Status banner:** "Available for full-time roles — New Grad May 2026" — em-dash separator, timestamped specificity.
- **Location line:** Plain facts, separated by a middle dot: `George Mason University · GPA: 3.52/4.0`

**Do say:** "built", "designed", "integrated", "published", "co-authored", "production", "peer-reviewed", "certified", "processing 1,000+ documents"
**Don't say:** "passionate", "guru", "ninja", "10x", "game-changing", "revolutionary", "AI enthusiast"

**Emoji:** Not used. Do not add.

**Punctuation flourishes:**
- Em-dashes (`—`) for status/subtitle separators
- Middle dots (`·`) for compact metadata lines
- Periods after short declarative headlines

---

## Visual Foundations

### Color vibe

Restrained, scholarly, high-contrast. A **near-black primary** with a **single warm accent** and generous **off-white canvas**. The palette reads "research paper meets well-designed SaaS dashboard" — serious but not cold.

- **Canvas:** off-white / paper (`#FAFAF7`) — a touch warm, never stark white
- **Ink (foreground):** near-black (`#0F0F12`) for body, true black (`#000`) reserved for display
- **Accent:** a single **burnt amber / ochre** (`#B8633A`) used sparingly for links, chip outlines, and the hero status pill. Evokes page highlighter / academic margin note.
- **Support:** slate grays for secondary text, a muted sage for "success/verified" (certifications), no other semantic colors used liberally.

Avoid: gradient backgrounds, purple/blue duotones, neon anything, "AI purple."

### Typography

- **Display & headings:** a sharp serif (`Fraunces` or `Source Serif 4` — editorial, high-contrast) for H1/H2 to signal scholarship. Tight tracking, slight negative letter-spacing at display sizes.
- **Body & UI:** a humanist sans (`Inter` as neutral default; `IBM Plex Sans` preferred for the "engineer with taste" feel)
- **Numerals/Stats:** tabular figures, display size, near-thin weight for the big hero stats — this is the hero move
- **Mono:** `JetBrains Mono` or `IBM Plex Mono` for code, IDs, tags, metadata

### Spacing & rhythm

- **Baseline:** 8px grid. Type sizes on a modular scale of 1.25.
- **Section padding:** generous — 96–160px vertical between sections on desktop. The site breathes.
- **Content width:** 1160px max container; 720px for prose; 640px for intro paragraphs.

### Backgrounds

Flat solid colors, no imagery behind text. A single profile photo (circular or soft-rounded square) in the About section — the only true image on the site. Optional **subtle paper grain** overlay at 2–4% opacity adds warmth without noise.

### Borders

Hairline (`1px`) in slate-300 for cards and dividers. Accent color borders used *only* on outline-style chips and active states. No thick borders, no dashed borders.

### Corner radii

Minimal. `4px` for chips and small pills, `8px` for cards, `12px` maximum for hero containers. Never fully rounded except for the status pill and profile avatar.

### Cards

- `1px` solid slate-200 border
- Off-white fill, 1–2 shades lighter than canvas
- Subtle shadow: `0 1px 2px rgba(15,15,18,0.04)`. On hover lift to `0 4px 12px rgba(15,15,18,0.08)` with a 1px upward translate.
- `24px` internal padding minimum. `32px` for project cards.

### Shadows

Sparingly used. Never for decoration. Elevation scale:
- `sm` — `0 1px 2px rgba(15,15,18,0.04)` — resting cards
- `md` — `0 4px 12px rgba(15,15,18,0.08)` — hover
- `lg` — `0 12px 32px rgba(15,15,18,0.12)` — modal / tooltip

### Animation

- **Easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` (gentle, quick start, soft stop) as the universal easing
- **Duration:** 160ms for micro-interactions, 280ms for section-level transitions
- **Patterns:** opacity fade + 8px translate-up for scroll-in sections. No bounces, no springs, no parallax.
- **Hover:** color darken, border darken, optional 1–2px lift. Never scale buttons.
- **Focus ring:** 2px accent color outline, 2px offset. Always visible.

### Hover & press states

- **Links:** accent color on rest, underline appears on hover (or thickens)
- **Buttons (primary):** ink fill → slightly darker ink on hover, no scale, 1px shadow lift
- **Buttons (outline):** transparent → canvas-tint fill on hover
- **Cards:** border-color darken + shadow lift + 1px translate-up
- **Chips:** subtle bg fill tint on hover

### Transparency & blur

Not used. The aesthetic is *papery flatness*, not glass/material. Exception: a very subtle sticky-nav backdrop-blur with 90% canvas fill is acceptable.

### Layout rules

- **Sticky top nav** with logo (text wordmark) left, section anchors right
- **Hero:** left-aligned headline + stat-line. Not centered.
- **Stat row:** 5-column grid of big numerals + captions, immediately below hero
- **Section headers:** small eyebrow label (ALL CAPS, tracked) above a serif H2
- **Fixed elements:** only the top nav. No floating CTAs, no chat bubbles.

### Fixed decisions summary (avoid AI slop)

- ✗ No purple/blue gradients
- ✗ No emoji anywhere
- ✗ No rounded-corner cards with colored left-border accents
- ✗ No hand-drawn SVG illustrations
- ✗ No generic "AI particle" backgrounds
- ✓ Flat, typographically-led, generous whitespace
- ✓ One accent color used surgically
- ✓ Serif display + humanist sans body
- ✓ Numbers as visual anchors

---

## Iconography

**Approach:** minimal, utilitarian line icons at 1.5–2px stroke, currentColor. Icons never decorate — they label.

**System chosen:** [Lucide](https://lucide.dev) via CDN. Matches the clean, library-style line work the portfolio aesthetic calls for. MIT-licensed, tree-shakeable, broad coverage.

**CDN link:**
```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
```
Or inline SVG per-icon for static artifacts.

**Usage rules:**
- Stroke weight: `1.75` (default) for UI, `1.5` for display-scale
- Size: 16px inline with text, 20px in nav, 24px for cards, 32px for section anchors
- Color: inherits `currentColor` — never colorize except for semantic status (all same accent if used)
- Always pair with text labels for accessibility; never icon-only primary actions

**Common icons in this system:**
- Navigation: `arrow-up-right`, `chevron-down`, `menu`, `x`
- Contact: `mail`, `phone`, `map-pin`, `linkedin`, `github`
- Research: `book-open`, `file-text`, `quote`, `award`
- Tech: `cpu`, `database`, `terminal`, `git-branch`, `cloud`
- Certifications: `badge-check`, `shield-check`

**Brand-specific marks (copy from third parties where licensing permits):**
- Simple Icons (CDN) for brand logos: AWS, NVIDIA, Red Hat, LinkedIn, GitHub, ORCID. `https://cdn.simpleicons.org/{slug}/{hex}`
- University / publisher logos should be sourced from each institution's official brand page — do not fabricate.

**Emoji:** Not used. Not part of the system.
**Unicode chars as icons:** Middle dot (`·`) and em-dash (`—`) are the only Unicode "icons" in active use, as copy separators.

---

## Font substitution note

No proprietary font files were provided. The system specifies three open-source families available on Google Fonts:

- **Fraunces** (display serif) — Google Fonts
- **Inter** (UI sans — neutral default) or **IBM Plex Sans** (preferred) — both Google Fonts
- **JetBrains Mono** (mono) — Google Fonts

All are loaded via Google Fonts CDN in `colors_and_type.css`. **Flagged:** if the live portfolio uses a different stack (e.g. system-ui only), swap the Google Fonts `@import` line and update the CSS variables.
