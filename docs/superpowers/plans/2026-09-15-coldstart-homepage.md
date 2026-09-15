# COLDSTART Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static homepage with an executable node graph of Naga's work: RUN halts at the TRL loss-masking failure, `P` applies his fix, the run completes; camera + keyboard navigation; `/plain` fallback; zero new dependencies.

**Architecture:** Pure, testable modules in `lib/coldstart/` (scheduler, camera, stats, matcher, nav parser, loss-mask demo) over a single data source `lib/graph.js`. A client island `app/coldstart/Coldstart.js` composes them into a fixed stage (canvas dot-grid → SVG wires → DOM node cards in one transformed `#world`). `app/plain/page.js` renders the same data as a linear document. `api/_persona.mjs` gains a navigation mode the `ask-naga` node parses with an enum guard.

**Tech Stack:** Next.js 15.5 App Router (JS, `"type": "module"`), React 19.2, CSS custom properties, Web Animations API, Canvas 2D, SVG. Tests: `node --test`. No new npm packages.

**Spec:** `docs/superpowers/specs/2026-09-15-coldstart-homepage-design.md`

## Global Constraints

- No new entries in `package.json` `dependencies`/`devDependencies`.
- All content strings come from the spec §4 table (verbatim résumé facts). Regex `/visa|\bOPT\b|H-1B|sponsor|Salesforce|test automation/i` must match nothing in `lib/graph.js`, `app/`, or `api/_persona.mjs` (except the persona's instruction to route visa questions to email, which uses the word "visa" once — the graph test excludes `api/`).
- Every metric object has `provenance: 'resume' | 'computed'`.
- Node ids, order, lanes, and edges exactly as in `lib/graph.js` (Task 1); every other module treats them as opaque strings.
- Escape pill `[Résumé PDF] [Contact] [Plain text]` is the first focusable content after the skip link, fixed top-right, z-index above all layers.
- Keyboard map (spec §9) is fixed: `Tab` nodes, `Enter` expand, `Esc` collapse, `R` run, `P` patch, `N` step, `X` cut focused wire, `/` ask-naga, `?` help, `0` reset.
- Art direction (spec §5): paper `#f3eee4`, ink `#1a1d26`, rule `#c9c1b2`, red `#c8321a`, amber `#c58a1a`, green `#2f7d4f`, blue `#1f5fb8`. No gradients, no glow, no dark neon.
- Commit after every task with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.

---

## File structure

| Path | Responsibility |
|---|---|
| `lib/graph.js` | The only source of content: LANES, NODES (with `pos`), EDGES, NODE_IDS, GRAPH, `nodeById` |
| `lib/coldstart/scheduler.js` | Pure run state machine: topo order, run/halt/patch/step/cut |
| `lib/coldstart/camera.js` | Pure camera math: pan, zoom-about-point, frame node, LOD, hash (de)serialization |
| `lib/coldstart/stats.js` | `mcnemarExact`, `anovaF` |
| `lib/coldstart/match.js` | Deterministic keyword/JD matcher over GRAPH |
| `lib/coldstart/nav.js` | Enum-guarded parser of ask-naga replies |
| `lib/coldstart/lossmask.js` | Synthetic 60-token conversation and masker |
| `lib/coldstart/schema.js` | JSON-schema-subset validator + extraction schema + sample payloads |
| `data/chartx.json` | ChartX results (résumé constants until the owner's file lands) |
| `app/coldstart/Coldstart.js` | `'use client'` root: state, keyboard, pointer, scheduler wiring |
| `app/coldstart/Stage.js` | Layout of layers + EscapePill + IdentityLine + RunLog + LiveRegion + HelpSheet |
| `app/coldstart/Node.js` | Node card (`<article>`), LOD content, expand, demo slot |
| `app/coldstart/Wires.js` | SVG edges + packet animation + cut affordance |
| `app/coldstart/DotGrid.js` | Canvas background |
| `app/coldstart/AskNaga.js` | ask-naga node body |
| `app/coldstart/demos/LossMask.js`, `ChartX.js`, `SchemaCheck.js` | LOD-2 demos |
| `app/coldstart/coldstart.css` | All styles |
| `app/page.js` | Server page for `/` |
| `app/plain/page.js` | Linear document |
| `scripts/bundle-size.mjs` | CI gate |
| `tests/*.test.mjs` | node --test suites |

Execution waves (independent within a wave): **A** = Tasks 1–7 (pure modules + data) · **B** = Tasks 8–12 (UI, plain, persona, routing) · **C** = Task 13 (integration + CI) · then review.

---

### Task 1: Graph data — `lib/graph.js`

**Files:**
- Create: `lib/graph.js`
- Test: `tests/graph.test.mjs`

**Interfaces:**
- Produces:
  ```js
  export const LANES = ['DATA', 'TRAIN', 'EVAL', 'SERVE'];
  export const NODES;      // Array<Node> in topological/reading order
  export const EDGES;      // Array<{ from: string, to: string, lane: string }>
  export const NODE_IDS;   // NODES.map(n => n.id)
  export const GRAPH = { lanes: LANES, nodes: NODES, edges: EDGES };
  export function nodeById(id);          // Node | undefined
  export const FORBIDDEN = /visa|\bOPT\b|H-1B|sponsor|Salesforce|test automation/i;
  // Node = { id, lane, title, human, kind, pos: {x, y}, size: {w, h},
  //          lod: { 0: string, 1: string[], 2: { demo: string|null, body: string[], source: string|null } },
  //          metrics: Array<{ label, value, provenance }>, links: Array<{ label, href }>,
  //          thumb: string|null, run: { durationMs: number, halts: boolean, patchKey?: 'P' } }
  ```
- Layout: lane columns `x = 0 | 380 | 760 | 1140`; rows `y = 0, 230, 460, 690`; every node `size: { w: 320, h: 190 }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/graph.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, NODES, EDGES, NODE_IDS, GRAPH, nodeById, FORBIDDEN } from '../lib/graph.js';

test('16 unique node ids, all in NODE_IDS', () => {
  assert.equal(NODES.length, 16);
  assert.equal(new Set(NODE_IDS).size, 16);
  for (const n of NODES) assert.ok(NODE_IDS.includes(n.id));
});

test('every node has lane, lod levels, pos, size, run, provenance on metrics', () => {
  for (const n of NODES) {
    assert.ok(LANES.includes(n.lane), n.id);
    assert.equal(typeof n.lod[0], 'string');
    assert.ok(n.lod[0].length <= 90, `${n.id} lod0 too long`);
    assert.ok(Array.isArray(n.lod[1]));
    assert.ok(Array.isArray(n.lod[2].body));
    assert.equal(typeof n.pos.x, 'number'); assert.equal(typeof n.pos.y, 'number');
    assert.equal(n.size.w, 320);
    assert.equal(typeof n.run.durationMs, 'number');
    for (const m of n.metrics) assert.ok(['resume', 'computed'].includes(m.provenance), `${n.id}:${m.label}`);
  }
});

test('edges reference existing nodes and form a DAG', () => {
  const ids = new Set(NODE_IDS);
  for (const e of EDGES) { assert.ok(ids.has(e.from), e.from); assert.ok(ids.has(e.to), e.to); }
  const indeg = Object.fromEntries(NODE_IDS.map(id => [id, 0]));
  for (const e of EDGES) indeg[e.to]++;
  const q = NODE_IDS.filter(id => indeg[id] === 0); let seen = 0;
  const out = {}; for (const e of EDGES) (out[e.from] ||= []).push(e.to);
  while (q.length) { const id = q.shift(); seen++; for (const t of out[id] || []) if (--indeg[t] === 0) q.push(t); }
  assert.equal(seen, NODE_IDS.length, 'cycle detected');
});

test('NODES order is a valid topological order (DOM order = tab order)', () => {
  const idx = Object.fromEntries(NODE_IDS.map((id, i) => [id, i]));
  for (const e of EDGES) assert.ok(idx[e.from] < idx[e.to], `${e.from} must precede ${e.to}`);
});

test('exactly one halting node: loss-mask.patch', () => {
  const halts = NODES.filter(n => n.run.halts).map(n => n.id);
  assert.deepEqual(halts, ['loss-mask.patch']);
  assert.equal(nodeById('loss-mask.patch').run.patchKey, 'P');
});

test('no forbidden strings anywhere in the graph', () => {
  assert.doesNotMatch(JSON.stringify(GRAPH), FORBIDDEN);
});

test('résumé anchors present verbatim', () => {
  const s = JSON.stringify(GRAPH);
  for (const needle of ['AI Systems Engineer', 'Research Assistant', 'Aug 2020 - May 2024', 'Aug 2025 - May 2026', 'GPA 3.57/4.00', 'TRL v0.20.0', 'p = 0.0003', '6,000', '4x NVIDIA H100', 'Pydantic v2', 'nagavenkatasaichennu@gmail.com']) {
    assert.ok(s.includes(needle), `missing: ${needle}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails** — `node --test tests/graph.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Write `lib/graph.js`** with the 16 nodes from spec §4, in this order and with these lanes/positions:

```
DATA  col x=0    : identity.yaml (y0), experience.gmu (y230), experience.klu (y460), education (y690), publications (y920), skills.registry (y1150)
TRAIN col x=380  : llm-forge (y0), loss-mask.patch (y230), cuda.kernel (y460)
EVAL  col x=760  : regression.suite (y0), chartx.eval (y230)
SERVE col x=1140 : extract.svc (y0), mcp.server (y230), jetbot (y460), deployed.apps (y690), ask-naga (y920)
```

Edges (lane = lane of `to`):
```
identity.yaml->llm-forge, experience.gmu->llm-forge, experience.gmu->loss-mask.patch, experience.klu->regression.suite,
education->llm-forge, publications->chartx.eval, skills.registry->llm-forge,
llm-forge->loss-mask.patch, loss-mask.patch->regression.suite, loss-mask.patch->chartx.eval, cuda.kernel->llm-forge,
regression.suite->extract.svc, chartx.eval->extract.svc, extract.svc->mcp.server, mcp.server->jetbot, mcp.server->deployed.apps, deployed.apps->ask-naga
```
(Note: `cuda.kernel->llm-forge` requires cuda.kernel to precede llm-forge in NODES order — place `cuda.kernel` before `llm-forge` in the array while keeping its position at y460.)

Run durations: DATA nodes 500 ms; `llm-forge` 900; `loss-mask.patch` 1200 (`halts: true, patchKey: 'P'`); `regression.suite` 800; `chartx.eval` 1600; `extract.svc` 900; `mcp.server` 700; `jetbot` 600; `deployed.apps` 600; `ask-naga` 400.

Metrics with provenance `'resume'`: llm-forge `{label:'time-to-first-experiment', value:'halved'}`, `{label:'cluster', value:'4x NVIDIA H100 SLURM'}`; loss-mask.patch `{label:'upstream', value:'trl==0.20.0'}`; regression.suite `{label:'checks', value:'900'}`; chartx.eval `{label:'images', value:'6,000'}`, `{label:'chart types', value:'18'}`, `{label:'treemap accuracy', value:'51.6% -> 97.7%'}`, `{label:'McNemar', value:'p = 0.0003'}`; extract.svc `{label:'filings', value:'500+'}`, `{label:'field-level accuracy', value:'95%'}`, `{label:'manual review effort', value:'~80% lower'}`; mcp.server `{label:'records', value:'2,000+'}`, `{label:'throughput', value:'~30% higher'}`; education `{label:'GPA', value:'3.57/4.00'}`.

`lod[2].demo`: `'LossMask'` on loss-mask.patch, `'ChartX'` on chartx.eval, `'SchemaCheck'` on extract.svc, `null` elsewhere. `thumb`: `/assets/projects/llm-forge.jpg` (llm-forge), `/assets/projects/jetbot.jpg` (jetbot), `/assets/projects/cuda.jpg` (cuda.kernel), `/assets/projects/intellidoc.jpg` (deployed.apps); deployed.apps also carries `apps: [{name, href, thumb}]` for the 8 apps using `vercel.json` shortlinks (`/intellidoc`, `/jira-automation`, `/automation-roi`, `/healthcare-emr`, `/master-data`, `/revops`, `/resume-tailor`, `/passport`) and thumbs `intellidoc.jpg, jira-automation.jpg, automation-roi.jpg, healthcare-emr.jpg, master-data.jpg, revops.jpg, resume-tailor.jpg, passport.jpg`.

identity.yaml `links`: email `mailto:nagavenkatasaichennu@gmail.com`, LinkedIn `https://www.linkedin.com/in/naga-venkata-sai-chennu/`, GitHub `https://github.com/Nagavenkatasai7`, Résumé `/Naga_Chennu_Resume.pdf`, Book 30 min `https://fantastical.app/vhrdnrbmgt/chennunagavenkatasai`.

- [ ] **Step 4: Run test** — `node --test tests/graph.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `git add lib/graph.js tests/graph.test.mjs && git commit -m "feat(coldstart): graph data model with résumé content"`

---

### Task 2: Scheduler — `lib/coldstart/scheduler.js`

**Files:** Create `lib/coldstart/scheduler.js`; Test `tests/scheduler.test.mjs`

**Interfaces:**
- Consumes: `GRAPH` shape from Task 1 (`nodes[].id`, `nodes[].run`, `edges[]`).
- Produces:
  ```js
  export function edgeKey(e)            // `${e.from}->${e.to}`
  export function topoOrder(graph, cut = new Set())   // string[]; Kahn's algorithm, ties broken by graph.nodes order; ignores edges whose key is in `cut`
  export function createScheduler(graph, { onChange = () => {}, wait = (ms) => new Promise(r => setTimeout(r, ms)), now = () => Date.now() } = {})
  // returns { getState, run, patch, step, cutEdge, restoreEdge, reset }
  // state = { run: 'idle'|'running'|'halted'|'complete', nodes: Record<id, 'idle'|'queued'|'running'|'done'|'failed'|'blocked'|'skipped'>,
  //           patched: boolean, cut: string[], unevaluated: boolean, current: string|null, elapsedMs: number, receipt: null|{ nodes: number, elapsedMs: number, unevaluated: boolean } }
  ```
- Behavior: `run()` sets all to `queued`, walks `topoOrder`, per node: `running` → `wait(durationMs)` → `done`, or `failed` + `run:'halted'` when `node.run.halts && !patched` (stop). `patch()` when halted: `patched=true`, failed node → `done`, continue the walk. `step()` performs exactly one node transition (for reduced motion) and never waits. `cutEdge(key)` adds to `cut`; `unevaluated` = no path from any EVAL node to any SERVE node in the cut graph. `onChange(state)` after every transition; state objects are fresh copies.

- [ ] **Step 1: Write the failing test**

```js
// tests/scheduler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH } from '../lib/graph.js';
import { createScheduler, topoOrder, edgeKey } from '../lib/coldstart/scheduler.js';

const instant = { wait: async () => {}, now: () => 0 };

test('topoOrder respects edges and node order', () => {
  const order = topoOrder(GRAPH);
  const idx = Object.fromEntries(order.map((id, i) => [id, i]));
  for (const e of GRAPH.edges) assert.ok(idx[e.from] < idx[e.to]);
  assert.equal(order.length, GRAPH.nodes.length);
});

test('run halts at loss-mask.patch, patch resumes to complete', async () => {
  const s = createScheduler(GRAPH, instant);
  await s.run();
  let st = s.getState();
  assert.equal(st.run, 'halted');
  assert.equal(st.nodes['loss-mask.patch'], 'failed');
  assert.equal(st.nodes['chartx.eval'], 'queued');
  await s.patch();
  st = s.getState();
  assert.equal(st.run, 'complete');
  assert.equal(st.nodes['loss-mask.patch'], 'done');
  assert.equal(st.nodes['ask-naga'], 'done');
  assert.equal(st.receipt.nodes, GRAPH.nodes.length);
  assert.equal(st.receipt.unevaluated, false);
});

test('cutting both EVAL->SERVE edges marks the run unevaluated', async () => {
  const s = createScheduler(GRAPH, instant);
  s.cutEdge(edgeKey({ from: 'regression.suite', to: 'extract.svc' }));
  s.cutEdge(edgeKey({ from: 'chartx.eval', to: 'extract.svc' }));
  await s.run(); await s.patch();
  assert.equal(s.getState().unevaluated, true);
  assert.equal(s.getState().receipt.unevaluated, true);
});

test('step advances exactly one node and never waits', async () => {
  let waited = false;
  const s = createScheduler(GRAPH, { wait: async () => { waited = true; }, now: () => 0 });
  await s.step();
  const st = s.getState();
  assert.equal(Object.values(st.nodes).filter(v => v === 'done').length, 1);
  assert.equal(waited, false);
});

test('onChange fires with fresh state copies', async () => {
  const seen = [];
  const s = createScheduler(GRAPH, { ...instant, onChange: (st) => seen.push(st) });
  await s.run();
  assert.ok(seen.length >= 3);
  assert.notEqual(seen[0], seen[1]);
});
```

- [ ] **Step 2: Run** — `node --test tests/scheduler.test.mjs` → FAIL.
- [ ] **Step 3: Implement** per the interface; keep it free of DOM/React; unevaluated check = BFS from EVAL-lane nodes over uncut edges reaching any SERVE-lane node.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(coldstart): pure run scheduler with halt-and-patch`.

---

### Task 3: Statistics — `lib/coldstart/stats.js`

**Files:** Create `lib/coldstart/stats.js`; Test `tests/stats.test.mjs`

**Interfaces:**
```js
export function mcnemarExact(b, c)   // two-sided exact binomial test on discordant pairs; returns p in [0, 1]
export function anovaF(groups)        // groups: number[][]; returns { F, dfBetween, dfWithin }
```

- [ ] **Step 1: Test**

```js
// tests/stats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mcnemarExact, anovaF } from '../lib/coldstart/stats.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('mcnemarExact known values', () => {
  assert.ok(close(mcnemarExact(0, 12), 2 / 4096));
  assert.equal(mcnemarExact(5, 5), 1);
  assert.ok(close(mcnemarExact(1, 9), 2 * (1 + 10) / 1024));
  assert.equal(mcnemarExact(0, 0), 1);
  assert.ok(close(mcnemarExact(3, 20), mcnemarExact(20, 3)));
});

test('anovaF on identical groups is 0, on separated groups is large', () => {
  assert.equal(anovaF([[1, 1, 1], [1, 1, 1]]).F, 0);
  const r = anovaF([[1, 2, 3], [11, 12, 13], [21, 22, 23]]);
  assert.ok(r.F > 100);
  assert.equal(r.dfBetween, 2); assert.equal(r.dfWithin, 6);
});
```

- [ ] **Step 2: Run** → FAIL. 
- [ ] **Step 3: Implement** — binomial coefficients via a running product in doubles (n ≤ ~10,000 fine); `p = min(1, 2 * Σ_{i=0..min(b,c)} C(n,i) / 2^n)`; guard `n === 0 → 1`. ANOVA: standard one-way F with grand mean.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `feat(coldstart): mcnemar exact + one-way anova`.

---

### Task 4: Matcher — `lib/coldstart/match.js`

**Files:** Create `lib/coldstart/match.js`; Test `tests/match.test.mjs`

**Interfaces:**
```js
export function tokenize(text)                       // lowercase word tokens, length >= 2, de-duplicated, with synonyms folded (torch|pytorch -> pytorch; llm|llms -> llm; eval|evals|evaluation -> eval; fine-tune|finetune|fine-tuning|sft -> sft; rag|retrieval -> rag; agent|agents|agentic -> agent; mcp -> mcp; slurm -> slurm; cuda -> cuda; h100 -> h100)
export function match(text, nodes, { limit = 6 } = {})   // [{ id, score, terms: string[] }] sorted by score desc, score > 0 only
export function readAs(result, terms)                 // `read as: ${top 3 terms joined ', '} -> ${result.length} nodes`
```
Scoring: per node build an index string from `title, human, lod[0], lod[1].join, lod[2].body.join, metrics labels+values, links labels`; title/human hits weight 3, others 1; score = Σ weights over query terms present.

- [ ] **Step 1: Test**

```js
// tests/match.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES } from '../lib/graph.js';
import { tokenize, match, readAs } from '../lib/coldstart/match.js';

test('tokenize folds synonyms', () => {
  assert.deepEqual(tokenize('PyTorch torch fine-tuning SFT'), ['pytorch', 'sft']);
});

test('JD mentioning PyTorch TRL SLURM ranks training nodes first', () => {
  const r = match('We need PyTorch, TRL and SLURM experience on H100 clusters for SFT', NODES);
  assert.ok(r.length >= 2);
  assert.ok(['llm-forge', 'loss-mask.patch', 'skills.registry'].includes(r[0].id));
  assert.ok(r.some(x => x.id === 'llm-forge'));
});

test('eval-heavy JD surfaces chartx.eval and regression.suite', () => {
  const r = match('evaluation harness, benchmark design, McNemar, error analysis', NODES);
  const ids = r.map(x => x.id);
  assert.ok(ids.includes('chartx.eval'));
  assert.ok(ids.includes('regression.suite'));
});

test('no match returns empty and readAs is honest', () => {
  const r = match('underwater basket weaving', NODES);
  assert.deepEqual(r, []);
  assert.equal(readAs(r, tokenize('underwater basket weaving')), 'read as: underwater, basket, weaving -> 0 nodes');
});
```

- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat(coldstart): deterministic JD/keyword matcher`.

---

### Task 5: Nav parser — `lib/coldstart/nav.js`

**Interfaces:** `export function parseNav(text, ids)` → `{ node, caption } | null`. Accepts the first `{...}` JSON object in `text`; requires `node ∈ ids`, `typeof caption === 'string'`, `caption.length <= 140`; strips control characters from caption.

- [ ] **Step 1: Test**

```js
// tests/nav.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNav } from '../lib/coldstart/nav.js';
const ids = ['a.node', 'b.node'];
test('valid reply parses', () => {
  assert.deepEqual(parseNav('Sure! {"node":"a.node","caption":"Look here"}', ids), { node: 'a.node', caption: 'Look here' });
});
test('unknown node, long caption, prose, and HTML-ish caption are rejected or sanitized', () => {
  assert.equal(parseNav('{"node":"zzz","caption":"x"}', ids), null);
  assert.equal(parseNav(`{"node":"a.node","caption":"${'x'.repeat(141)}"}`, ids), null);
  assert.equal(parseNav('I think you should look at a.node', ids), null);
  assert.equal(parseNav('{"node":"b.node","caption":"<b>hi</b>"}', ids).caption, '<b>hi</b>');
});
```
- [ ] **Steps 2–5:** FAIL → implement → PASS → commit `feat(coldstart): enum-guarded nav reply parser`.

---

### Task 6: Loss-mask demo model — `lib/coldstart/lossmask.js`

**Interfaces:**
```js
export const DEMO_TOKENS;   // exactly 60 items {t: string, role: 'user'|'assistant'}; exactly 41 assistant tokens; a plausible 2-turn exchange about a training run
export function maskLoss(tokens, { assistantOnly })  // { contributing: number, perToken: [{ t, role, loss: number, contributes: boolean }] }
// assistantOnly=false (bug): contributes=true for ALL tokens, contributing = 60 ... 
```
Wait — the bug is that assistant-only masking was DROPPED, meaning loss was computed on all tokens (prompt included). Model it exactly: `assistantOnly:false` → all 60 contribute (prompt tokens wrongly included); `assistantOnly:true` → only the 41 assistant tokens contribute. Loss values: deterministic per token via `((i * 2654435761) % 1000) / 1000 * 2.5`.

- [ ] **Step 1: Test**

```js
// tests/lossmask.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TOKENS, maskLoss } from '../lib/coldstart/lossmask.js';
test('demo has 60 tokens, 41 assistant', () => {
  assert.equal(DEMO_TOKENS.length, 60);
  assert.equal(DEMO_TOKENS.filter(t => t.role === 'assistant').length, 41);
});
test('bug state trains on prompt tokens; fixed state masks to assistant only', () => {
  assert.equal(maskLoss(DEMO_TOKENS, { assistantOnly: false }).contributing, 60);
  const fixed = maskLoss(DEMO_TOKENS, { assistantOnly: true });
  assert.equal(fixed.contributing, 41);
  assert.ok(fixed.perToken.filter(p => p.role === 'user').every(p => !p.contributes && p.loss === 0));
});
```
- [ ] **Steps 2–5:** FAIL → implement → PASS → commit `feat(coldstart): loss-mask demo model`.

---

### Task 7: Camera math + schema validator + data file

**Files:** Create `lib/coldstart/camera.js`, `lib/coldstart/schema.js`, `data/chartx.json`; Tests `tests/camera.test.mjs`, `tests/schema.test.mjs`

**Interfaces:**
```js
// camera.js — cam = { x, y, s }  (world translate in px and scale)
export const LIMITS = { min: 0.35, max: 2.5 };
export const LOD = { lod1: 0.6, lod2: 1.1 };
export function lodFor(s)                                  // 0 | 1 | 2
export function panBy(cam, dx, dy)                         // new cam
export function zoomAt(cam, point, factor, limits = LIMITS)   // zoom about screen point {x,y}; keeps the world point under the cursor fixed; clamps s
export function frameNode(cam, node, viewport, s = 1.0)    // cam centering node.pos+size/2 in viewport {w,h} at scale s
export function toHash(cam, extra = {})                    // '#s=1.00&x=12&y=-40&n=chartx.eval&run=halted'
export function fromHash(hash)                             // { s, x, y, n, run } with defaults { s: 0.8, x: 40, y: 40 }
export function worldFromScreen(cam, pt)                   // {x,y}

// schema.js
export function validate(schema, value)   // { ok: true } | { ok: false, errors: string[] }  — supports type (string|number|integer|boolean|object|array), required, properties, enum, pattern, minLength, items
export const FILING_SCHEMA;   // object schema: { application_number: string pattern ^\d{2}/\d{3},\d{3}$, filing_date: string pattern ^\d{4}-\d{2}-\d{2}$, applicant: string minLength 1, claims_count: integer, status: enum ['pending','granted','abandoned'] }
export const SAMPLE_OK;       // a valid payload
export const SAMPLE_BAD;      // claims_count: "twelve", status: "maybe"
```
`data/chartx.json` initial content (all `provenance: "resume"`):
```json
{ "provenance": "resume", "note": "Résumé constants until the full per-type results file is supplied.",
  "types": [ { "name": "position-encoded (low)", "accuracy": 0.91 }, { "name": "position-encoded (high)", "accuracy": 0.95 }, { "name": "treemap", "accuracy": 0.516 } ],
  "treemap": { "before": { "accuracy": 0.516 }, "after": { "accuracy": 0.977 }, "p": 0.0003, "discordant": null } }
```

- [ ] **Step 1: Tests**

```js
// tests/camera.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lodFor, zoomAt, panBy, frameNode, toHash, fromHash, worldFromScreen } from '../lib/coldstart/camera.js';
test('lod thresholds', () => { assert.equal(lodFor(0.5), 0); assert.equal(lodFor(0.6), 1); assert.equal(lodFor(1.1), 2); });
test('zoomAt keeps the world point under the cursor fixed and clamps', () => {
  const cam = { x: 100, y: 50, s: 1 };
  const pt = { x: 300, y: 200 };
  const before = worldFromScreen(cam, pt);
  const z = zoomAt(cam, pt, 1.5);
  const after = worldFromScreen(z, pt);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6);
  assert.equal(zoomAt(cam, pt, 100).s, 2.5);
  assert.equal(zoomAt(cam, pt, 0.001).s, 0.35);
});
test('panBy and frameNode', () => {
  assert.deepEqual(panBy({ x: 0, y: 0, s: 1 }, 5, -5), { x: 5, y: -5, s: 1 });
  const cam = frameNode({ x: 0, y: 0, s: 0.8 }, { pos: { x: 380, y: 230 }, size: { w: 320, h: 190 } }, { w: 1000, h: 800 }, 1);
  assert.equal(cam.s, 1);
  assert.equal(cam.x, 1000 / 2 - (380 + 160)); assert.equal(cam.y, 800 / 2 - (230 + 95));
});
test('hash round-trips', () => {
  const h = toHash({ x: 12.4, y: -40, s: 1 }, { n: 'chartx.eval', run: 'halted' });
  const back = fromHash(h);
  assert.equal(back.s, 1); assert.equal(back.x, 12); assert.equal(back.n, 'chartx.eval'); assert.equal(back.run, 'halted');
  assert.deepEqual(fromHash(''), { s: 0.8, x: 40, y: 40, n: null, run: null });
});
```
```js
// tests/schema.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, FILING_SCHEMA, SAMPLE_OK, SAMPLE_BAD } from '../lib/coldstart/schema.js';
test('sample payloads', () => {
  assert.deepEqual(validate(FILING_SCHEMA, SAMPLE_OK), { ok: true });
  const bad = validate(FILING_SCHEMA, SAMPLE_BAD);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.includes('claims_count')));
  assert.ok(bad.errors.some(e => e.includes('status')));
});
test('required and pattern', () => {
  assert.equal(validate({ type: 'object', required: ['a'], properties: { a: { type: 'string', pattern: '^x' } } }, {}).ok, false);
  assert.equal(validate({ type: 'object', required: ['a'], properties: { a: { type: 'string', pattern: '^x' } } }, { a: 'xy' }).ok, true);
});
```
- [ ] **Steps 2–5:** FAIL → implement → PASS → commit `feat(coldstart): camera math, schema validator, chartx data`.

---

### Task 8: Styles + Stage + Node + Wires + DotGrid (static P0 UI)

**Files:** Create `app/coldstart/coldstart.css`, `app/coldstart/Stage.js`, `app/coldstart/Node.js`, `app/coldstart/Wires.js`, `app/coldstart/DotGrid.js`, `app/coldstart/Coldstart.js` (P0 version: camera + expand + keyboard; scheduler wiring in Task 11).

**Interfaces:**
- Consumes: `GRAPH`, `NODE_IDS` (Task 1); `camera.js` (Task 7).
- Produces (component props, all plain JS objects):
  ```js
  <Coldstart />                                  // 'use client'; imports GRAPH itself; owns cam state, expanded id, focus, help sheet, hash sync
  <Stage cam lod children escape identity runLog live />   // renders layers in z order; #world gets style transform from cam
  <Node node state expanded lod onToggle onFocus demo />  // <article id={`node-${id}`} data-lane data-state aria-expanded tabIndex=0>
  <Wires graph cut activeEdge nodeStates onCut />         // <svg aria-hidden>; each edge <path data-edge={key} class="wire" />; active edge gets .packet child animated with element.animate along offset-path
  <DotGrid active />                                       // canvas; draws grid once; when `active` runs rAF subtle drift; stops on visibilitychange
  ```
- Escape pill markup (must be first content after skip link):
  ```html
  <a class="skip" href="/plain">Skip the graph — plain text résumé</a>
  <nav class="escape" aria-label="Quick actions">
    <a href="/Naga_Chennu_Resume.pdf">Résumé PDF</a>
    <button type="button" aria-haspopup="dialog">Contact</button>
    <a href="/plain">Plain text</a>
  </nav>
  ```
  Contact opens a native `<dialog>` listing email, LinkedIn, GitHub, booking link, each with a copy button.
- Identity line: `<p class="identity">Naga Venkata Sai Chennu — AI Systems Engineer — Fairfax, VA — available now</p>` fixed bottom-left.
- CSS: custom properties from Global Constraints; `.stage{position:fixed;inset:0;overflow:hidden;background:var(--paper)}`; `#world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}`; node card 320×190 at `pos`; `[data-lod="0"] .lod1,[data-lod="0"] .lod2{display:none}` etc.; `[data-state="failed"]{border-color:var(--red)}` `running` amber pulse (disabled under reduced motion), `done` green tick; focus ring `outline:2px solid var(--blue);outline-offset:3px`; phone (`max-width:639px`) switches `.stage` to the lane-puck layout: `.lanes` row of 4 buttons + `.stack` vertical list (`overflow:auto`), `#world` transform disabled.
- Keyboard in Coldstart P0: `Tab` natural order; `Enter`/`Space` on a focused node toggles expand; `Esc` collapses; `0` resets cam to `fromHash('')`; arrows pan by 80px when focus is on the stage; `?` toggles help sheet (`<dialog>`); pointer drag pans; wheel zooms via `zoomAt` with `factor = Math.exp(-deltaY * 0.0015)`; pinch via pointer events distance ratio. Camera state → `history.replaceState` hash (throttled 150 ms).

- [ ] **Step 1: Write a render smoke test** (node --test, no DOM: verify modules import and `Node` returns an element tree with the right ids — use `react-dom/server`):

```js
// tests/ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NODES } from '../lib/graph.js';
import Node from '../app/coldstart/Node.js';

test('Node renders article with id, lane, lod0 text, and expanded attribute', () => {
  const n = NODES.find(x => x.id === 'chartx.eval');
  const html = renderToStaticMarkup(React.createElement(Node, { node: n, state: 'idle', expanded: false, lod: 1, onToggle: () => {}, onFocus: () => {} }));
  assert.ok(html.includes('id="node-chartx.eval"'));
  assert.ok(html.includes('data-lane="EVAL"'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes(n.lod[0]));
});
```
(Components must not touch `window` at module scope so this SSR test works — same rule Next enforces.)

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement the five components + CSS. **Step 4:** PASS. **Step 5:** commit `feat(coldstart): stage, node cards, wires, dot grid, camera controls (P0)`.

---

### Task 9: `/plain` page

**Files:** Create `app/plain/page.js`; Modify `app/sitemap.js` (add `/plain`).

**Interfaces:** Consumes `GRAPH`. Server Component, zero client JS. Structure: `<main>` → `<h1>` identity + contact links → per lane `<h2>{lane}</h2>` → per node `<section aria-labelledby>` with `<h3>{human} <code>{title}</code></h3>`, `<p>{lod[0]}</p>`, `<ul>` lod1, `<p>` per lod2.body item, `<dl>` metrics with `<dd>{value} <small>({provenance})</small>`, links list, thumbnails as `<img alt>` for apps. Footer repeats contact + résumé. `export const metadata = { title: 'Naga Venkata Sai Chennu — plain text résumé', alternates: { canonical: '/plain' } }`.

- [ ] **Step 1: Test** — SSR test asserting the page markup contains every `lod[0]` string and every metric value and no forbidden strings:
```js
// tests/plain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NODES, FORBIDDEN } from '../lib/graph.js';
import Plain from '../app/plain/page.js';
test('/plain carries every fact and no forbidden strings', () => {
  const html = renderToStaticMarkup(React.createElement(Plain));
  for (const n of NODES) { assert.ok(html.includes(n.lod[0]), n.id); for (const m of n.metrics) assert.ok(html.includes(m.value), `${n.id}:${m.label}`); }
  assert.doesNotMatch(html, FORBIDDEN);
  assert.ok(html.includes('/Naga_Chennu_Resume.pdf'));
});
```
- [ ] **Steps 2–5:** FAIL → implement → PASS → commit `feat(coldstart): /plain linear document`.

---

### Task 10: Persona + ask-naga UI

**Files:** Replace `api/_persona.mjs` with the aligned draft (`scratchpad/_persona.draft.mjs` content) plus the NAVIGATION MODE block; Create `app/coldstart/AskNaga.js`; Test `tests/persona.test.mjs`.

**Interfaces:**
- Persona NAVIGATION MODE text (append inside SYSTEM_PROMPT before the FACTS line):
  ```
  NAVIGATION MODE
  - If the user's message begins with "/nav", you are being used to navigate a graph of my work. Reply with EXACTLY one line of JSON and nothing else: {"node":"<id>","caption":"<plain text, max 140 characters>"}
  - <id> MUST be one of: identity.yaml, experience.gmu, experience.klu, education, publications, skills.registry, cuda.kernel, llm-forge, loss-mask.patch, regression.suite, chartx.eval, extract.svc, mcp.server, jetbot, deployed.apps, ask-naga
  - Never invent an id. If unsure, choose identity.yaml with a caption that says what you can help with.
  ```
- `AskNaga` props: `{ onNavigate(nodeId, caption), onHighlight(ids, readAsText), suggestions }`. Behavior: textarea + "Ask" + "Paste a job description" toggle. Free text → `POST /api/chat` `{ messages: [{ role: 'user', content: '/nav ' + text }] }`, read SSE (`data: {"type":"content","text":...}` lines), 8 s `AbortController` timeout; concat; `parseNav(text, NODE_IDS)`; null → `match(text, NODES)[0]` with caption `(offline) closest match: <human>`; then `onNavigate`. JD mode → `match(text, NODES, { limit: 8 })` → `onHighlight(ids, readAs(...))`, no network. Suggestions render as three buttons pre-bound to `deployed.apps`, `chartx.eval`, `experience.gmu` with fixed captions. Status text uses `aria-live="polite"`. 429 → "rate-limited upstream; using local match".
- [ ] **Step 1: Test**
```js
// tests/persona.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT } from '../api/_persona.mjs';
import { NODE_IDS } from '../lib/graph.js';
test('persona is résumé-aligned and lists every node id in navigation mode', () => {
  assert.ok(SYSTEM_PROMPT.includes('AI Systems Engineer'));
  assert.ok(SYSTEM_PROMPT.includes('Research Assistant'));
  assert.ok(SYSTEM_PROMPT.includes('nagavenkatasaichennu@gmail.com'));
  assert.ok(!SYSTEM_PROMPT.includes('nchennu@gmu.edu'));
  assert.ok(!/Salesforce|test automation/i.test(SYSTEM_PROMPT));
  assert.ok(SYSTEM_PROMPT.includes('NAVIGATION MODE'));
  for (const id of NODE_IDS) assert.ok(SYSTEM_PROMPT.includes(id), id);
});
```
- [ ] **Steps 2–5:** FAIL → implement → PASS → commit `feat(coldstart): résumé-aligned persona with navigation mode; ask-naga node`.

---

### Task 11: Demos + scheduler wiring (P1)

**Files:** Create `app/coldstart/demos/LossMask.js`, `ChartX.js`, `SchemaCheck.js`, `app/coldstart/RunLog.js`; Modify `app/coldstart/Coldstart.js` (wire `createScheduler`, `R`/`P`/`N`/`X`, camera follow, live region), `app/coldstart/Node.js` (render demo when `lod===2 && node.lod[2].demo`), `app/coldstart/Wires.js` (packet on `activeEdge`, cut affordance with `X`).

**Interfaces:**
- `LossMask({ patched })` renders `DEMO_TOKENS` as chips (`.tok[data-role][data-contributes]`), a counter `assistant tokens contributing loss: {contributing}` from `maskLoss`, an inline SVG sparkline labelled "illustrative — shape only", caption `upstream: trl==0.20.0`, and when `!patched` a `<kbd>P</kbd> apply Naga's fix` hint.
- `ChartX({ data, running })` reads `data/chartx.json` (static import); bars per `types[]` fill when `running`; treemap before/after pair; p shown as `p = {data.treemap.p}` with provenance chip `resume`, or `p = {mcnemarExact(b,c)}` with chip `computed` when `discordant` present; badge `the benchmark was the flaw, not the model`.
- `SchemaCheck()` shows `SAMPLE_OK` → PASS and `SAMPLE_BAD` → the error list, with the line "wrong outputs are unrepresentable".
- `RunLog({ state })` mono log lines: `HALTED 2/9 mask=OFF press P to fix`, `run complete 9/9, 11.4s`, plus `unevaluated` warning card text `Served an unevaluated model. This is exactly how a silent regression ships.`
- Coldstart: `useReducer` fed by `onChange`; `wait` uses `setTimeout`; reduced motion → `N` steps instead of `R`; camera `frameNode` on `state.current` unless the user dragged within 2 s; `aria-live` narration strings per spec §12; `receipt` shows in RunLog.
- [ ] **Step 1: Test** — extend `tests/ui.test.mjs`: SSR `LossMask` with `patched:false` includes `contributing loss: 60`; with `patched:true` includes `41`; SSR `ChartX` includes `97.7`. 
- [ ] **Steps 2–5:** FAIL → implement → PASS → commit `feat(coldstart): run, halt-and-patch, demos, run log`.

---

### Task 12: Routing + cleanup

**Files:** Modify `next.config.mjs` (delete the `/` rewrite entry; keep the function returning `[]`), Create `app/page.js`, Delete `public/index.html`, `public/chatbot.js`, `public/chatbot.css`; Modify `app/layout.js` (import `./coldstart/coldstart.css`? — no: import the CSS in `app/page.js` only, so `/blog` and `/admin` are unaffected).

`app/page.js`:
```js
import Coldstart from './coldstart/Coldstart.js';
import './coldstart/coldstart.css';
export const dynamic = 'force-static';
export const metadata = {
  title: 'Naga Venkata Sai Chennu — AI Systems Engineer',
  description: 'LLM systems, evals, and serving. An executable graph of my work: press R to run it.',
  alternates: { canonical: '/' },
  openGraph: { title: 'Naga Venkata Sai Chennu — AI Systems Engineer', description: 'An executable graph of my work.', url: '/', images: ['/profile.png'] },
  twitter: { card: 'summary_large_image' },
};
export default function Page() {
  return (<>
    <noscript><p>JavaScript is off. <a href="/plain">Read the plain text résumé</a>.</p></noscript>
    <Coldstart />
  </>);
}
```
- [ ] **Step 1: Test** — `tests/routing.test.mjs`: read `next.config.mjs` as text and assert it does not contain `"/index.html"`; assert `public/index.html` does not exist; assert `app/page.js` exists.
- [ ] **Steps 2–5:** FAIL → apply → PASS → commit `feat(coldstart): / becomes the graph page; remove static homepage and widget`.

---

### Task 13: CI gate + integration verification

**Files:** Create `scripts/bundle-size.mjs`; Modify `.github/workflows/ci.yml` (add `node --test tests/` before `next build`, and `node scripts/bundle-size.mjs` after).

`scripts/bundle-size.mjs`: reads `.next/app-build-manifest.json` → `pages['/page']` file list; gzips each with `node:zlib`; sums; prints a table; exits 1 if total > 250 * 1024. Also prints the per-file sizes for the PR log.

- [ ] **Step 1:** write the script; run `node --test tests/` (all green); run `npx next build` (requires `node_modules`; in CI this is automatic) then `node scripts/bundle-size.mjs`.
- [ ] **Step 2:** manual keyboard walkthrough on the Vercel preview: Tab → skip link → Résumé PDF → Contact → Plain → nodes in topological order; `R`, `P`, `Enter`, `Esc`, `/`, `?`, `0`.
- [ ] **Step 3:** commit `ci: unit tests + bundle-size gate for /`.

---

## Self-review

- Spec coverage: §3 files → Tasks 1–13; §4 model → T1; §5 rendering → T8; §6 scheduler → T2+T11; §7 demos → T6/T7/T11; §8 ask-naga → T5/T10; §9 keys → T8/T11; §10 phone → T8 CSS; §11 plain → T9; §12 a11y → T8/T11; §13 perf/CI → T13; §14 tests → each task; §15 ship → PR flow; §16 acceptance → T13.
- Names consistent: `createScheduler/getState/run/patch/step/cutEdge/edgeKey`, `zoomAt/panBy/frameNode/toHash/fromHash/lodFor`, `mcnemarExact`, `match/tokenize/readAs`, `parseNav`, `maskLoss/DEMO_TOKENS`, `validate/FILING_SCHEMA/SAMPLE_OK/SAMPLE_BAD`.
- No placeholders remain.
