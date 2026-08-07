// Which country is this visitor in? Netlify resolves it at the edge and hands it to us in
// `context.geo`, so this is the one honest answer available to an otherwise static site.
//
// scripts/consent.js needs it to pick a privacy regime: opt-in under UK GDPR / PECR, notice
// and opt-out under CPRA. Its fallback is the browser timezone, which is a guess — a British
// visitor whose laptop clock is set to New York reads as US and would be tracked without
// being asked. This endpoint is what removes that guess.
//
// Deliberately a single JSON endpoint rather than an edge rewrite of every page: only this
// path runs through a function, so the rest of the site stays plain static delivery and an
// outage here cannot take the site down with it. consent.js treats a failure as "strict".
//
// Deno at the edge — no build step, no dependencies, consistent with the rest of the repo.
export default async (request, context) => {
  const geo = (context && context.geo) || {};
  const country = (geo.country && geo.country.code) || "";
  // subdivision = US state. Not used for the regime today (the state privacy laws we honour
  // converge on the same notice-and-opt-out behaviour), but it is free here and is what a
  // future state-specific rule would need.
  const region = (geo.subdivision && geo.subdivision.code) || "";

  return new Response(JSON.stringify({ country, region }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Per-visitor and never shareable: a cached US answer served to a UK visitor is the
      // exact failure this endpoint exists to prevent.
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
};

export const config = { path: "/edge/geo" };
