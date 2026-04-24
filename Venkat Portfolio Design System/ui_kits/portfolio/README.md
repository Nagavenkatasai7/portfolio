# Portfolio UI Kit — Personal Site

A React recreation of the personal portfolio site at [nagavenkatasai7.github.io/portfolio](https://nagavenkatasai7.github.io/portfolio/).

## Files

- `index.html` — full interactive page composition
- `Nav.jsx` — sticky top nav with wordmark + anchors + Resume CTA
- `Hero.jsx` — hero headline, status pill, CTAs, and 5-column stat row
- `Sections.jsx` — `Section` wrapper + `About` + `Skills`
- `Content.jsx` — `Projects`, `Experience`, `Publications`, `Certifications`, `Contact`, `Footer`

## Components

| Component | Purpose |
|---|---|
| `<PortfolioNav>` | Sticky top nav, active-state highlighting, anchor scroll |
| `<Hero>` | Full hero with status pill + serif headline + lead + CTAs |
| `<StatRow>` | 5-column display numerals (Fraunces 300 tabular) with uppercase captions |
| `<Section>` | Wrapper: eyebrow + serif H2 + content, alternating canvas/surface-2 bg |
| `<About>` | Prose + highlight cards + profile placeholder |
| `<Skills>` | 6-group skill grid with mono-chips |
| `<ProjectCard>` | Project with meta, title, bullets, tag chips, optional status badge |
| `<Publications>` | Year-prefixed serif titles with optional "First Author" pill and DOIs |
| `<Certifications>` | 2-column cards with sage check-badge and verify links |
| `<Contact>` | Contact grid (6 fields) + email/resume CTAs |
| `<Footer>` | Compact copyright + social |

## Fidelity notes

- Content is faithful to the live site's actual copy, numbers, advisors, and publication metadata.
- Visual treatment is a **considered interpretation** of the brand, not a pixel copy of the live CSS (no repo access was available). The system emphasizes:
  - Serif (Fraunces) display, humanist sans (IBM Plex Sans) UI
  - Warm off-white canvas with a single burnt-amber accent
  - Display numerals as the signature visual element
  - Flat/papery aesthetic — no gradients, no purple, no emoji
- The profile photo is rendered as a "VC" monogram placeholder — swap for the real image (`img.JPG`) when copying into production.

## Known substitutions

- **Fonts:** Fraunces / IBM Plex Sans / JetBrains Mono from Google Fonts. If the live site uses a different stack, update `colors_and_type.css`.
- **Icons:** All arrow indicators are Unicode (`→ ↓ ↗`). For richer UI, pull from Lucide CDN — see root `README.md`.
- **Profile image:** placeholder; real source is `https://nagavenkatasai7.github.io/portfolio/img.JPG`.
