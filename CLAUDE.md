# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Instructions for Claude when working in this repo. Read this fully before writing or editing any code.

---

## Current state (read first)

The app is **built and serving clean** as a **no-build static site** — plain HTML, CSS, and ES-module JavaScript. There is **no framework, no bundler, no build step, and no dependencies**. The structure below exists on disk: `data/projects.js` (the registry, an ES module), `styles/`, `scripts/`, `index.html`, and the `/gig/` + `/qrewards/` route folders.

- **Deploy target is Netlify**, which publishes the repo root as-is (`netlify.toml`, `publish = "."`, no build command). Pretty URLs come from folder-`index.html` files (`/gig/` → `gig/index.html`). `netlify.toml` also sets security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) — don't drop them when editing that file. It also sets `Cache-Control` headers (HTML always revalidates; CSS/JS short-TTL; images day-long) — since **nothing has a hashed filename**, images are served under stable names and **must be renamed if their contents ever change**, or clients will serve the stale cached version.
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
 * @property {string} [href]       // external link; omit if it's a nested route
 * @property {string} [titleTag]   // optional SEO <title> for the project page (else "{name} — mummysboy")
 * @property {string} [headline]   // optional benefit H1 for the page (else {name})
 * @property {string} [heroBlurb]  // optional longer hero lede (else {blurb})
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
9. **WCAG 2.1 Level AA is a prerequisite, not an afterthought.** The whole site must always meet Level AA. No change is done until it does. See the [Accessibility](#accessibility-prerequisite) section.

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

### Accessibility (prerequisite)

**The entire site must always conform to WCAG 2.1 Level AA** — the standard most businesses and government bodies require. This is non-negotiable and applies to every page and every change, including new projects. Before calling any work done, confirm it still holds:

- **Color contrast (1.4.3 / 1.4.11).** Normal text ≥ **4.5:1** against its background; large text (≥24px, or ≥18.7px bold) and UI/graphical indicators (focus rings, status dots, icon glyphs, input borders) ≥ **3:1**. Check against *both* `--ink` and `--surface` — `--steel` (`#798593`) is the lightest text color that clears 4.5:1 on both; **do not darken it**, and contrast-test any new color before adding it. When in doubt, compute it (a tiny Node snippet works) rather than eyeballing.
- **Don't signal with color alone (1.4.1).** Pair any color cue with text, shape, weight, underline, or an `aria-*` state. In-body text links carry an underline (see `.spec__link`); the status chip pairs its dot with a text label; the modal's SMS/WhatsApp toggle uses brightness *and* `aria-pressed`.
- **Keyboard (2.1.1 / 2.1.2 / 2.4.7).** Everything interactive is reachable and operable by keyboard, with a visible focus indicator (the global `:focus-visible` volt ring — its one allowed second job). No keyboard traps.
- **Dialogs.** The Android modal is the reference: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`, Esc + overlay-click to close, focus moves in on open and **returns to the trigger** on close, the rest of the page is `inert` while it's open, and body scroll is locked. Any future modal must do the same.
- **Names, roles, labels (1.3.1 / 3.3.2 / 4.1.2).** Every input has a `<label>`; grouped controls get a group label; icon-only controls get `aria-label`; decorative SVG/icons are `aria-hidden="true"`. Status/error messages live in a `role="status"` (or `aria-live`) region so they're announced.
- **Images (1.1.1).** Meaningful images have descriptive `alt`; purely decorative ones use empty `alt`/`aria-hidden`. Don't use images of text — the metal headline is real text, keep it that way.
- **Target size (2.5.8).** Interactive targets are ≥ 24×24px (we generally aim for ~38–44px; see `.social a`, `.af-close`), or spaced so a 24px circle on each doesn't overlap a neighbor.
- **Structure & motion.** One `<h1>` per page with a sensible heading order; landmark elements (`<header>`/`<main>`/`<footer>`/`<nav>`) for bypass (2.4.1); `lang` on `<html>`; reflow with no horizontal page scroll to 320px (1.4.10, shared with [Mobile](#mobile-prerequisite)); honor `prefers-reduced-motion` (2.3.3) and avoid anything that flashes (2.3.1).

If a request would push the site below AA, flag it and propose an accessible alternative rather than shipping it.

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

  --steel:         #798593;  /* links, quiet states — AA-tuned (4.5:1 on ink & surface) */
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
│   ├── index.html        # Gig landing page — the "dual-c" ad-style test arm (authored hero; registry sets <title>)
│   ├── pro/index.html    # provider-audience campaign variant ("pro" arm; noindexed)
│   ├── hire/index.html   # customer-audience campaign variant ("hire" arm; noindexed)
│   ├── blog/
│   │   ├── index.html    # blog index — empty #post-grid (filled by scripts/blog.js)
│   │   └── <slug>/index.html  # authored article (static HTML; body is crawlable prose)
│   ├── assets/           # official App Store + Google Play store badges
│   ├── shots/            # Gig screenshots + the real App Store icon used on the page
│   └── share-card.png    # OpenGraph/Twitter share image
├── rfcfinder/
│   ├── index.html        # RFC Finder page — registry name/blurb + authored substance
│   ├── shots/            # app icon + two app screenshots
│   └── share-card.png    # OpenGraph/Twitter share image
├── irldatingshows/
│   ├── index.html        # IRL landing page — authored copy + DB-driven event list
│   └── admin/index.html  # private phone-first ops console (noindex)
├── mummy/index.html      # private family request page (sign in → Request → money/call/message; noindex)
├── privacy/index.html    # the WEBSITE's privacy notice (pixel, analytics, IRL sign-ups)
├── qrewards/index.html   # registry-driven placeholder route
├── scripts/
│   ├── main.js           # renders the homepage grid from the registry
│   ├── project.js        # fills a project page's header from the registry by slug
│   ├── blog.js           # renders the blog index grid + "more reading" from data/posts.js
│   ├── sb-client.js      # tiny Supabase client factory (PostgREST + auth) — no dependency
│   ├── irl-db.js         # IRL's instance of sb-client (same exports as before)
│   ├── mummy.js          # the /mummy/ page: sign-in + the request flow
│   ├── irl-events.js     # renders the IRL event listing + wires the signup dialog
│   ├── irl-signup.js     # the participate/watch dialog (one dialog, two modes)
│   ├── irl-admin.js      # the IRL admin console
│   ├── gig-analytics.js  # first-party landing-page analytics → POSTs beacons to the Gig backend
│   ├── qr.js             # dependency-free QR encoder (byte mode, ECC M, versions 1–10) → SVG string
│   ├── gig-qr.js         # desktop-only "scan to install" code on the Gig arms (uses qr.js)
│   ├── gig-sticky.js     # /gig/ (dual-c) mobile sticky download bar
│   ├── reveal.js         # scroll-reveal for [data-reveal] sections (progressive enhancement; hero exempt)
│   ├── android-access.js # Gig Android beta-invite modal → POSTs to the Gig backend
│   ├── consent.js        # privacy gate: picks the regime, draws the banner, owns window.mbConsent
│   └── mediago.js        # MediaGo ad pixel + store-CTA conversion — silent until consent.js says yes
├── data/
│   ├── projects.js       # SINGLE SOURCE OF TRUTH for projects (ES module)
│   ├── posts.js          # SINGLE SOURCE OF TRUTH for blog posts (ES module)
│   └── irl-config.js     # IRL's Supabase URL + public key, and its form options
├── supabase/
│   ├── schema.sql        # IRL database: tables, RLS, triggers, grants (idempotent)
│   ├── mummy.sql         # the `requests` table behind /mummy/ (run after schema.sql; idempotent)
│   ├── functions/
│   │   ├── signup-email/index.ts  # Deno edge fn: confirmation + alert on a new signup
│   │   └── request-email/index.ts # Deno edge fn: emails the owner when a family request lands
│   └── README.md         # setup order + the security model, read before editing policies
├── styles/
│   ├── tokens.css        # CSS custom properties: palette + font stacks
│   ├── styles.css        # all component styles (@imports tokens.css)
│   ├── gig-additions.css # Gig landing-page redesign rules (uses the same token palette)
│   ├── gig-ad.css        # /gig/ ad treatment, scoped to html[data-variant="dual-c"]
│   ├── irl.css           # IRL identity: ember accent, listings, dialog, forms
│   ├── irl-admin.css     # IRL admin only — never loaded by the public page
│   └── mummy.css         # /mummy/ only, scoped to html[data-site="mummy"]
├── favicon.svg           # silver dot on near-black
├── robots.txt            # allow-all + points at the sitemap
├── sitemap.xml           # static sitemap (update when adding a route or post)
├── netlify/
│   └── edge-functions/
│       └── geo.js        # returns the visitor's country so consent.js can pick a regime
├── netlify.toml          # static deploy config (publish root, no build) + security headers
└── CLAUDE.md
```

The **homepage** stays strictly dumb: HTML provides the shell and empty hooks (`#project-grid`, `[data-count]`), `scripts/main.js` reads the registry and fills them — no business logic, no state beyond the registry. The card-rendering string in `main.js` escapes text via the `esc()` helper — keep using it for anything injected with `innerHTML`. **Project detail pages may be bespoke** (see below). Social links live in the footer (`.social`) on the home + QRewards pages, and in the Gig page's header (`.project__head`).

---

## Project detail pages

A nested route's `<body data-project="…">` lets `scripts/project.js` fill whichever registry-driven hooks are present — `[data-name]`, `[data-blurb]`, and optionally `[data-chip]`, `[data-tags]`, `[data-path]`, `[data-note]`, plus the `[data-next]` cycle link. `set()` no-ops on missing hooks, so a page only opts into what it wants. **Everything else on a project page is authored HTML** — unlike the homepage cards, detail pages are allowed to be hand-built and rich.

`/gig/` is the reference implementation. It pulls `name`/`blurb` from the registry and otherwise authors:

- a header row (`.project__head`) — the app icon (`gig/shots/app-icon-black.jpg`, the real current App Store icon) on the left, social links top-right;
- two download CTAs — **iOS** (`.cta--ios`, the page's single volt accent, → App Store) and **Android** (`.cta--ghost`, opens the beta-invite modal);
- the Android modal (`#afOverlay`), wired by `scripts/android-access.js`, which POSTs `{email, phone, contact_method}` to the **external Gig backend** at `https://backend-production-9a98f.up.railway.app/android-access`. On success it draws a checkmark and auto-dismisses;
- official **App Store + Google Play badges** from `gig/assets/` (not hand-rolled buttons — use the real vendor artwork);
- a `.spec` sheet (What it is / How it works / Status) and a `.shots` screenshot filmstrip with captioned steps;
- first-party analytics via `scripts/gig-analytics.js` (see below).

When QRewards (or any project) earns a real page, follow this pattern: registry for the identity, authored HTML for the substance.

### Advertising pixel & the consent gate

Two shared classic scripts load in the `<head>` of **every public page** (not `/irldatingshows/admin/`), in this order — **do not swap them**:

```html
<script src="/scripts/consent.js"></script>
<script src="/scripts/mediago.js"></script>
```

`scripts/mediago.js` is the MediaGo ad pixel (acid `32781`) plus conversion tracking on the App Store and Play CTAs. `scripts/consent.js` is the gate that decides whether it may run at all. Rules that are load-bearing:

- **The gate is the only way the pixel starts.** `mediago.js` subscribes via `window.mbConsent.onChange(fn)` and touches the network only when it is told yes. If `consent.js` fails to load, nothing fires — a broken gate must never become an open one. `fireConversion()` re-checks at click time, so withdrawal takes effect mid-visit.
- **Two regimes.** `strict` (UK/EEA/CH — UK GDPR + PECR) is **opt-in**: nothing loads until Accept. `us` (CPRA and the state laws modelled on it) is **notice + opt-out**, and honours Global Privacy Control as a valid opt-out. Anywhere else falls back to `strict`. A stored explicit click beats GPC; GPC beats the default.
- **Region comes from `/edge/geo`** (`netlify/edge-functions/geo.js`, the one non-static thing in the repo), with the browser timezone as fallback and a 1500ms ceiling. `onChange` deliberately does **not** fire synchronously on subscribe — an answer given before the country is known is the guess the endpoint exists to replace. The country is cached in `localStorage`, so only undecided first-time visitors cost a request.
- **No `<noscript>` tracking pixels.** An image tag cannot be consent-gated, which is exactly the pre-consent tracking PECR prohibits. Do not add one back.
- **The banner spends no volt.** PECR requires accept and reject to be *equally prominent*, so a highlighted Accept is not available here. Its buttons use `--steel` borders, not `--hairline` (hairline is 1.29:1 on `--surface` and cannot be what identifies a control — 1.4.11 wants 3:1). Check any change to it against **both** the dark house palette and the light Gig arms.
- **Store CTAs must never be delayed to fit tracking in.** The backup conversion pixel uses `fetch(keepalive)`, which outlives the document; repeat taps collapse on a 3s sliding window so a slow badge cannot inflate the campaign's lead count. Same reasoning as the `target="_blank"` rule above.

**The site's notice and the app's policy are two different documents.** `/privacy/` (in this repo) covers the *website*: the MediaGo pixel, the first-party analytics beacons, the browser storage keys, and the IRL show sign-up form. The Gig app policy on the Railway backend covers the *app*, which carries no advertising trackers — do not merge them, and do not point the banner at the app policy. The Gig arms' footers link both ("Privacy" → `/privacy/`, "App privacy" → backend). If what the site collects changes, `/privacy/` changes the same day, including its `Last updated` date.

### Analytics & the Gig backend

`scripts/gig-analytics.js` is the Gig pages' first-party analytics. It fire-and-forget POSTs tiny beacons (`view`, `ios`/`android` CTA clicks, `section` scroll-reach, `exit`) to `…/landing-event` on the same Railway backend, each tagged with the page's `variant` (from `<html data-variant>`), a per-link `srcId` (parsed from `?id=`/`?ref`/`?utm_*` or a `/id=VALUE` path and persisted in `sessionStorage`), the device `os` (from the pre-paint `is-ios`/`is-android` class), and the nearest `data-pos`. It exposes `window.gigTrack`, which `android-access.js` uses for the full modal funnel: `android_open` → `android_submit_attempt` → `android_submit` (the true conversion), plus `android_error` (labeled) and `android_abandon` (`typed`/`empty`). `PATH` stays hardcoded to `"/gig"` on every page — `variant` is the splitter, and the backend dashboard filters on that path. The `APPLE_PT` constant in `gig-analytics.js` is empty until the App Store Connect provider token is supplied; once set, every `apps.apple.com` link is tagged `pt`/`ct=<variant>-<srcId>`/`mt=8` for Apple-side install attribution. **Analytics is best-effort and must never throw or block the page** — keep every call wrapped and fire-and-forget. Click/section attribution is driven by HTML hooks (`data-pos`, `data-section`, `data-exit`, `#androidBtn`/`.js-android-open`); preserve those hooks when editing the markup.

**App Store links must never carry `target="_blank"`.** Instagram's and Facebook's in-app webviews have no tab model, so a `_blank` tap silently does nothing — while the click listener above still fires its `ios` beacon, because it deliberately doesn't `preventDefault`. A dead badge therefore reports as a *conversion*. On 2026-07-30 one visitor rage-tapping a dead hero badge logged 18 "clicks" in 28 seconds, putting the day's apparent iOS CTR at ~46% against a real ~15%. Every `apps.apple.com` link navigates in place; iOS hands off to the App Store app natively, so a new tab buys nothing. Apply the same rule to any store/CTA link added later — a link whose job is to convert must not open in a new tab.

### Desktop scan-to-phone QR

Email campaigns land people on a desktop, where a store badge can't install anything. `scripts/gig-qr.js` fills every `[data-qr]` slot (hero + closing rail on all three arms) with a QR drawn client-side by `scripts/qr.js` — a small byte-mode encoder written here rather than added as a dependency. Two rules keep it honest:

- **It encodes the same arm, with the visitor's own campaign id carried through**: `https://mummysboy.com<same path>/?id=<srcId>-qr` (bare `?id=qr` when there's no campaign, truncated so the `-qr` tag survives the backend's 40-char `srcId` window). So a phone install traces back to the exact email that produced the desktop visit, and the arm's copy stays consistent across the hop. The origin is hardcoded to production on purpose — a code scanned off a localhost or deploy-preview screen still has to resolve on someone's phone.
- **It only renders on `html.is-desktop`** (the pre-paint UA class) — a phone can't scan its own screen. `.scan` is `display: none` until `gig-qr.js` adds `.scan--ready`, so a JS failure leaves no empty box.

`qr.js` is verified against `node-qrcode`: matrices are bit-identical at the declared mask across versions 1–10, and jsQR decodes the rasterized output back to the exact input. If you change it, re-run that check before shipping — a silently wrong QR looks fine and scans as nothing.

The Railway backend (`https://backend-production-9a98f.up.railway.app`) is the **only external service the hub calls** — reached from both `android-access.js` (`/android-access`) and `gig-analytics.js` (`/landing-event`). Both depend on that backend's CORS allowing this origin.

### Gig landing variants (campaign pages)

The Gig landing surface is an audience-segmented test — three arms, one per traffic segment:

| Arm | Path | `<html data-variant>` | Audience |
|---|---|---|---|
| main (control) | `/gig/` | `vid` since 2026-10-09 (the full-screen video-hero page; before it `dual-e`, `dual` until 2026-09-23, briefly `dual-b`, `dual-c` until 2026-10-03, `dual-d` for an hour) | both sides (broad/organic + ads) |
| previous page | `/gig/lander/` | `dual-e` | the light spec-sheet page that was `/gig/` until 2026-10-09, kept as a variant |
| provider | `/gig/pro/` | `pro` | people offering services |
| invitation | `/gig/invite/` | `invite` | people someone invited: `/gig/invite=Name` (macro link), `/gig/invite/CODE` or `?from=Name` personalises the card — see the note below |
| customer | `/gig/hire/` | `hire` | people hiring |

Rules that keep the test valid — do not "fix" these:

- **Variant pages are fully authored HTML.** They deliberately load **no `project.js`** (it would overwrite `<title>` and any `data-name`/`data-blurb` hooks from the registry) and carry **no `.project-nav`** (an exit leak on paid traffic). Hero copy lives only in the page.
- **`data-variant` is an experiment id.** Iterate copy under a *new* id (`pro-b`), never silently change a page under an existing id — historical rows in the dashboard would be poisoned. (`v2` rows are the pre-test baseline of `/gig/`.)
- **SEO safety:** variant pages carry `noindex, follow` + `canonical → https://mummysboy.com/gig/`, keep a full OG set with `og:url` pointing at *themselves* (ad link previews work — OG scrapers ignore robots meta), stay **out of `sitemap.xml`**, and must **not** be `Disallow`ed in `robots.txt` (a crawl block would hide the noindex).
- **Campaign links:** `/gig/pro?id=SRC` (query) or `/gig/pro/id=SRC` (pretty path — `netlify.toml` has a 200 rewrite per variant folder). Add the rewrite when adding a variant.
- **Cross-arm comparability:** keep `data-section` / `data-pos` hook names consistent across arms (`hero`, `spec`, `flow`, `closing`, `footer`; positions `hero`, `status`, `closing` — dual adds `mid`/`mid-cta`, and dual-b/dual-c add the `sticky` position for the mobile sticky bar plus `categories` and `safety` sections). Variant-scoped styles live in `styles/gig-additions.css` under `html[data-variant="…"]` selectors, token palette only.
- **`/gig/lander/` is the dual-e ad page (it WAS `/gig/` until 2026-10-09; `dual-c` until 2026-10-03 had no demo button, `dual-d` had a plainer one for about an hour).** At the owner's direction (2026-09-23) it is a scoped exception to design rules 1–4: a blue brand band on the closing section (the app icon's cobalt), green kept only for money figures, big stat blocks, a shadowed phone. The hero is the original `dual` hero (light page, metal headline, couplet, one phone) — `dual-b` was the same page with a cobalt-band, two-phone hero, live for a few hours on 2026-09-23. It lives entirely in `styles/gig-ad.css` under `html[data-variant="dual-e"]` and must not leak to other arms or the hub. **Its classes are `pitch-*`, never `ad`/`ad-*`:** EasyList hides `.ad-inner`, `.ad-top`, `.ad-card` and `.ad-cat` site-wide, and from 2026-09-23 to 2026-10-01 that blanked the whole page for every ad-blocker visitor. Check new class names against EasyList, and bump the `?v=` on its `<link>` whenever selectors are renamed. AA, mobile, copy honesty and the CTA rules still apply in full. The "~$15+ in fees" money block uses the same hedged claim as `/gig/compare/`, so keep the two in step.
- **The web demo (`/gig/demo/`, added 2026-10-03; on `/gig/` since `dual-d`, current entry points from `dual-e`).** The real Gig app built for the web, running on an in-browser mock backend with the app's own demo accounts as the pros. It is **generated** in the Gig repo (`mobile/src/demo/`, built by `npm run build:web-demo` in `mobile/`, which writes straight into `gig/demo/`). Never hand-edit `gig/demo/`; change the Gig repo and rebuild. On a computer the page shows itself inside a phone frame (`?embed=1`), which is why `netlify.toml` gives `/gig/demo/*` a `frame-ancestors 'self'` CSP (it overrides the site-wide `X-Frame-Options: DENY`). Only the outer page loads `consent.js`, `mediago.js` and `gig-analytics.js`, so a visit counts once. It beacons as variant **`demo`**: `view` = demo opens, and its store taps arrive as `ios`/`android` labelled `demo-<where>` (`demo-sheet-get` from its "Get the app" bar, `demo-sheet-reply`/`-job`/`-listing` from the prompts, `demo-stage` beside the desktop frame; `demo-bar` on rows before 2026-10-04), plus the MediaGo conversion via `window.mediagoTrackStoreClick`. Every download path in the demo offers both stores. The moderation dashboard's Landing view counts all of this separately from `/gig/` (demo opens / loads / taps). On `/gig/` it has two same-tab entry points: a "Try demo / No download necessary" badge in the hero badge row (`.pitch-try`, `data-exit="demo"`), drawn to match the App Store badge (black, #a6a6a6 edge, system font) with the Gig icon in place of the Apple logo; and, on wider screens, the hero phone itself (`.pitch-try-phone`, `data-exit="demo-phone"`) with a cobalt chip on its bottom edge. Its store taps navigate in place, never in a new tab (same rule as the badges). `/privacy/` lists its browser storage and the randomuser.me photo host.
- **`/gig/` (`vid`, since 2026-10-09; at `/gig/vid/` for a day first, which now 301s home) is dual-e with a full-screen video hero.** It is the indexed page (canonical, JSON-LD, in the sitemap); `/gig/lander/` is the noindexed one. Its media stays in `gig/vid/` (loops, posters, stills, the App Store preview). Same page below the hero (it shares every `dual-e` rule in `gig-ad.css` through `html:is([data-variant="dual-e"], [data-variant="vid"])` selectors — keep new dual-e rules in that form), so the two differ only in the hero: the first viewport is a muted 19 s loop (light bulb → mopping → window → dog walk) edge to edge on every screen, under a dark scrim, with the same headline/readout/badges on top and the masthead floating over it. One `<video>` (`autoplay muted loop playsinline`); an inline script picks the portrait cut (`hero-loop-2.mp4`, 720×1280) or the landscape cut (`hero-loop-wide-2.mp4`, 1280×720) before loading, since Chrome ignores `<source media>`. `scripts/gig-vid.js` pauses it off-screen and never starts it under Reduce Motion or Save-Data (poster only). Both cuts come from four free Pexels clips (light bulb → mopping → window → dog walk; sources and licence in the Gig repo at `marketing/media/inbox/pexels/SOURCES.md`): real stock people, not Gig users, so copy must never present them as Gig pros. Stable names: rename on change (`hero-loop-3.mp4`). The "Try demo" badge is NOT in the hero row here: a `pitch-demo` section (`data-section="demo"`, the one hook dual-e lacks) sits right under the hero with the App Store preview (`gig/vid/app-preview-1.mp4`, re-encoded from the Gig repo's `marketing/app-store-1.17/app-preview-iphone-886x1920.mp4`, lazy-loaded by `gig-vid.js` via `data-lazy-video`) in a phone frame that opens the demo (`data-exit="demo-phone"`) beside the badge (`data-exit="demo"`). There is NO static screenshot `flow` section (the preview shows the app moving), so that hook is absent on this arm; the others match dual-e (`hero`, `safety`, `categories`, `spec`, `mid-cta`, `closing`, `footer`; positions `hero`/`mid`/`closing`/`sticky`), so the dashboard compares the arms directly. **It is the dark arm:** `html[data-variant="vid"]` re-declares the house dark tokens over the light theme that `gig-additions.css` gives every data-variant (cobalt band kept, green for money, `--pitch-icon` for the safety glyphs), the hero scrim ends on the page colour, and the closing band is a still from the hero footage (`gig/vid/close-still-1.jpg` / `close-still-portrait-1.jpg`) under the hero's scrim instead of the blue mosaic. Contrast figures are in the stylesheet block.
- **`/gig/invite/` (`invite`, 2026-10-09) is the `/gig/` page with the hero swapped for the invitation card.** Everything under the stage (demo section, safety, categories, money, both-sides, closing band, FAQ/SEO, sticky bar, footer) is `/gig/`'s markup verbatim — `gig-ad.css` and `gig-additions.css` scope every rule to `dual-e`, `vid` AND `invite`, so keep new rules in that `:is()` form, and when `/gig/`'s body changes, re-copy it into `gig/invite/index.html` (only the `<article class="hero">` differs). The stage: the `/gig/` hero loop (same files in `gig/vid/`, same inline portrait/landscape pick, `gig-vid.js` for pause/Reduce Motion) with a frosted dark card with the inviter's photo, "{name} is inviting you to Gig.", the invite code as a ticket stub with Copy, the store badges, a demo link and the desktop QR. Link forms, all served by `netlify.toml` 200 rewrites and read by `scripts/gig-invite.js`: the macro `/gig/invite=Name` (percent-decoded, first word, letters only; `/gig/invite=Name/CODE` adds a code), `/gig/invite/CODE`, and `?from=Name` / `?code=CODE`. Name and code sit in the PATH so `gig-qr.js` carries them to the phone. A code is resolved against the Gig backend: `GET /api/teams/resolve/:code` first (name + team for an active team member's code → "join {team}" + "Profile → Team" copy), then the existing public `GET /api/referral/resolve/:code` (any code's first name; by the backend's design it never returns a photo). Avatar: a photo the site ships for a known person (`gig/invite/people/`, keyed by lower-cased first name in `PHOTOS` — Nicolette so far), else the Gig logo. Never a monogram or an empty circle. Names go in via `textContent` only. The stage's own sheet is `styles/gig-invite.css` (`inv-*`), loaded after the shared ones. Link preview: `gig/invite/share-invite-4.jpg` (1200×630, the card filling the whole image, with both store badges, `summary_large_image`; rename on change). Hooks: section `hero`/`footer`, position `hero`, exits `demo`/`gig`.
- **Copy honesty is load-bearing:** "Gig takes 0%" / "keep 100%" must stay literally true — if paid placement or fee tiers ever ship, every arm's copy changes the same day. Android is always a beta *invite*, never a download.

---

## IRL — live dating shows (`/irldatingshows/`)

The one route whose content is **not** in a registry. Shows run at any kind of venue
— bars, restaurants, clubs, public spaces — and change constantly, so events live in
Supabase and are edited from a phone at
`/irldatingshows/admin/` — a git push per event booking was not going to happen.
The page's prose is still authored static HTML, so what the site *is* stays crawlable;
only the listings are client-rendered (an `Event` JSON-LD block is injected for them).

- **Still no dependencies.** `scripts/sb-client.js` is a hand-written Supabase client
  factory — `fetch` against PostgREST plus enough GoTrue to keep someone signed in —
  and `scripts/irl-db.js` is IRL's instance of it (same exports it always had). Do not
  swap it for `supabase-js`; that is the first thing here that would need a bundler.
- **The database is the authority, not the JS.** `supabase/schema.sql` is the source
  of truth and is idempotent — edit it and re-run the whole file. **Read
  `supabase/README.md` before touching any policy.** The short version: `signups`
  holds real personal data and has no public read path at all, so the public page
  gets "seats left" from trigger-maintained counters on `events`. Every column of
  `events` is public — anything private goes in `event_private`.
- **`submit_signup()` is the only public write.** A plain insert cannot tell a
  visitor what happened to them (anon cannot read the row back), so a spectator who
  gets waitlisted would be told "seats held" and turn up to a full door. The RPC
  returns the stored status. Keep it that way.
- **Its own accent.** `--ember` (`#FF6B4A`), scoped to `html[data-site="irl"]` so it
  never leaks into the hub. Volt belongs to Gig. Ember means one thing here — "this
  is the action" — filled once in the hero, outlined on each event row. The headline
  uses the warm `.stage` gradient where the rest of the hub uses `.metal` silver;
  silver stays the material on the masthead.
- **Sign-up email is fire-and-forget, and must stay that way.** An `after insert`
  trigger on `signups` hands the row id (only the id — the rest would sit in
  pg_net's queue as a second copy of someone's personal data) to the
  `signup-email` edge function, which sends the applicant a confirmation and us
  an alert via Resend. The trigger swallows every error and the function always
  answers 200: **a sign-up must never fail because a mailer did.** A second
  trigger emails the applicant when an admin changes their status (approved,
  waitlist, declined, cancelled), guarded by `signups.notified_status` so a
  re-saved row cannot repeat a message someone already got. The
  confirmation copy carries the same honesty rule as the page — a participant is
  told their application is in, *not* that they have a place, and a waitlisted
  spectator is told plainly not to travel. Setup lives in `supabase/README.md`;
  every secret is a Supabase env var and none of them belong in this repo.
- **Copy honesty.** Participant availability is never a number: applications can
  exceed places, so the lineup reports open/waitlist and only spectator seats, which
  really are first-come, show a count. The filming line and the house rules describe
  a real policy — if the policy changes, the page changes the same day.
- The admin is `noindex` in both a meta tag and a Netlify header, and stays out of
  `sitemap.xml`. Do not `Disallow` it in `robots.txt` — a crawl block would hide the
  noindex.

## Mummy — the family request page (`/mummy/`)

A private page for the family (2026-10-09): sign in, press **Request**, tick any mix of
money (one or more lines, each a USD amount, a reason of at most 16 characters and how
soon, with a running total), a phone call (what about, how soon) and a message (what, how soon), send. One request row
(`kinds text[]`, `money_items jsonb`), one email.
The row lands in `requests` and a trigger emails the owner. Not a project: it is not
in `data/projects.js`, not in `sitemap.xml`, `noindex` in a meta tag and a Netlify
header, and not `Disallow`ed in `robots.txt`.

- **Same Supabase project as IRL**, own session. `scripts/mummy.js` creates its client
  with `createClient({ …, storageKey: "mummy.session", retryAnon: false })`, so signing
  out here never signs the IRL admin out. Any account in the project may file a request
  — the `admins` table gates IRL, not this. **Sign-in is by username:** the page maps
  `mummy` to `mummy@mummysboy.com` (a mailbox-less address under the site's own domain)
  because Supabase Auth only knows emails; one shared login (`mummy`) for now. Accounts
  are created in the dashboard, auto-confirmed, optionally with User Metadata
  `{"name": "Mummy"}` (else the capitalised username is the name); sign-ups stay off.
  No magic-link fallback — a username has nowhere to receive one. Setup is in
  `supabase/README.md`.
- **The database stamps who sent it.** `user_id`, `sender_email` and `sender_name` are
  column defaults read from the JWT, and the insert grant covers only
  `kinds, urgency, money_items, topic, body, message_urgency`, a CHECK ties each kind to its fields, and
  `public.money_items_ok()` checks every money line's shape. The client never sends identity fields;
  keep it that way. Anon has no grant on `requests`. Family read their own rows only.
- **Delivery is scheduled, per thing.** An insert trigger splits the request into
  `deliveries` rows (one per money line, one for the call, one for the message), each
  with a `due_at`: urgent → now, soon → next 7pm Pacific, whenever → next Tue/Thu 7pm
  Pacific; the message has `message_urgency`. `private.dispatch_due()` (called by the trigger, and every
  minute by a pg_cron job `mummy-dispatch`) claims due rows and hands their ids to
  `supabase/functions/request-email/index.ts`, which sends one digest per urgency and
  marks them sent; unsent claims are retried after ten minutes. Same fire-and-forget
  contract as IRL: errors swallowed, function always answers 200. The "Gets sent …"
  note under each How soon control states this schedule — keep the two in step.
  Subject lines triage themselves: an urgent email is titled **"Madre is caliente"**
  (the owner's choice, 2026-10-09); the 7pm and Tue/Thu digests read
  `[Today] Mummy needs $60.00 — groceries, bus fare · wants a call — the boiler`.
- **Design:** house dark tokens, `styles/mummy.css` scoped to `html[data-site="mummy"]`,
  never `irl.css` (its controls hang off `--ember`). Volt once per visible view (Sign in,
  Request, Send, the tick). "How soon?" is a three-up `aria-pressed` segmented control
  (Whenever / Soon / Urgent, default Soon) carried by fill + weight, never colour alone;
  one per money line, one in the call card and one in the message card (the `urgency`
  column is the call's, `message_urgency` the message's, each money line carries its own
  in `money_items`). The email's subject prefix is the most
  pressing of them.
  View swaps move focus to the new `<h1>`. No `consent.js`, `mediago.js` or analytics —
  a private signed-in page tracks nothing, and `/privacy/` does not list it.

## Conventions

- Plain ES modules; no TypeScript. Type the registry with the JSDoc typedef in `data/projects.js` so editors still autocomplete.
- Style with the token CSS vars only — no inline hex, no magic numbers for the palette. New rules go in `styles/styles.css`.
- Use semantic class names (`.card`, `.chip`, `.chip__dot--live`); keep them descriptive, not utility-soup.
- Copy is plain and confident. No exclamation marks, no "Welcome to", no filler adjectives. One sentence per project blurb.
- Accessibility: the site must always meet **WCAG 2.1 AA** — visible focus states (the `:focus-visible` rule uses `--volt` — that's its allowed second job), semantic HTML, contrast-checked text. See the [Accessibility](#accessibility-prerequisite) hard-constraint section for the full checklist.

---

## Commands

There is no build or lint step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 4321   # then open http://localhost:4321
# or: npx serve .
```

After any change, serve the site and confirm the homepage grid renders and both project routes resolve before reporting the task complete — **and check it at a phone width (375px)**, per the [Mobile](#mobile-prerequisite) rule. Quick non-browser sanity check: `node --check scripts/*.js data/*.js` to confirm everything parses.

---

## Adding a project (the common task)

1. Add one entry to `data/projects.js`.
2. If it's a nested route (no `href`), create `<slug>/index.html` — copy an existing one and change `<body data-project="…">`, the `<title>`, and the visible fallback name. If it links out, set `href` and you're done.
3. Confirm the homepage grid picks it up automatically — do not edit `index.html` or `scripts/main.js` to list it.
4. Serve and eyeball it.

---

## Adding a Gig blog post

The blog is a **second registry-driven system**, mirroring the projects one — `data/posts.js` is its single source of truth, and `scripts/blog.js` renders the `/gig/blog/` index grid (`#post-grid`) and the "more reading" links between articles. The `esc()` helper escapes anything injected with `innerHTML` — keep using it.

1. Add one entry to `data/posts.js` (typed with the `Post` JSDoc typedef).
2. Create the article at `gig/blog/<slug>/index.html`. The **article body is authored static HTML, not JS** — that's deliberate, so the prose is fully crawlable. Copy the existing post and set `<body data-post="<slug>">` so it's excluded from its own "more reading" list.
3. Don't hardcode cards in the index — `blog.js` fills the grid from the registry.
4. Add the new URL to `sitemap.xml` (it's a static file — new routes and posts don't appear until you add them).

---

## When unsure

Ask before: adding dependencies, introducing a new color, changing the grid/layout system, or anything that touches more than the registry to add a project. Default to restraint.

*Built to make mummy proud.*
