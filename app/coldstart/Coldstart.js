'use client';
// app/coldstart/Coldstart.js — the island root.
//
// Owns the camera, which card is open, the phone lane selection, the two sheets, the
// hash — and, since Task 11, the run itself. Movement is camera and keyboard only:
// the page itself never scrolls.
//
// The scheduler in lib/coldstart/scheduler.js is pure and knows nothing about React;
// this file is the only place the two meet. `onChange` pushes a fresh state object
// straight into a reducer, so the whole stage is a function of one value, and the
// only things injected back into the scheduler are a clock (`wait`) and the keys
// R / P / N / X.
//
// The props are seams, not configuration: they seed the first render so the stage can
// be server-rendered in any state, and the live scheduler takes over on hydration.
//
// createElement rather than JSX, so `node --test` can server-render this tree.

import { createElement as h, Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { GRAPH, NODES, NODE_IDS, nodeById } from '../../lib/graph.js';
import { fromHash, toHash, lodFor, panBy, zoomAt, frameNode } from '../../lib/coldstart/camera.js';
import { createScheduler, edgeKey } from '../../lib/coldstart/scheduler.js';
import Stage, { EscapePill, IdentityLine, LiveRegion, ContactSheet, HelpSheet } from './Stage.js';
import RunLog from './RunLog.js';
import Node from './Node.js';
import Wires from './Wires.js';
import DotGrid from './DotGrid.js';
import AskNaga, { ASK_INPUT_ID } from './AskNaga.js';

const PAN_STEP = 80;
const HASH_MS = 150;
const DRAG_SLOP = 4;
const SWIPE_MIN = 60;
/** How long a drag owns the camera before the running node may take it back. */
const FOLLOW_GRACE_MS = 2000;
const PHONE = '(max-width: 639px)';
const REDUCED = '(prefers-reduced-motion: reduce)';
const IGNORE_DRAG = '.escape, .sheet, .lanes, .node[data-expanded="true"], a, button, input, textarea, select';

const IDLE_RUN = {
  run: 'idle',
  nodes: {},
  patched: false,
  cut: [],
  unevaluated: false,
  current: null,
  elapsedMs: 0,
  receipt: null,
};

/** The reducer is a socket: the scheduler already hands over a finished state. */
function runReducer(_prev, next) {
  return next;
}

/** First render comes from the props, so any run state can be server-rendered. */
function seedRun({ runState, nodeStates, cut, runLogState }) {
  return {
    ...IDLE_RUN,
    run: runState || 'idle',
    nodes: nodeStates || {},
    cut: cut || [],
    ...(runLogState || {}),
  };
}

const CONTACT_LINKS = nodeById('identity.yaml').links;

// A column heading per lane, printed above the first card in that column.
const LANE_HEADS = GRAPH.lanes.map((lane) => {
  const inLane = NODES.filter((n) => n.lane === lane);
  return {
    lane,
    x: Math.min(...inLane.map((n) => n.pos.x)),
    y: Math.min(...inLane.map((n) => n.pos.y)) - 34,
    w: Math.max(...inLane.map((n) => n.size.w)),
  };
});

function defaultCam() {
  const d = fromHash('');
  return { x: d.x, y: d.y, s: d.s };
}

export default function Coldstart({
  runState = 'idle',
  nodeStates = null,
  activeEdge = null,
  cut = null,
  runLogState = null,
  liveMessage = '',
  demos = null,
  onRunKey = null,
}) {
  const [cam, setCam] = useState(defaultCam);
  const [expanded, setExpanded] = useState(null);
  const [activeLane, setActiveLane] = useState(GRAPH.lanes[0]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focusedEdge, setFocusedEdge] = useState(null);
  const [notice, setNotice] = useState('');
  // The subgraph a pasted job description lit up; null means "no filter".
  const [highlight, setHighlight] = useState(null);
  const [reduced, setReduced] = useState(false);
  const [run, dispatchRun] = useReducer(
    runReducer,
    { runState, nodeStates, cut, runLogState },
    seedRun,
  );

  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const wiresRef = useRef(null);
  const camRef = useRef(cam);
  const expandedRef = useRef(expanded);
  const runKeyRef = useRef(null);
  const helpOpenRef = useRef(false);
  const phoneRef = useRef(false);
  const reducedRef = useRef(false);
  const movedRef = useRef(false);
  const keyNavRef = useRef(false);
  const hydratedRef = useRef(false);
  const hashAt = useRef(0);
  const hashTimer = useRef(null);
  const schedulerRef = useRef(null);
  const focusedEdgeRef = useRef(null);
  const dragAtRef = useRef(0);
  const runStateRef = useRef(run.run);
  /** Under reduced motion the visitor is the clock: this holds the pending tick. */
  const pendingTickRef = useRef(null);

  useEffect(() => { camRef.current = cam; }, [cam]);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);
  useEffect(() => { runStateRef.current = run.run; }, [run.run]);
  useEffect(() => { helpOpenRef.current = helpOpen; }, [helpOpen]);
  useEffect(() => { focusedEdgeRef.current = focusedEdge; }, [focusedEdge]);

  const lod = lodFor(cam.s);
  const cutList = run.cut;
  const nodeState = useCallback((id) => run.nodes[id] || 'idle', [run]);

  const laneStates = useMemo(() => {
    const out = {};
    for (const lane of GRAPH.lanes) {
      const seen = NODES.filter((n) => n.lane === lane).map((n) => run.nodes[n.id] || 'idle');
      out[lane] = seen.includes('failed') ? 'failed'
        : seen.includes('running') ? 'running'
          : seen.every((s) => s === 'done') ? 'done'
            : 'idle';
    }
    return out;
  }, [run]);

  /* ------------------------------------------------------------- the scheduler */

  /** Release a run that is parked on the reduced-motion stepper. */
  const releaseTick = useCallback(() => {
    const resolve = pendingTickRef.current;
    if (!resolve) return false;
    pendingTickRef.current = null;
    resolve();
    return true;
  }, []);

  // One scheduler for the life of the island. `wait` is the only clock it has, so
  // reduced motion replaces the timer with the N key: the walk parks on every node
  // until the visitor releases it, which is the stepper spec §12 asks for.
  //
  // The cleanup owns the clock it handed out: the pending timeout is cleared and
  // any parked walk is released, so no timer chain outlives the island.
  useEffect(() => {
    let timer = null;
    let dead = false;
    const scheduler = createScheduler(GRAPH, {
      onChange: dispatchRun,
      wait: (ms) => new Promise((resolve) => {
        if (dead) { resolve(); return; }
        if (reducedRef.current) { pendingTickRef.current = resolve; return; }
        timer = setTimeout(resolve, ms);
      }),
    });
    schedulerRef.current = scheduler;
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      releaseTick();
      schedulerRef.current = null;
    };
  }, [releaseTick]);

  /**
   * The wire X acts on: whichever one was last clicked, else the first still-connected
   * edge into the focused card. Every node past the DATA lane has one, so a keyboard
   * user always has something to cut.
   */
  const cutTarget = useCallback((state) => {
    const focused = focusedEdgeRef.current;
    if (focused) return focused;
    const id = expandedRef.current;
    if (!id) return null;
    const incoming = GRAPH.edges.filter((e) => e.to === id).map(edgeKey);
    return incoming.find((key) => !state.cut.includes(key)) || incoming[0] || null;
  }, []);

  const toggleCut = useCallback((key) => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    const state = scheduler.getState();
    const target = key || cutTarget(state);
    if (!target) {
      setNotice('No wire is selected. Open a node, or click a wire, then press X.');
      return;
    }
    setFocusedEdge(target);
    if (state.cut.includes(target)) {
      scheduler.restoreEdge(target);
      setNotice(`Reconnected ${target}.`);
      return;
    }
    scheduler.cutEdge(target);
    const after = scheduler.getState();
    setNotice(after.unevaluated
      ? `Cut ${target}. Nothing evaluated reaches the serving lane any more.`
      : `Cut ${target}.`);
  }, [cutTarget]);

  const handleRunKey = useCallback((key) => {
    const scheduler = schedulerRef.current;
    if (!scheduler) return;
    setNotice('');
    switch (key) {
      case 'R':
        // Under reduced motion the same walk runs, but it parks on every node
        // waiting for N — a run that animates itself is the thing the visitor
        // asked not to happen. R after a finished run replays it from the top,
        // halt included.
        scheduler.run();
        return;
      case 'P':
        scheduler.patch();
        return;
      case 'N':
        // If a walk is parked on the stepper, N releases the next node; otherwise
        // it advances a run that has not started walking.
        if (releaseTick()) return;
        scheduler.step();
        return;
      case 'X':
        toggleCut(null);
        return;
      default:
    }
  }, [releaseTick, toggleCut]);

  useEffect(() => { runKeyRef.current = onRunKey || handleRunKey; }, [onRunKey, handleRunKey]);

  /* ------------------------------------------------------------------ helpers */

  /**
   * Move the camera without going through React.
   *
   * A pointermove or a wheel tick used to call setCam, which re-rendered the
   * island — rebuilding sixteen card elements, the lane heads and three memos —
   * once per frame, for a change that is one composited transform. During a
   * gesture the camera is written straight to the two layers that carry it and
   * kept in camRef; React is told once, when the gesture settles. This is what
   * worldRef was always for.
   */
  const applyCam = useCallback((next) => {
    camRef.current = next;
    const transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.s})`;
    if (worldRef.current) {
      worldRef.current.style.transform = transform;
      // LOD is a CSS switch on #world, so it can cross its threshold mid-gesture
      // without a render either.
      worldRef.current.dataset.lod = String(lodFor(next.s));
    }
    if (wiresRef.current) wiresRef.current.style.transform = transform;
  }, []);

  const viewport = useCallback(() => {
    const el = stageRef.current;
    if (!el) return { w: 1280, h: 800 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }, []);

  const focusNode = useCallback((id) => {
    const node = nodeById(id);
    if (!node) return;
    keyNavRef.current = true;
    if (!phoneRef.current) setCam((c) => frameNode(c, node, viewport(), c.s));
    const el = document.getElementById(`node-${id}`);
    if (el) el.focus({ preventScroll: phoneRef.current === false });
  }, [viewport]);

  const toggleNode = useCallback((id) => {
    if (movedRef.current) return;
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  // Focus moves the camera only when focus arrived from the keyboard; a click should
  // open the card you aimed at, not relocate the sheet under your cursor.
  const onNodeFocus = useCallback((id) => {
    const node = nodeById(id);
    if (!node) return;
    setActiveLane(node.lane);
    // Focusing a card also aims X at the wire that feeds it.
    const incoming = GRAPH.edges.filter((e) => e.to === id).map(edgeKey);
    setFocusedEdge(incoming[0] || null);
    if (!keyNavRef.current || phoneRef.current) return;
    setCam((c) => frameNode(c, node, viewport(), c.s));
  }, [viewport]);

  /* ------------------------------------------------- phone and reduced motion */

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(PHONE);
    const sync = () => { phoneRef.current = mq.matches; };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(REDUCED);
    const sync = () => {
      reducedRef.current = mq.matches;
      setReduced(mq.matches);
      // Turning motion back on must not strand a walk parked on the stepper.
      if (!mq.matches) releaseTick();
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [releaseTick]);

  /* ------------------------------------------------------------ camera follow */

  // The running node pulls the camera, unless the visitor moved it themselves in the
  // last two seconds — then it is theirs, and the run happens where they left it.
  const current = run.current;
  useEffect(() => {
    if (!current) return;
    const node = nodeById(current);
    if (!node) return;
    setActiveLane(node.lane);
    if (Date.now() - dragAtRef.current < FOLLOW_GRACE_MS) return;
    if (phoneRef.current) return;
    setCam((c) => frameNode(c, node, viewport(), c.s));
  }, [current, viewport]);

  // Phone follow is a separate effect keyed on the lane as well as the node,
  // because the lane switch above only reaches the DOM on the next commit — until
  // it does, the incoming card is still display:none and scrollIntoView is a
  // no-op. That is exactly the three lane transitions of a run, the halt included.
  useEffect(() => {
    if (!current || !phoneRef.current) return;
    if (Date.now() - dragAtRef.current < FOLLOW_GRACE_MS) return;
    const el = document.getElementById(`node-${current}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: reducedRef.current ? 'auto' : 'smooth' });
    }
  }, [current, activeLane]);

  /* ------------------------------------------- restore the camera from the hash */

  useEffect(() => {
    const parsed = fromHash(window.location.hash);
    setCam({ x: parsed.x, y: parsed.y, s: parsed.s });
    if (parsed.n && NODE_IDS.includes(parsed.n)) {
      setExpanded(parsed.n);
      const node = nodeById(parsed.n);
      if (node) setActiveLane(node.lane);
    }
    hydratedRef.current = true;
  }, []);

  /* --------------------------------------------------- write the hash, max 150ms */

  useEffect(() => {
    if (!hydratedRef.current) return undefined;
    const write = () => {
      hashAt.current = Date.now();
      hashTimer.current = null;
      // Every value here is read through a ref, because `write` may run up to
      // 150 ms after the effect that scheduled it — a run state read from the
      // render closure would be the one the run had already left.
      const hash = toHash(camRef.current, {
        n: expandedRef.current,
        run: runStateRef.current === 'idle' ? null : runStateRef.current,
      });
      try {
        window.history.replaceState(null, '', hash);
      } catch {
        /* replaceState can be refused (sandboxed frames); the stage still works. */
      }
    };
    const due = HASH_MS - (Date.now() - hashAt.current);
    if (due <= 0) write();
    else if (!hashTimer.current) hashTimer.current = setTimeout(write, due);
    return undefined;
  }, [cam, expanded, run.run]);

  useEffect(() => () => {
    if (hashTimer.current) clearTimeout(hashTimer.current);
  }, []);

  /* -------------------------------------------------------- pointer: pan, zoom */

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const pointers = new Map();
    let drag = null;
    let pinch = null;
    let wheelTimer = null;

    const local = (e) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    /** Hand the camera back to React once the gesture has settled. */
    function settle() {
      setDragging(false);
      setCam(camRef.current);
    }

    function onWheel(e) {
      if (phoneRef.current) return;
      // An open card scrolls its own overflow; the camera stays put.
      if (e.target.closest && e.target.closest('.node[data-expanded="true"]')) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const pt = local(e);
      dragAtRef.current = Date.now();
      // The drag flag covers the wheel too. Without it each tick started a fresh
      // 300ms eased transition from wherever the last one had reached, so the
      // point under the cursor — which camera.js anchors exactly — visibly slid.
      setDragging(true);
      applyCam(zoomAt(camRef.current, pt, Math.exp(-dy * 0.0015)));
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(settle, 120);
    }

    function onDown(e) {
      if (e.target.closest && e.target.closest(IGNORE_DRAG)) return;
      pointers.set(e.pointerId, local(e));
      movedRef.current = false;
      keyNavRef.current = false;
      if (pointers.size === 1) {
        const p = pointers.get(e.pointerId);
        drag = { id: e.pointerId, x: p.x, y: p.y, cam: camRef.current, dx: 0, dy: 0 };
        pinch = null;
      } else if (pointers.size === 2 && !phoneRef.current) {
        const [a, b] = [...pointers.values()];
        pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          cam: camRef.current,
        };
        drag = null;
      }
    }

    function onMove(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, local(e));

      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        movedRef.current = true;
        dragAtRef.current = Date.now();
        setDragging(true);
        applyCam(zoomAt(pinch.cam, pinch.mid, dist / pinch.dist));
        return;
      }

      if (!drag || drag.id !== e.pointerId) return;
      const p = pointers.get(e.pointerId);
      drag.dx = p.x - drag.x;
      drag.dy = p.y - drag.y;
      if (Math.hypot(drag.dx, drag.dy) > DRAG_SLOP) {
        movedRef.current = true;
        dragAtRef.current = Date.now();
        setDragging(true);
      }
      if (phoneRef.current) return;
      applyCam(panBy(drag.cam, drag.dx, drag.dy));
    }

    function onUp(e) {
      const ended = drag && drag.id === e.pointerId ? drag : null;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;

      if (ended) {
        // Phone: a horizontal flick changes lane, since there is no camera to move.
        if (phoneRef.current && Math.abs(ended.dx) > SWIPE_MIN && Math.abs(ended.dy) < 40) {
          const dir = ended.dx < 0 ? 1 : -1;
          setActiveLane((lane) => {
            const i = GRAPH.lanes.indexOf(lane);
            return GRAPH.lanes[Math.min(GRAPH.lanes.length - 1, Math.max(0, i + dir))];
          });
        }
        drag = null;
      }

      if (pointers.size === 0) {
        if (movedRef.current) dragAtRef.current = Date.now();
        // One React commit for the whole gesture, instead of one per frame.
        settle();
        // Let the click that follows this pointerup read the drag flag first.
        setTimeout(() => { movedRef.current = false; }, 0);
      }
    }

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      if (wheelTimer) clearTimeout(wheelTimer);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [applyCam]);

  /* ------------------------------------------------------------- keyboard map */

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Tab' || e.key.indexOf('Arrow') === 0) keyNavRef.current = true;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const t = e.target;
      const tag = t && t.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
      const inSheet = !!document.querySelector('dialog[open]');

      if (e.key === 'Escape') {
        if (inSheet) return; // the <dialog> closes itself and reports back
        if (!expandedRef.current) return;
        e.preventDefault();
        const id = expandedRef.current;
        setExpanded(null);
        const el = document.getElementById(`node-${id}`);
        if (el) el.focus({ preventScroll: true });
        return;
      }

      // "?" is a toggle, so it has to work while the help sheet itself is open.
      if (e.key === '?' && !typing && (!inSheet || helpOpenRef.current)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (typing || inSheet) return;

      switch (e.key) {
        case '0':
          e.preventDefault();
          setCam(defaultCam());
          return;
        case '/':
          // Spec §9: "/" focuses ask-naga. Focusing the card is not focusing the
          // input, so open the card, let it commit, then land in the textarea.
          e.preventDefault();
          setExpanded('ask-naga');
          focusNode('ask-naga');
          requestAnimationFrame(() => {
            const input = document.getElementById(ASK_INPUT_ID);
            if (input) input.focus();
          });
          return;
        case 'r': case 'R':
        case 'p': case 'P':
        case 'n': case 'N':
        case 'x': case 'X':
          // R run · P patch · N step · X cut. Nothing happens before hydration, which
          // is honest: there is no scheduler to drive yet.
          if (runKeyRef.current) {
            e.preventDefault();
            runKeyRef.current(e.key.toUpperCase());
          }
          return;
        default:
          break;
      }

      // The arrows pan unless the focused card is scrolling its own overflow.
      // Gating on `activeElement === body` looked right but meant the documented
      // key stopped working for a keyboard user the moment they pressed Tab once.
      if (phoneRef.current) return;
      if (t && t.closest && t.closest('.node[data-expanded="true"]')) return;

      const pan = {
        ArrowLeft: [PAN_STEP, 0],
        ArrowRight: [-PAN_STEP, 0],
        ArrowUp: [0, PAN_STEP],
        ArrowDown: [0, -PAN_STEP],
      }[e.key];
      if (!pan) return;
      e.preventDefault();
      setCam((c) => panBy(c, pan[0], pan[1]));
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusNode]);

  /* -------------------------------------------------------------------- render */

  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeContact = useCallback(() => setContactOpen(false), []);
  const openContact = useCallback(() => setContactOpen(true), []);

  // Which wire carries the packet: the edge into the running node, preferring one
  // whose source has already finished, so the dot travels a wire that just delivered.
  const computedEdge = useMemo(() => {
    if (run.run !== 'running' || !run.current) return null;
    const isCut = new Set(run.cut);
    const incoming = GRAPH.edges.filter((e) => e.to === run.current && !isCut.has(edgeKey(e)));
    if (!incoming.length) return null;
    const delivered = incoming.find((e) => run.nodes[e.from] === 'done');
    return edgeKey(delivered || incoming[0]);
  }, [run]);

  // Narration, spec §12. One sentence per transition, never the whole log.
  const narration = useMemo(() => {
    if (run.run === 'running' && run.current) return `Running ${run.current}…`;
    if (run.run === 'halted' && run.current) {
      return `Halted at ${run.current}: assistant-only loss masking is off. Press P to apply the fix.`;
    }
    if (run.run === 'complete') {
      const counted = run.receipt ? run.receipt.nodes : 0;
      return run.unevaluated
        ? `Run complete, ${counted} nodes. Served an unevaluated model.`
        : `Run complete, ${counted} nodes.`;
    }
    return '';
  }, [run]);

  // ask-naga's body is the one demo the graph cannot name in lib/graph.js: it
  // needs to reach back into the camera. It is built here and handed to the card
  // through the same `demo` slot the `demos` prop uses, so a caller may still
  // override it for a test or a server-rendered state.
  const askNavigate = useCallback((id, caption) => {
    setHighlight(null);
    setExpanded(id);
    focusNode(id);
    setNotice(caption || '');
  }, [focusNode]);

  const askHighlight = useCallback((ids, line) => {
    setHighlight(ids && ids.length ? new Set(ids) : null);
    setNotice(line || '');
  }, []);

  const builtInDemos = useMemo(() => ({
    'ask-naga': h(AskNaga, { onNavigate: askNavigate, onHighlight: askHighlight }),
  }), [askNavigate, askHighlight]);

  const cards = NODES.map((node, i) => h(Node, {
    key: node.id,
    node,
    index: i,
    state: nodeState(node.id),
    expanded: expanded === node.id,
    lod,
    patched: run.patched,
    running: run.nodes[node.id] === 'running',
    dimmed: highlight ? !highlight.has(node.id) : false,
    demo: (demos && demos[node.id]) || builtInDemos[node.id] || null,
    onToggle: toggleNode,
    onFocus: onNodeFocus,
  }));

  const heads = LANE_HEADS.map((head) => h('div', {
    key: head.lane,
    className: 'lane-head',
    'aria-hidden': 'true',
    style: { '--x': `${head.x}px`, '--y': `${head.y}px`, '--w': `${head.w}px` },
  }, head.lane));

  return h(Stage, {
    cam,
    lod,
    dragging,
    stageRef,
    worldRef,
    wiresRef,
    lanes: GRAPH.lanes,
    activeLane,
    laneStates,
    onSelectLane: setActiveLane,
    escape: h(EscapePill, { onContact: openContact }),
    identity: h(IdentityLine, { reduced }),
    runLog: h(RunLog, { state: run }),
    live: h(LiveRegion, { message: liveMessage || notice || narration }),
    // The drift runs during a run only. Repainting the full viewport at DPR 2
    // while the camera is being dragged competed for exactly the frames that had
    // to stay smooth, and the camera no longer renders through React anyway.
    background: h(DotGrid, { active: run.run === 'running' }),
    wires: h(Wires, {
      graph: GRAPH,
      cut: cutList,
      activeEdge: activeEdge || computedEdge,
      focusedEdge,
      nodeStates: run.nodes,
      onCut: toggleCut,
    }),
    dialogs: h(Fragment, null, [
      h(ContactSheet, { key: 'contact', open: contactOpen, links: CONTACT_LINKS, onClose: closeContact }),
      h(HelpSheet, { key: 'help', open: helpOpen, reduced, onClose: closeHelp }),
    ]),
  }, [...heads, ...cards]);
}
