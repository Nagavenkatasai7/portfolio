import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

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
