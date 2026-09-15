# COLDSTART — homepage design spec

Status: approved by owner 2026-09-15. Replaces the static `public/index.html` homepage.

## 1. Goal

`chennunagavenkatasai.com/` becomes an executable node graph of Naga's work. A visitor presses RUN; the pipeline halts at the exact failure he is known for catching (TRL v0.20.0 silently dropping assistant-only loss masking); the visitor applies his fix; the run completes through evaluation to serving. Navigation is camera (pan/zoom) and keyboard, never page scroll. A non-technical recruiter reaches the résumé PDF and contact within ~3 seconds without understanding any of it.

Non-goals: no WebGL, no new npm dependencies, no changes to blog/newsletter/admin/crons/middleware, no new backend.

## 2. Hard constraints (from the owner's brief)

1. Not a scrolling page, not a multi-page site, not a video. Primary movement = camera + keyboard. RUN cannot complete without a human keystroke (`P`).
2. Escape hatch always visible: `[Résumé PDF] [Contact] [Plain text]` fixed top-right, first elements in the DOM, above every layer, never faded. Identity line fixed bottom-left.
3. Accessibility: full keyboard parity; `/plain` linear document generated from the same data; `prefers-reduced-motion` honored everywhere; phone layout is first-class.
4. Static Next.js 15 App Router on the existing Vercel project. Client JS may call the existing `/api/chat` only.
5. Content is verbatim from the master résumé (`public/Naga_Chennu_Resume.pdf`). Every rendered number carries provenance: `resume` (verbatim) or `computed` (in the browser). No invented metrics. No visa/immigration wording anywhere.
6. Performance: LCP is server-rendered HTML; new client JS ≤ 250 KB gzipped (CI-enforced); canvas idle CPU 0%.

## 3. Files

```
next.config.mjs            remove the "/" -> "/index.html" rewrite
app/page.js                Server Component: renders <Coldstart graph={GRAPH}/> statically
app/plain/page.js          Server Component: linear accessible document from GRAPH
app/coldstart/Coldstart.js 'use client' island root (stage, camera, scheduler wiring)
app/coldstart/Stage.js     fixed stage: EscapePill, IdentityLine, World, Wires, DotGrid, RunLog, LiveRegion
app/coldstart/Node.js      <article> node card; data-lod driven detail; expand/collapse
app/coldstart/Wires.js     SVG bezier edges + WAAPI packets
app/coldstart/DotGrid.js   aria-hidden canvas; animates only while running/dragging
app/coldstart/AskNaga.js   the ask-naga node UI (input, suggestions, degraded state)
app/coldstart/demos/LossMask.js     token strip + toggle (synthetic 60-token conversation, labelled "illustrative")
app/coldstart/demos/ChartX.js       18-type bars from data/chartx.json + McNemar recompute
app/coldstart/demos/SchemaCheck.js  sample tool-call validated against the extraction schema
app/coldstart/coldstart.css        all styles (CSS custom properties; printed-schematic register)
lib/graph.js               GRAPH = { lanes, nodes, edges }; NODE_IDS enum; pure data
lib/coldstart/camera.js    pan/zoom math, LOD thresholds, hash state
lib/coldstart/scheduler.js topological run state machine (pure, testable)
lib/coldstart/stats.js     mcnemarExact(b, c) -> p; anovaF (used for display only)
lib/coldstart/match.js     keyword/JD matcher -> ranked node ids (deterministic)
lib/coldstart/nav.js       enum-bound parse of ask-naga replies
lib/coldstart/lossmask.js  demo masker: tokens -> {contributing, loss} for OFF/ON
data/chartx.json           per-type accuracies + treemap before/after discordant counts (owner-supplied; until then resume constants tagged provenance:"resume")
scripts/bundle-size.mjs    measures gzipped new client JS from .next/static; fails > 250 KB
tests/*.test.mjs           node --test: scheduler, stats, match, nav, lossmask, graph invariants
api/_persona.mjs           résumé-aligned persona + NAVIGATION MODE rule
app/blog/page.js, lib/x_draft.js   positioning consistency fixes (already drafted)
public/index.html, public/chatbot.js, public/chatbot.css   DELETED
app/sitemap.js             add /plain
```

## 4. Data model — `lib/graph.js`

```js
export const LANES = ['DATA', 'TRAIN', 'EVAL', 'SERVE'];
// node shape
{
  id: 'chartx.eval',             // stable; member of NODE_IDS enum
  lane: 'EVAL',
  title: 'chartx.eval',          // mono file-style label
  human: 'Vision-language chart understanding',   // plain-language title for /plain and aria
  kind: 'work' | 'experience' | 'education' | 'papers' | 'skills' | 'apps' | 'identity' | 'ask',
  lod: {
    0: 'one line, <= 90 chars (always visible)',
    1: ['bullet', 'bullet'],     // visible at zoom >= 1.0 or when expanded
    2: { demo: 'ChartX' | 'LossMask' | 'SchemaCheck' | null, body: 'case study markdown-lite (plain strings)', source: 'lib/.. or repo url' }
  },
  metrics: [ { label: 'treemap accuracy after relabel', value: '97.7%', provenance: 'resume' | 'computed' } ],
  links: [ { label: 'repo', href: '...' } ],
  thumb: '/assets/projects/llm-forge.jpg' | null,
  run: { durationMs: 900, halts: false } | { durationMs: 1200, halts: true, patchKey: 'P' }
}
// edges
{ from: 'llm-forge', to: 'loss-mask.patch', lane: 'TRAIN' }
```

Nodes (16) and their résumé content:

| id | lane | content (verbatim facts) |
|---|---|---|
| identity.yaml | DATA | Naga Venkata Sai Chennu — AI Systems Engineer — LLM systems, evals, and serving — Fairfax, VA — available now, open to remote |
| experience.gmu | DATA | George Mason University, Costello College of Business — AI Systems Engineer — Aug 2025 - May 2026 — the five résumé bullets |
| experience.klu | DATA | Koneru Lakshmaiah University, Dept. of CSE — Research Assistant — Aug 2020 - May 2024 — the two résumé bullets |
| education | DATA | M.S. CS, GMU, Aug 2024 - May 2026, GPA 3.57/4.00; B.Tech CSE, KL University, Aug 2020 - May 2024, First Class with Distinction |
| publications | DATA | IEEE ICICT 2023 (doi 10.1109/ICICT57646.2023.10134057); three first-author papers IJRITCC 2023, IJISAE 2023/2024; Smart FuelGuard patent pending |
| llm-forge | TRAIN | config-driven 12-stage SFT pipeline; LoRA, QLoRA, GRPO; 4x NVIDIA H100 SLURM; halved time-to-first-experiment; github.com/Nagavenkatasai7/llm-forge |
| loss-mask.patch | TRAIN | TRL v0.20.0 regression; assistant-only loss masking silently dropped; found by inspecting token-level loss across SFT checkpoints; restored for every run. HALTS the run. demo: LossMask |
| regression.suite | EVAL | 900-check regression suite vs human-labeled ground truth; McNemar's exact test and ANOVA; regressions surfaced pre-release |
| chartx.eval | EVAL | GPT-5.4 on all 6,000 ChartX images, 18 chart types; 91-95% position-encoded vs 51.6% treemaps; relabelled treemaps 97.7%; McNemar p = 0.0003. demo: ChartX |
| extract.svc | SERVE | Claude API extraction service; 500+ multi-page USPTO/legal filings; tool-call output constrained to a Pydantic v2 schema; 95% field-level accuracy vs human labels; manual review down ~80%. demo: SchemaCheck |
| mcp.server | SERVE | MCP server routing multi-step tool calls across 2,000+ records; throughput up ~30%; fine-tuned models published to Hugging Face for two faculty research groups |
| jetbot | SERVE | on-device agent, Jetson Orin Nano; Nemotron via OpenRouter; SQLite FTS5 memory; cgroups v2 isolation; human-approval gates |
| cuda.kernel | TRAIN | tiled CUDA matmul benchmarked vs cuBLAS; tuned shared memory and block size (from the old site; no numbers claimed) |
| deployed.apps | SERVE | 8 live apps with thumbnails from /assets/projects; links via vercel.json shortlinks |
| skills.registry | DATA | Production / Working / Methods tiers, verbatim; each skill is a live filter: focusing it outlines every node that exercises it |
| ask-naga | SERVE | input + 3 suggested prompts + paste-a-JD; navigation via enum-bound reply |

Invariants (tested): every node id unique and in NODE_IDS; every edge endpoint exists; graph is a DAG; topological order = DOM order = tab order; every metric has provenance; no string in GRAPH matches /visa|OPT|H-1B|sponsor|Salesforce|test automation/i.

## 5. Rendering

- Stage: `position: fixed; inset: 0; overflow: hidden`. Layers (z ascending): DotGrid canvas (0) → Wires SVG (1) → `#world` DOM (2) → RunLog (3) → IdentityLine (4) → EscapePill (5, also first in DOM).
- `#world` has `transform: translate3d(x,y,0) scale(s)`; nothing else moves. Node positions are fixed layout coordinates in `lib/graph.js` (lane columns × row).
- LOD: `s < 0.6` → `data-lod="0"`; `0.6 ≤ s < 1.1` → `1`; `s ≥ 1.1` or node expanded → `2`. Set on `#world` only at threshold crossings (no React re-render on zoom).
- Wires: cubic beziers between port anchors; `vector-effect: non-scaling-stroke`; packets are 6px dots animated with `element.animate()` along `offset-path`; only the active edge animates.
- DotGrid: 2D canvas, DPR capped 2; draws once; re-draws on run/drag frames only; stops on `visibilitychange`.
- Art direction: paper `#f3eee4`, ink `#1a1d26`, rule `#c9c1b2`, signal red `#c8321a`, amber `#c58a1a`, green `#2f7d4f`, accent blue `#1f5fb8` (links). Fonts: IBM Plex Mono (labels/numbers) + Source Serif 4 or Inter (body) via Google Fonts, `display=swap`, system fallbacks. Hairline rules, no glow, no gradients, no dark mode neon.

## 6. Scheduler — `lib/coldstart/scheduler.js` (pure)

States per node: `idle | queued | running | done | failed | blocked | skipped`. Run states: `idle | running | halted | complete`.

```
run(): order = topo(GRAPH minus cut edges); for node in order:
  set running; animate packet on incoming edge; wait node.run.durationMs
  if node.run.halts and !patched: set failed; run.state = halted; return
  set done
run.state = complete; emit receipt { nodes: n, elapsedMs }
patch(): patched = true; recompute lossmask ON; set loss-mask.patch done; resume()
cutEdge(id): removes edge; if EVAL lane becomes unreachable, serve nodes get flag unevaluated=true → on done, stamp warning card
step(): reduced-motion mode; advances exactly one node per call
```

Camera follows the running node (ease 300 ms) unless the user has dragged in the last 2 s. Hash: `#n=<id>&s=<scale>&x=&y=&run=<state>`.

## 7. Demos

- LossMask: fixed synthetic conversation (60 tokens, roles user/assistant), rendered as chips. OFF (the regression): every token contributes, `contributing: 60` — the prompt is training the model too. ON (after `P`): only the 41 assistant tokens contribute, `contributing: 41`, and the prompt chips go grey. (Corrected 2026-09-15: an earlier draft of this line had it backwards — TRL v0.20.0 *dropped* assistant-only masking, so the bug state trains on all 60 tokens rather than on none. `lib/coldstart/lossmask.js` has always implemented the corrected semantics.) Loss curve sparkline labelled "illustrative — shape only". Caption: `upstream: trl==0.20.0`.
- ChartX: reads `data/chartx.json` `{ types: [{name, accuracy, n}], treemap: { before: {accuracy, n}, after: {accuracy, n}, discordant: {b, c} } }`. Bars fill in run; if `discordant` present, `p = mcnemarExact(b, c)` shown with provenance `computed`; else the résumé's `p = 0.0003` with provenance `resume`. Until the owner's file arrives, ship the résumé constants (3 types: position-encoded 91–95% range shown as 91 and 95, treemap 51.6 → 97.7) all tagged `resume`.
- SchemaCheck: a small JSON-schema-subset validator (`type`, `required`, `enum`, `properties`, `pattern`) runs a sample extraction tool-call against the filing schema; shows PASS with the validated payload; a deliberately malformed sample shows the rejection — "wrong outputs are unrepresentable".

## 8. ask-naga

- Request: `POST /api/chat { messages: [{role:'user', content: '/nav ' + text}] }` (last 6 turns). Reads the SSE stream, concatenates `content` chunks.
- Persona NAVIGATION MODE (added to `api/_persona.mjs`): when the user message begins with `/nav`, reply with exactly one line of JSON `{"node":"<one of NODE_IDS>","caption":"<=140 chars, plain text>"}` and nothing else.
- Client: `parseNav(text)` → JSON.parse of the first `{...}`; `node ∈ NODE_IDS` and `caption` string ≤ 140 chars, else `null`. On null/timeout(8 s)/429/error → `match(text)` local matcher picks the node; caption = `"(offline) closest match: <human title>"`. Caption always rendered as text.
- Paste-a-JD: local `match()` only → ranked node ids; lights the subgraph, dims the rest, prints `read as: <top terms> → <k> nodes`.
- Three suggested prompts: "What has he shipped?", "Can he do evals?", "Where has he worked?" — each pre-bound to a node (no network).

## 9. Keyboard and pointer

`Tab`/`Shift+Tab` nodes in topological order · `Enter` expand / `Esc` collapse · `R` run · `P` patch (only when halted) · `N` next step (reduced motion) · `X` on a focused wire: cut · `/` focus ask-naga · `?` help sheet · `0` reset camera · arrows pan when nothing focused. Pointer: drag pan (pointer events, passive), wheel/pinch zoom about cursor, click node = expand. Touch: same + swipe between siblings in phone mode.

## 10. Phone (< 640 px)

Stage map: four lane pucks across the top (DATA TRAIN EVAL SERVE) with state dots; below, a vertical stack of node cards for the selected lane; swipe or tap pucks to change lane. The identical scheduler drives it; the camera is replaced by scroll-into-view of the running card (this is scroll within a panel, not page scroll). Escape pill becomes a sticky bottom bar. 44 px targets.

## 11. `/plain`

Server-rendered from GRAPH: h1 identity, h2 per lane, h3 per node with `human` title, lod0 line, lod1 bullets, lod2 body as paragraphs, metrics as a definition list with provenance, links. Contact and résumé link at top and bottom. Zero client JS. Also linked from `<noscript>`, from the skip link, and from the escape pill.

## 12. Accessibility

Skip link first; escape pill second. `aria-live="polite"` region narrates: "Running llm-forge…", "Halted at loss-mask.patch: assistant-only loss masking is off. Press P to apply the fix.", "Run complete, 9 nodes." Node cards are `<article>` with `aria-expanded`; wires and DotGrid `aria-hidden`. Focus ring visible on paper. Reduced motion: no packets, no camera easing (instant cuts), stepper instead of RUN, counters snap.

## 13. Performance and CI

- `/` is static (no dynamic data); the island hydrates after LCP.
- `scripts/bundle-size.mjs`: after `next build`, sums gzipped bytes of client chunks referenced by the `/` route manifest that did not exist on `platform` (baseline computed from `.next` on the base commit is impractical in CI; instead enforce an absolute ceiling: all first-load JS for `/` ≤ 250 KB gzipped, as reported by `next build` output parsing). Fails the job above the ceiling.
- Google Fonts preconnect; `font-display: swap`.

## 14. Tests (`node --test tests/`)

- graph.test: invariants in §4.
- scheduler.test: topo order; halts at loss-mask.patch; patch resumes; cut EVAL → unevaluated flag; step mode advances one node.
- stats.test: mcnemarExact(b,c) against known values (e.g. b=0,c=12 → p≈0.000488; symmetric; b=c → 1.0).
- match.test: JD text with "PyTorch TRL SLURM" ranks llm-forge and loss-mask.patch top.
- nav.test: valid JSON + enum passes; unknown node → null; caption > 140 → null; prose → null.
- lossmask.test: OFF (the regression) → contributing 60; ON → contributing 41 (fixed conversation).

## 15. Ship

Branch `coldstart` → PR to `platform` → Vercel preview → owner approves → merge. P0 (static graph, escape pill, /plain, expand, keyboard, tests, CI gate) is a working site on its own; P1 adds scheduler, packets, halt-and-patch, demos; P2 adds ask-naga navigation mode and JD matcher.

## 16. Acceptance

- Land → résumé PDF open in ≤ 3 s with no scroll/zoom.
- Keyboard-only user can run, patch, expand every node, and reach contact.
- `/plain` contains every fact on the graph; no fact appears on the graph that isn't in the résumé.
- Lighthouse on the preview: performance ≥ 90 mobile, accessibility ≥ 95.
- `node --test` green; `next build` green; bundle gate green.
