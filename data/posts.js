/**
 * Source of truth for the Gig blog. Add a post = one entry here, then author
 * its static article at /gig/blog/<slug>/index.html (the article body lives in
 * HTML, not JS, so it's fully crawlable). This registry drives the index grid
 * and the "more reading" links between posts.
 *
 * @typedef {Object} Post
 * @property {string}  slug      Route segment → /gig/blog/<slug>/.
 * @property {string}  title     Headline as shown in the index card.
 * @property {string}  excerpt   One- or two-sentence dek, no marketing fluff.
 * @property {string}  date      ISO date, e.g. "2026-06-05".
 * @property {string}  dateLabel Human date, e.g. "June 5, 2026".
 * @property {string}  readMins  Reading time, e.g. "5 min".
 * @property {string[]} tags
 * @property {string}  image     Hero/thumbnail URL.
 * @property {string}  alt       Alt text for the thumbnail.
 */

/** @type {Post[]} */
export const posts = [
  {
    slug: "commission-free-services-marketplace",
    title: "Commission-Free, No Middleman: How Gig Actually Works",
    excerpt:
      "Every other marketplace skims 15–30% off your work and sits in the middle of your money. Gig takes 0% and never touches the payment — and makes its money a different way.",
    date: "2026-06-05",
    dateLabel: "June 5, 2026",
    readMins: "6 min",
    tags: ["commission-free", "marketplace", "the-store"],
    image:
      "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=70",
    alt: "Shopping bags arranged on a dark background.",
  },
  // add the next post here ↓
];
