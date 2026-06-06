# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Instructions for Claude when working in this repo. Read this fully before writing or editing any code.

---

## Current state (read first)

The app is **built and serving clean** as a **no-build static site** — plain HTML, CSS, and ES-module JavaScript. There is **no framework, no bundler, no build step, and no dependencies**. The structure below exists on disk: `data/projects.js` (the registry, an ES module), `styles/`, `scripts/`, `index.html`, and the `/gig/` + `/qrewards/` route folders.

- **Deploy target is Netlify**, which publishes the repo root as-is (`netlify.toml`, `publish = "."`, no build command). Pretty URLs come from folder-`index.html` files (`/gig/` → `gig/index.html`). `netlify.toml` also sets security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) — don't drop them when editing that file.
- **The registry is loaded directly in the browser** via `<script type="module">` importing `data/projects.js`. The homepage grid is rendered client-side from it; project pages read their slug from `<body data-project="…">`.
- **Fonts** load via a Google Fonts `<link>` in each page's `<head>`: **Space Grotesk** (display), **Inter** (body), **JetBrains Mono** (mono). Family stacks live in CSS vars `--font-display`, `--font-sans`, `--font-mono` in `styles/tokens.css`.
- This was a deliberate pivot away from an earlier Next.js/TypeScript/Tailwind scaffold. Do not reintroduce a framework or build tooling without asking.

---

## Project

`mummysboy` is the homepage and hub for all of my projects. One clean front door at the root, with each project living under its own path:

```
/            → homepage (intent + project grid)
/gig         → Gig
/qrewards    → QRewards
/<next>      → every future project
```

Your job is to keep this hub clean, consistent, and visibly considered. The bar is **professional, intentional design — never generic "AI" output.** When in doubt, do less.

---

## Architecture (do not break this)

The site is **registry-driven**. One file is the single source of truth:

```js
// data/projects.js
/**
 * @typedef {Object} Project
 * @property {string} slug      // → /gig/
 * @property {string} name
 * @property {string} blurb     // one clean sentence, no marketing fluff
 * @property {"live"|"building"|"concept"} status
 * @property {string[]} tags
 * @property {string} [href]    // external link; omit if it's a nested route
 */

/** @type {Project[]} */
export const projects = [ /* ... */ ];
```

- The homepage **must** render its project grid from `projects` (`scripts/main.js` maps over the array and writes the cards into `#project-grid`). Never hardcode cards in the HTML.
- Adding a project = **one entry** in this array. If a change requires editing more than this file to *list* a new project, you've done it wrong — stop and reconsider. (A nested route still needs its own folder — see below.)
- Each project either nests as a route (`/gig/`) or links out via `href`. `scripts/main.js` handles both: `href` → external `<a target=_blank>`, otherwise an internal link to `/<slug>/`.
- The Project "type" is a JSDoc typedef, not TypeScript — keep editors happy without a build step.

---

## Stack

- **Vanilla JS (ES modules), plain HTML, plain CSS.** No framework, no bundler, no build step.
- **No dependencies, no `package.json`.** Do not add a framework, UI kit, build tool, or library without asking first. The whole point of this hub is that it stays buildless.
- Design tokens are CSS custom properties in `styles/tokens.css`; style with the token vars (`var(--ink)`, `var(--volt)`), never raw hex in component rules.
- Fonts via a Google Fonts `<link>` in each page `<head>`.
- **Deploy target: Netlify** (static, publishes repo root, no build command).

Because the browser loads ES modules over HTTP, you **cannot** open the files via `file://` — serve them (see Commands).

---

## Design rules (hard constraints)

These are not suggestions. Most "AI slop" comes from violating them.

1. **One accent per view.** Electric green (`--volt`) appears at most once on screen — a single CTA, one active state, or a `live` status dot. If two things are green, one is wrong.
2. **Type-led hierarchy.** Structure comes from scale, weight, and spacing — not from boxes, borders, drop shadows, or gradients added to fill space.
3. **No shadow soup, no glow.** Avoid stacked box-shadows, neon glows, and soft blurs. Separation comes from hairline rules (`--hairline`) and spacing.
4. **Silver is a material.** Use the metallic gradient treatment for the logo/headline and thin 1px silver rules. Don't flatten it into plain gray everywhere.
5. **Real negative space.** Generous margins, a true 12-column grid (max width ~1120px). Don't center everything in a vignette.
6. **Honest motion.** Transitions 120–200ms, physical and short. No parallax, no floating cards, no decorative motion.
7. **Base is near-black, never pure `#000`.**
8. **Mobile is a prerequisite, not an afterthought.** Every change must look and work right on a phone before it's considered done. See the [Mobile](#mobile-prerequisite) section.

If a request would break one of these rules, flag it and propose an alternative rather than silently complying.

### Mobile (prerequisite)

The hub is viewed on phones first. No work is complete until it holds up at **375px wide** (and degrades gracefully down to ~320px). Concretely:

- Every page has `<meta name="viewport" content="width=device-width, initial-scale=1" />`. Never remove it.
- **No horizontal scroll on the page itself.** If something is wider than the viewport (a row of cards, a filmstrip), it scrolls *inside its own container* (`overflow-x: auto`) — the page never does.
- **Mobile-first responsive CSS.** Base styles target small screens; widen with `min-width` media queries. Multi-column grids collapse to one column; the project grid is 1-col, then 2-col at `≥640px`; spec rows stack, then split at `≥680px`.
- **Fluid headlines.** `.title` uses `clamp()` so it never overflows; pair with `overflow-wrap: break-word`.
- **Tap targets ≥ ~38px.** Pad small icon links (see `.social a`); stack the download buttons full-width below `480px`.
- **Modals fit short screens** — capped with `max-height` + `overflow-y: auto`.
- **Respect `prefers-reduced-motion`** for any animation beyond a simple transition.
- Verify by narrowing the browser to a phone width (or device toolbar) and walking every page: home grid, `/gig` (icon, buttons, the Android modal + its success state, the screenshot filmstrip), `/qrewards`, and the footer social row.

### Tokens (defined in `styles/tokens.css`)

```css
:root {
  --ink:           #0B0B0D;  /* page background */
  --surface:       #141417;  /* cards / panels */
  --surface-hi:    #1C1C20;  /* hover / elevated */

  --silver:        #A8AEB8;  /* secondary text, borders */
  --silver-bright: #E7E9ED;  /* primary text */
  --hairline:      #2A2A30;  /* 1px rules */

  --volt:          #2DF58A;  /* accent — use once per view */
  --volt-dim:      #16A35C;  /* pressed / muted */

  --steel:         #6B7785;  /* links, quiet states */
}
```

Metallic silver for headline/logo accents:

```css
.metal {
  background: linear-gradient(180deg, #F4F5F7 0%, #C3C8D0 45%, #8A909B 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
```

### Type

- Display / headings → **Space Grotesk** (`var(--font-display)`)
- Body → **Inter** (`var(--font-sans)`)
- Labels / meta / route paths / tags → **JetBrains Mono** (`var(--font-mono)`) — mono is what gives the hub its deliberate, systemy voice; use it for all small uppercase labels and status chips

Tight modular scale (~1.25). Confident H1, fast drop to body. Small mono labels get generous letter-spacing.

---

## File structure

```
mummysboy/
├── index.html            # homepage — intent + empty #project-grid (filled by JS)
├── gig/
│   ├── index.html        # bespoke Gig content page (registry fills name/blurb; rest authored)
│   └── shots/            # Gig screenshots + the real App Store icon used on the page
├── qrewards/index.html   # registry-driven placeholder route
├── scripts/
│   ├── main.js           # renders the homepage grid from the registry
│   ├── project.js        # fills a project page's header from the registry by slug
│   └── android-access.js # Gig Android beta-invite modal → POSTs to the Gig backend
├── data/
│   └── projects.js       # SINGLE SOURCE OF TRUTH (ES module)
├── styles/
│   ├── tokens.css        # CSS custom properties: palette + font stacks
│   └── styles.css        # all component styles (@imports tokens.css)
├── favicon.svg           # silver dot on near-black
├── netlify.toml          # static deploy config (publish root, no build)
└── CLAUDE.md
```

The **homepage** stays strictly dumb: HTML provides the shell and empty hooks (`#project-grid`, `[data-count]`), `scripts/main.js` reads the registry and fills them — no business logic, no state beyond the registry. The card-rendering string in `main.js` escapes text via the `esc()` helper — keep using it for anything injected with `innerHTML`. **Project detail pages may be bespoke** (see below). Social links live in the footer (`.social`) on the home + QRewards pages, and in the Gig page's header (`.project__head`).

---

## Project detail pages

A nested route's `<body data-project="…">` lets `scripts/project.js` fill whichever registry-driven hooks are present — `[data-name]`, `[data-blurb]`, and optionally `[data-chip]`, `[data-tags]`, `[data-path]`, `[data-note]`, plus the `[data-next]` cycle link. `set()` no-ops on missing hooks, so a page only opts into what it wants. **Everything else on a project page is authored HTML** — unlike the homepage cards, detail pages are allowed to be hand-built and rich.

`/gig/` is the reference implementation. It pulls `name`/`blurb` from the registry and otherwise authors:

- a header row (`.project__head`) — the app icon (`gig/shots/app-icon.jpg`, the real current App Store icon) on the left, social links top-right;
- two download CTAs — **iOS** (`.cta--ios`, the page's single volt accent, → App Store) and **Android** (`.cta--ghost`, opens the beta-invite modal);
- the Android modal (`#afOverlay`), wired by `scripts/android-access.js`, which POSTs `{email, phone, contact_method}` to the **external Gig backend** at `https://backend-production-9a98f.up.railway.app/android-access` — the same endpoint and payload as the Gig landing page. On success it draws a checkmark and auto-dismisses. **This is the only place the hub calls an external service**; it depends on that backend's CORS allowing this origin;
- a `.spec` sheet (What it is / How it works / Status) and a `.shots` screenshot filmstrip with captioned steps.

When QRewards (or any project) earns a real page, follow this pattern: registry for the identity, authored HTML for the substance.

---

## Conventions

- Plain ES modules; no TypeScript. Type the registry with the JSDoc typedef in `data/projects.js` so editors still autocomplete.
- Style with the token CSS vars only — no inline hex, no magic numbers for the palette. New rules go in `styles/styles.css`.
- Use semantic class names (`.card`, `.chip`, `.chip__dot--live`); keep them descriptive, not utility-soup.
- Copy is plain and confident. No exclamation marks, no "Welcome to", no filler adjectives. One sentence per project blurb.
- Accessibility: visible focus states (the `:focus-visible` rule uses `--volt` — that's its allowed second job), semantic HTML, contrast-checked text.

---

## Commands

There is no build or lint step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 4321   # then open http://localhost:4321
# or: npx serve .
```

After any change, serve the site and confirm the homepage grid renders and both project routes resolve before reporting the task complete — **and check it at a phone width (375px)**, per the [Mobile](#mobile-prerequisite) rule. Quick non-browser sanity check: `node --check scripts/*.js` and import `data/projects.js` to confirm it parses.

---

## Adding a project (the common task)

1. Add one entry to `data/projects.js`.
2. If it's a nested route (no `href`), create `<slug>/index.html` — copy an existing one and change `<body data-project="…">`, the `<title>`, and the visible fallback name. If it links out, set `href` and you're done.
3. Confirm the homepage grid picks it up automatically — do not edit `index.html` or `scripts/main.js` to list it.
4. Serve and eyeball it.

---

## When unsure

Ask before: adding dependencies, introducing a new color, changing the grid/layout system, or anything that touches more than the registry to add a project. Default to restraint.

*Built to make mummy proud.*
