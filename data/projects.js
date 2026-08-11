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
    // Hero copy now lives ONLY in the landing pages themselves (the campaign variant
    // system authors it per page — see CLAUDE.md → Gig landing variants), so there are
    // no headline/heroBlurb swap fields here anymore. titleTag still sets /gig/'s <title>.
    titleTag: "Gig — Commission-Free Local Services Marketplace | Find or Offer Help",
    status: "live",
    tags: [],
  },
  {
    slug: "rfcfinder",
    name: "RFC Finder",
    blurb: "A location-based directory for finding rugby clubs.",
    titleTag: "RFC Finder — Find a Rugby Club Near You | Rugby Football Club Finder",
    headline: "Find a rugby club, wherever you land.",
    heroBlurb:
      "Enter a location, set a radius, and see every club in range on a map and in a list — with the details you need to actually turn up.",
    status: "live",
    tags: ["directory", "rugby", "maps"],
  },
  {
    slug: "irldatingshows",
    name: "IRL",
    blurb: "Live dating shows, hosted at real venues.",
    titleTag: "IRL — Live Dating Shows at Real Venues | Play or Watch",
    status: "building",
    tags: ["events", "nightlife"],
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
