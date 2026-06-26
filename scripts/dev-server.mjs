// ============================================================
// Local dev server — serves the static portfolio AND the /api/chat
// endpoint, reusing the SAME streamChat() logic the Vercel edge
// function uses. Zero dependencies (Node 18+).
//
//   1. cp .env.local.example .env.local  (add your OPENROUTER_API_KEY)
//   2. node scripts/dev-server.mjs
//   3. open http://localhost:5050
// ============================================================

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { streamChat } from "../api/_llm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = process.env.PORT || 5050;

// --- load .env.local (simple KEY=VALUE parser, no deps) ---
async function loadEnv() {
  try {
    const txt = await readFile(join(ROOT, ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* no .env.local — rely on real env */ }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".JPG": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".pdf": "application/pdf", ".ico": "image/x-icon",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error("body too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "server_not_configured (add OPENROUTER_API_KEY to .env.local)" }));
    return;
  }
  let body;
  try { body = JSON.parse(await readBody(req)); } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" })); return;
  }
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "no_messages" })); return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    for await (const chunk of streamChat(body.messages, { apiKey, referer: req.headers.referer || "" })) {
      send(chunk);
    }
    send({ type: "done" });
  } catch (err) {
    send({ type: "error", code: err?.status === 429 ? "rate_limited" : "failed" });
  } finally {
    res.end();
  }
}

// Files/folders that must never be served (secrets, VCS, server source).
const DENY = /(^|[/\\])\.|(^|[/\\])(\.git|\.env|node_modules)|\.(mjs|log)$|(^|[/\\])(package\.json|package-lock\.json|vercel\.json)$/i;

async function handleStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  // prevent path traversal
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  // Deny dotfiles, .env*, .git, server source (*.mjs), logs, and config —
  // serving the project root must never expose secrets or VCS data.
  if (DENY.test("/" + safe)) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found"); return; }
  const filePath = join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const buf = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
}

await loadEnv();
// Local development only. Bound to the loopback interface (127.0.0.1) so traffic
// never leaves this machine — plain HTTP is fine for localhost. Production runs on
// Vercel, which terminates HTTPS and serves api/chat.js as an edge function.
const HOST = "127.0.0.1";
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", `localhost:${PORT}`, `127.0.0.1:${PORT}`]);
createServer((req, res) => {
  // Host-header allowlist defeats DNS-rebinding attempts against the dev server.
  if (!ALLOWED_HOSTS.has((req.headers.host || "").toLowerCase())) {
    res.writeHead(403, { "Content-Type": "text/plain" }); res.end("Forbidden host"); return;
  }
  if (req.method === "POST" && (req.url || "").startsWith("/api/chat")) return handleChat(req, res);
  if (req.method === "GET") return handleStatic(req, res);
  res.writeHead(405); res.end("Method Not Allowed");
}).listen(PORT, HOST, () => {
  console.log(`\n  Naga portfolio dev server → http://${HOST}:${PORT}`);
  console.log(`  OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? "loaded ✓" : "MISSING ✗ (add to .env.local)"}\n`);
});
