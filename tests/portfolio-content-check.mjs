import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

// Validates the BUILT homepage. Run `npm run build` first, then this check
// (see the `test:content` npm script).
//
// Once server routes exist, the Vercel adapter relocates prerendered pages to
// .vercel/output/static/; a pure-static build keeps them in dist/. Check both.
const candidates = [
  new URL("../.vercel/output/static/index.html", import.meta.url),
  new URL("../dist/index.html", import.meta.url),
];
const target = candidates.find((u) => existsSync(u));
if (!target) {
  console.error("Built homepage not found — run `npm run build` first.");
  process.exit(1);
}

// Astro serializes interpolated text, so a literal "&" in content may be
// emitted as "&amp;" or "&#38;". Decode those back so the brand-content
// assertions match regardless of serialization — the intent (these strings
// appear on the page) is preserved.
const raw = readFileSync(target, "utf8");
const html = raw
  .replace(/&amp;/g, "&")
  .replace(/&#38;/g, "&")
  .replace(/&#x26;/gi, "&");

const mustInclude = [
  "Business Systems Analyst – AI Automation",
  "Software Engineer · Scalable Systems, Test Automation, AI-Assisted Development",
  "Salesforce-ready software engineering profile",
  "Architect, design, implement, test, and deliver scalable products",
  "SmartRemit — Multi-Tenant Payments Platform",
  "JetBot — Edge AI Agent on Jetson",
  "CUDA Matrix-Multiplication Kernel",
  "object-oriented Python",
  "Java, JavaScript/TypeScript, SQL, C++, HTML",
  "Claude Code, GitHub Copilot, Cursor, Gemini",
  "telemetry and performance metrics",
  "What we did",
  "How we did it",
  "Impact created",
  "AI Business Request Intake & Jira Automation System",
  "AI Automation ROI & Process-Optimization Platform",
  "Healthcare Workflow Automation & EMR Data-Extraction System",
  "Product Master-Data Automation & Data-Quality Control System",
  "AI-Powered Revenue-Operations Automation Dashboard",
  "https://ai-business-request-intake.vercel.app",
  "https://ai-automation-roi.vercel.app",
  "https://healthcare-emr-extraction.vercel.app",
  "https://product-master-data-qc.vercel.app",
  "https://revops-automation-dashboard.vercel.app",
  "profile.png",
  "nchennu@gmu.edu",
  "cal.com/nagavenkatasaichennu-c-h24tx0/15min",
];

for (const expected of mustInclude) {
  assert.ok(html.includes(expected), `Missing expected portfolio content: ${expected}`);
}

const sectionIds = ["about", "proof", "software", "projects", "experience", "skills", "research", "contact"];
for (const id of sectionIds) {
  assert.match(html, new RegExp(`<section[^>]+id="${id}"`), `Missing #${id} section`);
}

const liveProjectLinkCount = (html.match(/class="project-link"/g) ?? []).length;
assert.ok(liveProjectLinkCount >= 5, "Expected at least five live project links");
assert.doesNotMatch(html, /case study/i, "Project placeholders should not use the phrase case study");

console.log("Portfolio content checks passed.");
