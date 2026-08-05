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
  {
    slug: "how-to-make-money-offering-services",
    title: "How to Make Money Offering Local Services (and Keep 100% of It)",
    excerpt:
      "Offer a skill you already have, set up a profile in about a minute, and keep everything you earn. The one number that decides your take-home is the platform's commission — and on Gig it's 0%.",
    date: "2026-07-13",
    dateLabel: "July 13, 2026",
    readMins: "5 min",
    tags: ["make-money", "how-to", "commission-free"],
    image:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=70",
    alt: "People working together with laptops around a shared table.",
  },
  {
    slug: "find-local-help-near-you",
    title: "How to Find Local Help Near You (Without Paying Booking Fees)",
    excerpt:
      "What to actually type, the four signals that predict a good job, and why the fee sitting on top of your quote is worth paying attention to. Gig adds no booking fee.",
    date: "2026-08-04",
    dateLabel: "August 4, 2026",
    readMins: "7 min",
    tags: ["hire-local", "how-to", "no-fees"],
    image:
      "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=70",
    alt: "Two people shaking hands across a table in an office.",
  },
  {
    slug: "local-service-side-hustle-ideas",
    title: "21 Local Service Side Hustles You Can Start This Week",
    excerpt:
      "No inventory, no website, no startup capital. Twenty-one services built on things you can already do — and the honest version of what each one takes.",
    date: "2026-08-04",
    dateLabel: "August 4, 2026",
    readMins: "8 min",
    tags: ["side-hustle", "ideas", "make-money"],
    image:
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=70",
    alt: "A person in yellow rubber gloves and a face mask cleaning a window shutter.",
  },
  {
    slug: "how-to-price-your-services",
    title: "How to Price Your Local Services (Without Undercharging)",
    excerpt:
      "Find the floor below which you lose money, check what your area really pays, and see how much a 20% commission forces you to add. Worked example included.",
    date: "2026-08-04",
    dateLabel: "August 4, 2026",
    readMins: "7 min",
    tags: ["pricing", "how-to", "make-money"],
    image:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=70",
    alt: "Tax forms, a calculator and a pen laid out on a white table.",
  },
  // add the next post here ↓
];
