/* ============================================================
   "Ask Naga" chatbot widget — vanilla JS, no dependencies.
   Streams Server-Sent Events from /api/chat. All message text is
   rendered via textContent (no innerHTML) so it is XSS-safe.
   ============================================================ */
(function () {
  "use strict";

  // The chat API only runs on Vercel. When this page is served from GitHub
  // Pages (static, no serverless), call the Vercel deployment cross-origin;
  // everywhere else the API is same-origin.
  var API_ORIGIN = "https://chennunagavenkatasai.com";
  var ENDPOINT = /(^|\.)github\.io$/.test(location.hostname)
    ? API_ORIGIN + "/api/chat"
    : "/api/chat";
  var AVATAR = "profile.png";
  var STORE_KEY = "naga-chat-history";
  var QUICK_PROMPTS = [
    "What is llm-forge?",
    "Walk me through IntelliDoc-Nexus",
    "What are your strongest skills?",
    "Are you open to roles?"
  ];
  var INTRO = "Hi, I'm Naga — ask me anything about my experience, projects, or what I'm looking for. This is an AI version of me, grounded in my real background.";

  // ---- tiny DOM helper -------------------------------------------------
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---- state -----------------------------------------------------------
  var messages = loadHistory(); // [{role, content}]
  var isStreaming = false;
  var root, panel, fab, body, input, sendBtn, introCard;

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-20) : [];
    } catch (e) { return []; }
  }
  function saveHistory() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-20))); } catch (e) {}
  }

  // ---- build UI --------------------------------------------------------
  function build() {
    root = el("div", "naga");

    // Launcher
    fab = el("button", "naga-fab");
    fab.setAttribute("aria-label", "Open chat with Naga");
    var fabImg = el("img", "naga-fab__avatar");
    fabImg.src = AVATAR; fabImg.alt = "";
    var fabLabel = el("span", "naga-fab__label", "Ask Naga");
    var fabDot = el("span", "naga-fab__dot");
    fab.appendChild(fabImg); fab.appendChild(fabLabel); fab.appendChild(fabDot);
    fab.addEventListener("click", open);

    // Panel
    panel = el("div", "naga-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat with Naga");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("inert", ""); // closed by default — keep out of tab order / AT tree

    // Header
    var head = el("div", "naga-head");
    var hAvatar = el("img", "naga-head__avatar"); hAvatar.src = AVATAR; hAvatar.alt = "Naga";
    var meta = el("div", "naga-head__meta");
    meta.appendChild(el("span", "naga-head__name", "Naga · AI"));
    meta.appendChild(el("span", "naga-head__status", "Online"));
    var close = el("button", "naga-head__close", "✕");
    close.setAttribute("aria-label", "Close chat");
    close.addEventListener("click", closePanel);
    head.appendChild(hAvatar); head.appendChild(meta); head.appendChild(close);

    // Message body — a live region so streamed replies are announced to AT.
    body = el("div", "naga-body");
    body.setAttribute("role", "log");
    body.setAttribute("aria-live", "polite");
    body.setAttribute("aria-atomic", "false");

    // Composer
    var form = el("form", "naga-form");
    input = el("textarea", "naga-input");
    input.setAttribute("rows", "1");
    input.setAttribute("placeholder", "Ask me about my work…");
    input.setAttribute("aria-label", "Message");
    input.addEventListener("input", autoGrow);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    sendBtn = el("button", "naga-send");
    sendBtn.type = "submit";
    sendBtn.setAttribute("aria-label", "Send");
    sendBtn.appendChild(arrowIcon());
    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });
    form.appendChild(input); form.appendChild(sendBtn);

    // Footer
    var foot = el("div", "naga-foot", "AI may be imperfect — verify details · powered by OpenRouter");

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(form);
    panel.appendChild(foot);

    root.appendChild(fab);
    root.appendChild(panel);
    (document.getElementById("naga-chat-root") || document.body).appendChild(root);

    renderAll();
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("is-open")) closePanel();
    });
  }

  function arrowIcon() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2.4");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    var p1 = document.createElementNS(ns, "line");
    p1.setAttribute("x1", "12"); p1.setAttribute("y1", "19"); p1.setAttribute("x2", "12"); p1.setAttribute("y2", "5");
    var p2 = document.createElementNS(ns, "polyline");
    p2.setAttribute("points", "5 12 12 5 19 12");
    svg.appendChild(p1); svg.appendChild(p2);
    return svg;
  }

  // ---- open / close ----------------------------------------------------
  function open() {
    panel.classList.add("is-open");
    panel.removeAttribute("inert");
    fab.classList.add("is-hidden");
    document.body.classList.add("naga-lock");
    setTimeout(function () { input.focus(); }, 220);
  }
  function closePanel() {
    panel.classList.remove("is-open");
    panel.setAttribute("inert", "");
    fab.classList.remove("is-hidden");
    document.body.classList.remove("naga-lock");
    fab.focus();
  }

  // ---- rendering -------------------------------------------------------
  function renderAll() {
    body.textContent = "";
    if (messages.length === 0) {
      introCard = el("div", "naga-intro");
      introCard.appendChild(el("h4", null, "Ask Naga"));
      introCard.appendChild(el("p", null, INTRO));
      body.appendChild(introCard);
      var chips = el("div", "naga-chips");
      QUICK_PROMPTS.forEach(function (q) {
        var chip = el("button", "naga-chip", q);
        chip.type = "button";
        chip.addEventListener("click", function () { input.value = q; submit(); });
        chips.appendChild(chip);
      });
      body.appendChild(chips);
    } else {
      messages.forEach(function (m) { body.appendChild(bubble(m.role, m.content)); });
    }
    scrollDown();
  }

  function bubble(role, text) {
    var div = el("div", "naga-msg " + (role === "user" ? "user" : "bot"));
    div.textContent = text;
    return div;
  }

  function scrollDown() { body.scrollTop = body.scrollHeight; }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  // ---- send + stream ---------------------------------------------------
  function submit() {
    if (isStreaming) return;
    var text = input.value.trim();
    if (!text) return;

    messages.push({ role: "user", content: text });
    saveHistory();
    input.value = ""; autoGrow();
    if (introCard) renderAll(); else body.appendChild(bubble("user", text));
    scrollDown();

    streamReply();
  }

  function streamReply() {
    isStreaming = true;
    sendBtn.disabled = true;

    // typing indicator
    var typing = el("div", "naga-msg bot");
    var dots = el("div", "naga-typing");
    dots.appendChild(el("span")); dots.appendChild(el("span")); dots.appendChild(el("span"));
    typing.appendChild(dots);
    body.appendChild(typing);
    scrollDown();

    var botEl = null;
    var acc = "";

    function fail(code) {
      if (typing.parentNode) typing.remove();
      if (!botEl) { botEl = bubble("bot", ""); botEl.classList.add("is-error"); body.appendChild(botEl); }
      else botEl.classList.add("is-error");
      botEl.textContent = code === "rate_limited"
        ? "I'm getting a lot of questions right now (free-tier rate limit) — give it a minute, or email me at nchennu@gmu.edu."
        : "Something went wrong reaching my brain just now. Please try again, or reach me at nchennu@gmu.edu.";
      finishStream();
    }

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.slice(-12) })
    }).then(function (res) {
      if (!res.ok || !res.body) { fail(res.status === 429 ? "rate_limited" : "failed"); return; }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { finalize(); return; }
          buffer += decoder.decode(r.value, { stream: true });
          var lines = buffer.split("\n");
          buffer = lines.pop();
          lines.forEach(function (line) {
            line = line.trim();
            if (line.indexOf("data:") !== 0) return;
            var payload = line.slice(5).trim();
            if (!payload) return;
            var evt;
            try { evt = JSON.parse(payload); } catch (e) { return; }
            if (evt.type === "content" && evt.text) {
              if (!botEl) { if (typing.parentNode) typing.remove(); botEl = bubble("bot", ""); body.appendChild(botEl); }
              acc += evt.text;
              botEl.textContent = acc;
              scrollDown();
            } else if (evt.type === "error") {
              fail(evt.code);
            }
          });
          return pump();
        });
      }

      function finalize() {
        if (typing.parentNode) typing.remove();
        if (acc.trim()) { messages.push({ role: "assistant", content: acc }); saveHistory(); }
        else if (!botEl) { fail("failed"); return; }
        finishStream();
      }

      return pump();
    }).catch(function () { fail("failed"); });
  }

  function finishStream() {
    isStreaming = false;
    sendBtn.disabled = false;
    scrollDown();
  }

  // ---- init ------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
