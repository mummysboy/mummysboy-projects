# mummysboy

> A single home for everything I build. One clean front door, one project at a time, all in one place I'd be happy to show off.

![Status](https://img.shields.io/badge/status-live-brightgreen)
![Stack](https://img.shields.io/badge/stack-vanilla_JS-f7df1e)
![Deploy](https://img.shields.io/badge/deploy-Netlify-00c7b7)
![License](https://img.shields.io/badge/license-personal-lightgrey)

> **Status: 🟢 Live.** A no-build static site — plain HTML, CSS, and ES-module JavaScript, no framework or dependencies. Homepage, registry-driven grid, and the `/gig/` + `/qrewards/` routes. Serve it with `python3 -m http.server` (see [Getting started](#getting-started)).

`mummysboy` is the homepage and hub for my projects. It lives at the root, explains what this place is, and links out to each project living under its own path:

```
mummysboy/            → the homepage (this project)
mummysboy/gig         → Gig
mummysboy/qrewards    → QRewards
mummysboy/<next>      → ...every project lands here
```

The goal is simple: a calm, confident landing page that frames the work, plus a repeatable pattern so adding the next project is a one-line change — not a redesign.

---

## Contents

- [What this repo is](#what-this-repo-is)
- [Preview](#preview)
- [Design direction](#design-direction)
  - [Principles](#principles)
  - [Color tokens](#color-tokens)
  - [Typography](#typography)
  - [Layout](#layout)
- [Stack](#stack)
- [Project registry](#project-registry)
- [Structure](#structure)
- [Getting started](#getting-started)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## What this repo is

This repo is **only the hub** — the homepage, the design system, and the project registry. Individual projects can either:

1. **Link out** to their own deployment (e.g. `gig.mummysboy.com` or an external URL), or
2. **Nest as a route** under this app (`/gig`, `/qrewards`).

Either way, every project is described in one place (`data/projects.js`) so the homepage always stays in sync. Add an entry, and a new card appears with correct links, status, and tags.

---

## Preview

<!-- Drop a screenshot or GIF of the homepage here: -->
<!-- ![Homepage preview](docs/preview.png) -->

_The hub is live — a homepage with the registry-driven project grid, plus the `/gig/` and `/qrewards/` routes._

---

## Design direction

The brief: **simple and clean, but visibly considered.** Nothing generic. Every choice should look deliberate.

### Principles

1. **Type-led hierarchy, not decoration.** Structure comes from scale, weight, and spacing — not boxes, shadows, or gradients layered to fill space.
2. **One accent, used sparingly.** Electric green appears once per view at most (an active state, a single CTA, a status dot). Restraint is what makes it read as electric.
3. **Metallic, not flat.** Silver is treated as a material — thin hairline rules, subtle vertical gradients on key surfaces — so "black and silver" feels engineered rather than just dark mode.
4. **Real negative space.** Generous margins and a true column grid. Let things breathe instead of centering everything in a soft glow.
5. **Honest motion.** Short, physical transitions (120–200ms). No floating, no parallax for its own sake.

### Color tokens

A near-black base, a metallic silver range, and a single electric-green accent. Defined as CSS variables so they're swappable in one place.

```css
:root {
  /* Base — rich near-black, never pure #000 */
  --ink:           #0B0B0D;   /* page background */
  --surface:       #141417;   /* raised panels / cards */
  --surface-hi:    #1C1C20;   /* hover / elevated */

  /* Silver — treated as a material */
  --silver:        #A8AEB8;   /* secondary text, borders */
  --silver-bright: #E7E9ED;   /* primary text */
  --hairline:      #2A2A30;   /* 1px rules, dividers */

  /* Accent — electric green, use once per view */
  --volt:          #2DF58A;   /* primary accent / active */
  --volt-dim:      #16A35C;   /* pressed / muted accent */

  /* Secondary — steel for links & quiet states (AA-tuned: 4.5:1 on --ink & --surface) */
  --steel:         #798593;
}
```

A signature **metallic silver** treatment for logo / headline accents:

```css
.metal {
  background: linear-gradient(180deg, #F4F5F7 0%, #C3C8D0 45%, #8A909B 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

> Accent discipline: if two things on a screen are green, one of them is wrong.

### Typography

Avoid the default-everywhere look. The pairing gives it a technical, intentional voice:

| Role | Typeface | Notes |
|------|----------|-------|
| Display / headings | **Space Grotesk** | Slightly mechanical, distinctive caps |
| Body | **Geist Sans** (or Inter) | Neutral, highly readable |
| Labels / meta / project codes | **Geist Mono** (or JetBrains Mono) | Mono for tags, statuses, route paths — reinforces the "system" feel |

Scale: a tight modular scale (e.g. 1.25 ratio). Big confident H1, then a fast drop to body. Uppercase mono labels at small sizes with generous letter-spacing.

### Layout

- 12-column grid, max content width ~1120px, comfortable gutters.
- Homepage = a short statement of intent up top, then a clean grid of project cards below.
- Each card: project name, one-line description, status chip, tags, and a single link. No clutter.

---

## Stack

Deliberately buildless — the hub stays simple so adding a project never means fighting tooling.

- **Vanilla JavaScript (ES modules)** — the registry is imported directly in the browser; the grid renders client-side.
- **Plain HTML & CSS** — design tokens are CSS custom properties; nested routes are folder-`index.html` files.
- **No framework, no bundler, no build step, no dependencies.**
- **Netlify** — static deploy (publishes the repo root) + custom domain (`mummysboy.com`).

---

## Project registry

The whole site is driven by one file. Adding a project = one entry.

```js
// data/projects.js  (typed with JSDoc — no build step)
/**
 * @typedef {Object} Project
 * @property {string} slug      // → /gig/
 * @property {string} name
 * @property {string} blurb     // one clean sentence
 * @property {"live"|"building"|"concept"} status
 * @property {string[]} tags
 * @property {string} [href]    // external link; omit if it's a nested route
 */

/** @type {Project[]} */
export const projects = [
  {
    slug: "gig",
    name: "Gig",
    blurb: "A commission-free services marketplace, local to global.",
    status: "live",
    tags: [],
  },
  {
    slug: "qrewards",
    name: "QRewards",
    blurb: "QR-based loyalty, minus the punch card.",
    status: "concept",
    tags: ["loyalty", "retail"],
  },
  // add the next project here ↓
];
```

`scripts/main.js` imports `projects` and renders the cards into `#project-grid`; the status chip uses `--volt` only for `live`.

---

## Structure

```
mummysboy/
├── index.html            # homepage — intent + project grid (filled by JS)
├── gig/
│   ├── index.html        # bespoke Gig route (<body data-project="gig">)
│   └── shots/            # Gig screenshots + the real App Store icon
├── qrewards/index.html   # registry-driven placeholder route
├── scripts/
│   ├── main.js           # renders the homepage grid from the registry
│   ├── project.js        # fills a project page header from the registry
│   └── android-access.js # Gig Android beta-invite modal → Gig backend
├── data/
│   └── projects.js       # the single source of truth (ES module)
├── styles/
│   ├── tokens.css        # color + type variables
│   └── styles.css        # component styles
├── favicon.svg
├── netlify.toml          # static deploy config + security headers
├── CLAUDE.md             # guidance for Claude Code
└── README.md
```

---

## Getting started

No install, no build. Because the pages load ES modules, they must be served over HTTP — opening `index.html` from the filesystem (`file://`) won't work.

### Run locally

```bash
# from the repo root, any static server works:
python3 -m http.server 4321      # → http://localhost:4321
# or
npx serve .
```

### Deploy

Netlify publishes the repo root as-is — no build command (`netlify.toml` sets `publish = "."`). Connect the repo in Netlify (or drag-and-drop the folder), then point the custom domain (`mummysboy.com`) at the site. Folder `index.html` files give clean URLs: `/gig/` serves `gig/index.html`.

---

## Roadmap

- [x] Homepage shell + tokens wired in
- [x] Project card grid driven by registry
- [x] Nested project routes (`/gig/`, `/qrewards/`)
- [x] Bespoke Gig page — download CTAs, Android beta-invite modal, screenshots
- [x] Deployed to Netlify + custom domain live
- [ ] `DESIGN.md` with full component specs

---

## Contributing

This is a personal project, but the pattern is meant to be effortless to extend:

- **Add a project:** append one entry to `data/projects.js` (see [Project registry](#project-registry)). A card appears automatically with the right links, status, and tags. For a nested route, also add a `<slug>/index.html`.
- **Changes:** keep edits small and on-brand — honor the [design principles](#principles), especially accent discipline.
- **Issues/PRs:** welcome for typos, bugs, or improvements. Keep PRs focused.

---

## License

Personal project — not currently licensed for reuse. All rights reserved unless a `LICENSE` file says otherwise.

---

*Built to make mummy proud.*
