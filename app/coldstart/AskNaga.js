'use client';

// app/coldstart/AskNaga.js
// The body of the `ask-naga` node (spec §8).
//
// Two modes, one textarea:
//   ask  — POSTs "/nav <text>" to /api/chat, reads the SSE stream, and parses the
//          reply with the enum-guarded parser. Anything the guard rejects (prose,
//          an invented id, a timeout, a 429, a network error) falls back to the
//          local deterministic matcher, and the caption says so out loud.
//   jd   — paste a job description: local matcher only, no network at all.
//
// The caption is always rendered as text, never as markup.
//
// createElement rather than JSX, like every sibling in this directory, so
// `node --test` can server-render the stage this node is mounted in.

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react';
import { NODES, NODE_IDS, nodeById } from '../../lib/graph.js';
import { parseNav } from '../../lib/coldstart/nav.js';
import { match, readAs, tokenize } from '../../lib/coldstart/match.js';

/** Hard ceiling on the round trip; after this the local matcher answers. */
const TIMEOUT_MS = 8000;

/** Stable id so the `/` shortcut in Coldstart can focus the input. */
export const ASK_INPUT_ID = 'ask-naga-input';

/**
 * Three pre-bound prompts (spec §8). No network: each jumps straight to a node
 * with a fixed caption drawn from the résumé facts already on that node.
 */
export const DEFAULT_SUGGESTIONS = [
  {
    label: 'What has he shipped?',
    node: 'deployed.apps',
    caption: 'Eight live apps, each one deployed and linked.',
  },
  {
    label: 'Can he do evals?',
    node: 'chartx.eval',
    caption: '6,000 ChartX images, 18 chart types, McNemar p = 0.0003.',
  },
  {
    label: 'Where has he worked?',
    node: 'experience.gmu',
    caption: 'AI Systems Engineer, George Mason University, Aug 2025 - May 2026.',
  },
];

/**
 * Pull `{ type: 'content', text }` chunks out of an SSE response body and
 * concatenate their text. Ignores `done` and surfaces `error` codes.
 * @param {Response} response
 * @returns {Promise<{ text: string, errorCode: string|null }>}
 */
async function readSseText(response) {
  let text = '';
  let errorCode = null;
  if (!response.body || typeof response.body.getReader !== 'function') {
    return { text, errorCode };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line.
    let split = buffer.indexOf('\n\n');
    while (split !== -1) {
      const event = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk && chunk.type === 'content' && typeof chunk.text === 'string') text += chunk.text;
        else if (chunk && chunk.type === 'error') errorCode = chunk.code || 'failed';
      }
      split = buffer.indexOf('\n\n');
    }
  }
  return { text, errorCode };
}

/**
 * The ask-naga node body.
 * @param {{
 *   onNavigate?: (nodeId: string, caption: string) => void,
 *   onHighlight?: (ids: string[], readAsText: string) => void,
 *   suggestions?: Array<{ label: string, node: string, caption: string }>,
 * }} props
 */
export default function AskNaga({
  onNavigate = () => {},
  onHighlight = () => {},
  suggestions = DEFAULT_SUGGESTIONS,
}) {
  const [text, setText] = useState('');
  const [jdMode, setJdMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const abortRef = useRef(null);
  const aliveRef = useRef(true);

  // Never leave a request (or a state update) running after unmount.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const say = useCallback((message) => {
    if (aliveRef.current) setStatus(message);
  }, []);

  /** Deterministic fallback: rank the nodes locally and jump to the best one. */
  const localNavigate = useCallback(
    (query, prefix) => {
      const best = match(query, NODES)[0];
      if (!best) {
        say('no match here. Email nagavenkatasaichennu@gmail.com and ask me directly.');
        return;
      }
      const node = nodeById(best.id);
      const caption = `(offline) closest match: ${node ? node.human : best.id}`;
      say(prefix ? `${prefix} ${caption}` : caption);
      onNavigate(best.id, caption);
    },
    [onNavigate, say],
  );

  /** Job-description mode: light the matching subgraph, no network. */
  const runJd = useCallback(
    (query) => {
      const result = match(query, NODES, { limit: 8 });
      const line = readAs(result, tokenize(query));
      onHighlight(result.map((r) => r.id), line);
      say(line);
    },
    [onHighlight, say],
  );

  /** Ask mode: /nav round trip with an 8 s ceiling, guarded by parseNav. */
  const runAsk = useCallback(
    async (query) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setBusy(true);
      say('asking...');
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: `/nav ${query}` }] }),
          signal: controller.signal,
        });
        if (response.status === 429) {
          localNavigate(query, 'rate-limited upstream; using local match.');
          return;
        }
        if (!response.ok) {
          localNavigate(query, 'upstream unavailable; using local match.');
          return;
        }
        const { text: reply, errorCode } = await readSseText(response);
        if (errorCode === 'rate_limited') {
          localNavigate(query, 'rate-limited upstream; using local match.');
          return;
        }
        const nav = parseNav(reply, NODE_IDS);
        if (!nav) {
          localNavigate(query, errorCode ? 'upstream failed; using local match.' : '');
          return;
        }
        say(nav.caption);
        onNavigate(nav.node, nav.caption);
      } catch (err) {
        const aborted = err && err.name === 'AbortError';
        // A deliberate abort from unmount should not navigate anywhere.
        if (aborted && !aliveRef.current) return;
        localNavigate(query, aborted ? 'timed out after 8s; using local match.' : 'network error; using local match.');
      } finally {
        clearTimeout(timer);
        if (abortRef.current === controller) abortRef.current = null;
        if (aliveRef.current) setBusy(false);
      }
    },
    [localNavigate, onNavigate, say],
  );

  const submit = useCallback(
    (event) => {
      if (event) event.preventDefault();
      const query = text.trim();
      if (!query) {
        say('type a question, or paste a job description.');
        return;
      }
      if (jdMode) runJd(query);
      else runAsk(query);
    },
    [jdMode, runAsk, runJd, say, text],
  );

  const onKeyDown = useCallback(
    (event) => {
      // Enter submits; Shift+Enter keeps the newline. Escape hands focus back
      // to the stage without the keystroke reaching the global shortcut map.
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit(null);
      }
      event.stopPropagation();
    },
    [submit],
  );

  const toggleMode = useCallback(() => {
    setJdMode((v) => !v);
    say(jdMode ? 'ask mode.' : 'job-description mode: matched locally, nothing leaves the page.');
  }, [jdMode, say]);

  return h('div', { className: 'ask' }, [
    h('form', { key: 'form', className: 'ask-form', onSubmit: submit }, [
      h('label', { key: 'label', className: 'ask-label', htmlFor: ASK_INPUT_ID },
        jdMode ? 'Paste a job description' : 'Ask about my work'),

      h('textarea', {
        key: 'input',
        id: ASK_INPUT_ID,
        className: 'ask-input',
        rows: jdMode ? 4 : 2,
        value: text,
        placeholder: jdMode
          ? 'Paste the requirements; I match them locally.'
          : 'e.g. how do you catch regressions?',
        onChange: (e) => setText(e.target.value),
        onKeyDown,
      }),

      h('div', { key: 'actions', className: 'ask-actions' }, [
        h('button', { key: 'go', className: 'ask-go', type: 'submit', disabled: busy },
          jdMode ? 'Match' : 'Ask'),
        h('button', {
          key: 'mode',
          className: 'ask-mode',
          type: 'button',
          'aria-pressed': jdMode,
          onClick: toggleMode,
        }, 'Paste a job description'),
      ]),
    ]),

    h('ul', { key: 'suggestions', className: 'ask-suggestions' }, suggestions.map((s) =>
      h('li', { key: s.node }, h('button', {
        className: 'ask-suggestion',
        type: 'button',
        onClick: () => {
          say(s.caption);
          onNavigate(s.node, s.caption);
        },
      }, s.label)))),

    h('p', { key: 'status', className: 'ask-status', 'aria-live': 'polite' }, status),
  ]);
}
