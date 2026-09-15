// lib/coldstart/scheduler.js
// Pure run state machine for the COLDSTART graph: topological order,
// run / halt / patch / step / cut. No DOM, no React, no timers of its own —
// waiting and clock reads are injected so tests can run instantly.
//
// state = {
//   run: 'idle' | 'running' | 'halted' | 'complete',
//   nodes: Record<id, 'idle'|'queued'|'running'|'done'|'failed'|'blocked'|'skipped'>,
//   patched: boolean,
//   cut: string[],
//   unevaluated: boolean,
//   current: string | null,
//   elapsedMs: number,
//   receipt: null | { nodes: number, elapsedMs: number, unevaluated: boolean }
// }

const EVAL_LANE = 'EVAL';
const SERVE_LANE = 'SERVE';

export function edgeKey(e) {
  return `${e.from}->${e.to}`;
}

function asSet(cut) {
  if (cut instanceof Set) return cut;
  return new Set(cut || []);
}

/**
 * Kahn's algorithm; ties broken by the order nodes appear in `graph.nodes`.
 * Edges whose key is in `cut` are ignored. Always returns every node id.
 */
export function topoOrder(graph, cut = new Set()) {
  const cutSet = asSet(cut);
  const ids = graph.nodes.map((n) => n.id);
  const known = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));

  for (const e of graph.edges) {
    if (cutSet.has(edgeKey(e))) continue;
    if (!known.has(e.from) || !known.has(e.to)) continue;
    out.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }

  const order = [];
  const taken = new Set();
  while (order.length < ids.length) {
    // Earliest node in graph order whose remaining in-degree is zero.
    const next = ids.find((id) => !taken.has(id) && indeg.get(id) === 0);
    if (next === undefined) {
      // Cycle (the graph test forbids this) — append the remainder in graph order.
      for (const id of ids) if (!taken.has(id)) { taken.add(id); order.push(id); }
      break;
    }
    taken.add(next);
    order.push(next);
    for (const to of out.get(next)) indeg.set(to, indeg.get(to) - 1);
  }
  return order;
}

/**
 * True when no EVAL-lane node can still reach a SERVE-lane node over uncut edges:
 * the serving side of the run was never evaluated.
 */
function computeUnevaluated(graph, cut) {
  const cutSet = asSet(cut);
  const laneOf = new Map(graph.nodes.map((n) => [n.id, n.lane]));
  const out = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    if (cutSet.has(edgeKey(e))) continue;
    if (!out.has(e.from) || !laneOf.has(e.to)) continue;
    out.get(e.from).push(e.to);
  }
  const seen = new Set();
  const queue = graph.nodes.filter((n) => n.lane === EVAL_LANE).map((n) => n.id);
  for (const id of queue) seen.add(id);
  while (queue.length) {
    const id = queue.shift();
    if (laneOf.get(id) === SERVE_LANE) return false;
    for (const to of out.get(id) || []) {
      if (seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return true;
}

export function createScheduler(graph, {
  onChange = () => {},
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
} = {}) {
  const ids = graph.nodes.map((n) => n.id);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  let runState = 'idle';
  let nodeStates = Object.fromEntries(ids.map((id) => [id, 'idle']));
  let patched = false;
  let cut = new Set();
  let unevaluated = computeUnevaluated(graph, cut);
  let current = null;
  let elapsedMs = 0;
  let receipt = null;
  let order = [];
  let cursor = 0;
  let startedAt = 0;
  let walking = false;

  function getState() {
    return {
      run: runState,
      nodes: { ...nodeStates },
      patched,
      cut: [...cut],
      unevaluated,
      current,
      elapsedMs,
      receipt: receipt ? { ...receipt } : null,
    };
  }

  function emit() {
    onChange(getState());
  }

  function tick() {
    elapsedMs = Math.max(0, now() - startedAt);
  }

  function beginRun() {
    order = topoOrder(graph, cut);
    cursor = 0;
    nodeStates = Object.fromEntries(ids.map((id) => [id, 'queued']));
    // A replay is a replay: the halt at loss-mask.patch is the point of the page,
    // and leaving `patched` set meant it could only ever be seen once per load.
    patched = false;
    runState = 'running';
    current = null;
    receipt = null;
    startedAt = now();
    elapsedMs = 0;
  }

  function finish() {
    runState = 'complete';
    current = null;
    tick();
    receipt = {
      nodes: order.filter((id) => nodeStates[id] === 'done').length,
      elapsedMs,
      unevaluated,
    };
  }

  /** One node transition: queued -> running (returns the node so callers may wait). */
  function enter() {
    const id = order[cursor];
    nodeStates[id] = 'running';
    current = id;
    tick();
    emit();
    return byId.get(id);
  }

  /** running -> done, or failed + halted when the node halts and no patch was applied. */
  function leave() {
    const id = order[cursor];
    const node = byId.get(id);
    if (node.run.halts && !patched) {
      nodeStates[id] = 'failed';
      runState = 'halted';
      current = id;
      tick();
      emit();
      return false;
    }
    nodeStates[id] = 'done';
    cursor += 1;
    tick();
    emit();
    return true;
  }

  async function walk() {
    if (walking) return;
    walking = true;
    try {
      while (cursor < order.length) {
        const node = enter();
        await wait(node.run.durationMs);
        if (!leave()) return;
      }
      finish();
      emit();
    } finally {
      walking = false;
    }
  }

  async function run() {
    if (runState === 'running') return;
    beginRun();
    emit();
    await walk();
  }

  async function patch() {
    if (runState !== 'halted') return;
    patched = true;
    const id = order[cursor];
    if (nodeStates[id] === 'failed') {
      nodeStates[id] = 'done';
      cursor += 1;
    }
    runState = 'running';
    current = null;
    tick();
    emit();
    if (cursor >= order.length) {
      finish();
      emit();
      return;
    }
    await walk();
  }

  /** Exactly one node transition, never waits — the reduced-motion stepper. */
  async function step() {
    if (runState === 'complete' || runState === 'halted' || walking) return;
    if (runState === 'idle') {
      beginRun();
      emit();
    }
    if (cursor >= order.length) {
      finish();
      emit();
      return;
    }
    enter();
    if (!leave()) return;
    if (cursor >= order.length) {
      finish();
      emit();
    }
  }

  function cutEdge(key) {
    if (cut.has(key)) return;
    cut.add(key);
    unevaluated = computeUnevaluated(graph, cut);
    emit();
  }

  function restoreEdge(key) {
    if (!cut.has(key)) return;
    cut.delete(key);
    unevaluated = computeUnevaluated(graph, cut);
    emit();
  }

  function reset() {
    runState = 'idle';
    nodeStates = Object.fromEntries(ids.map((id) => [id, 'idle']));
    patched = false;
    cut = new Set();
    unevaluated = computeUnevaluated(graph, cut);
    current = null;
    elapsedMs = 0;
    receipt = null;
    order = [];
    cursor = 0;
    startedAt = 0;
    emit();
  }

  return { getState, run, patch, step, cutEdge, restoreEdge, reset };
}
