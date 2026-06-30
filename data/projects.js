/**
 * The single source of truth for the hub. Add a project = one entry here.
 *
 * @typedef {Object} Project
 * @property {string}  slug    Route segment, e.g. "gig" → /gig/.
 * @property {string}  name
 * @property {string}  blurb   One clean sentence (used on the hub index card).
 * @property {"live"|"building"|"concept"} status
 * @property {string[]} tags
 * @property {string} [href]   External link; omit if it's a nested route.
 * @property {string} [titleTag]   Optional SEO <title> for the project page (else "{name} — mummysboy").
 * @property {string} [headline]   Optional benefit headline for the page H1 (else {name}).
 * @property {string} [heroBlurb]  Optional longer hero lede for the page (else {blurb}).
 */

/** @type {Project[]} */
export const projects = [
  {
    slug: "gig",
    name: "Gig",
    blurb: "A commission-free marketplace for services, both locally and across the globe.",
    // Conversion-tuned fields for the /gig page (the static markup carries the same copy as
    // a default; these keep it in sync after project.js runs, and are the A/B swap points).
    titleTag: "Gig — Commission-Free Local Services Marketplace | Find or Offer Help",
    headline: "Say what you need. The right local pro shows up — commission-free.",
    heroBlurb:
      "Describe a job in plain language — “fix my leaking sink,” “tutor for 8th-grade math” — and the best-matched providers surface, ranked by rating and distance. One profile works both sides: hire help or get hired. No commissions, no fees, ever.",
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
