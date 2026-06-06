# Luminous Portfolio Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the GitHub Pages portfolio from scratch as a simple, creative, beautiful "Luminous Systems" portfolio for Business Systems Analyst - AI Automation roles.

**Architecture:** Keep the static GitHub Pages structure and replace the current `index.html` with a fresh single-page site. Preserve public assets and links: `profile.png`, `Naga_Venkata_Sai_Chennu_Career_Fair_Resume.pdf`, live project links, email, LinkedIn, GitHub, calendar, and existing content-check coverage.

**Tech Stack:** HTML, CSS, vanilla JavaScript, GitHub Pages, existing Node content check.

---

### Task 1: Replace The Page From Scratch

**Files:**
- Modify: `/Users/nagavenkatasaichennu/Documents/my-projects/portfolio/index.html`

- [x] Replace the existing dark command-center layout with a new luminous editorial/product portfolio.
- [x] Preserve SEO metadata, schema, resume download, contact links, profile image, project titles, project live URLs, and all required section IDs.
- [x] Include these components: hero, proof metrics, about, market context, project case studies, skills architecture, experience, research, education, contact, footer.

### Task 2: Build Responsive Interaction

**Files:**
- Modify: `/Users/nagavenkatasaichennu/Documents/my-projects/portfolio/index.html`

- [x] Add mobile navigation toggle.
- [x] Add light scroll reveal using `IntersectionObserver`.
- [x] Add project filtering buttons for All, Automation, Data, Healthcare, RevOps, Research.
- [x] Add accessible buttons and reduced-motion support.

### Task 3: Verify And Deploy

**Files:**
- Test: `/Users/nagavenkatasaichennu/Documents/my-projects/portfolio/tests/portfolio-content-check.mjs`

- [x] Run `node tests/portfolio-content-check.mjs`.
- [x] Run `git diff --check`.
- [x] Scan public files for sensitive-value strings.
- [x] Browser-check desktop and mobile for overflow and console errors.
- [ ] Commit and push to `main`.
- [ ] Confirm GitHub Pages serves the rebuilt HTML.
