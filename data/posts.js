/**
 * Source of truth for the Gig blog. Add a post = one entry here, then author
 * its static article at /gig/blog/<slug>/index.html (the article body lives in
 * HTML, not JS, so it's fully crawlable). This registry drives the index grid
 * and the "more reading" links between posts. Newest first — the index and
 * each article's "more reading" list follow this order, so add a post at the top.
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
    slug: "how-to-get-your-first-local-clients",
    title: "How to Get Your First Local Service Clients (Without Paying for Leads)",
    excerpt:
      "List one specific service, show up where people already look, and don't pay for an introduction that might not book. On Gig the listing is free and the commission is 0% — the first booking still depends on demand near you.",
    date: "2026-09-21",
    dateLabel: "September 21, 2026",
    readMins: "7 min",
    tags: ["get-clients", "make-money", "no-fees"],
    image:
      "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1200&q=70",
    alt: "A worker in a yellow hard hat and gloves repairing an outdoor electrical box.",
  },
  {
    slug: "how-easy-is-gig-to-use",
    title: "How Easy Is Gig to Use? About a Minute to Set Up",
    excerpt:
      "Download it, sign in with Apple, Google, or email, and either describe the job in a sentence or list what you do. No category maze, no subscription, no fee to start. The booking itself is still a short conversation.",
    date: "2026-09-15",
    dateLabel: "September 15, 2026",
    readMins: "5 min",
    tags: ["how-to", "getting-started", "ease"],
    image:
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=70",
    alt: "An iPhone on a pale wooden table with the home screen open.",
  },
  {
    slug: "is-gig-safe",
    title: "Is Gig Safe? What Protects You, and What It Doesn't",
    excerpt:
      "Apple or Google sign-in, two-way ratings, and in-app messages you can leave. Gig does not run background checks, check licenses, or hold the payment — here is the honest split.",
    date: "2026-09-08",
    dateLabel: "September 8, 2026",
    readMins: "6 min",
    tags: ["safety", "trust", "hiring"],
    image:
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=70",
    alt: "A wooden house at dusk with the lights on and a path to the front door.",
  },
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
  // Older posts above this line. Add the next one at the top of the array.
];
