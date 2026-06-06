/**
 * The single source of truth for the hub. Add a project = one entry here.
 *
 * @typedef {Object} Project
 * @property {string}  slug    Route segment, e.g. "gig" → /gig/.
 * @property {string}  name
 * @property {string}  blurb   One clean sentence, no marketing fluff.
 * @property {"live"|"building"|"concept"} status
 * @property {string[]} tags
 * @property {string} [href]   External link; omit if it's a nested route.
 */

/** @type {Project[]} */
export const projects = [
  {
    slug: "gig",
    name: "Gig",
    blurb: "A commission-free marketplace for services, both locally and across the globe.",
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
