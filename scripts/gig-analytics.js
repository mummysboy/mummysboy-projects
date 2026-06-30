// First-party analytics for the Gig landing page. Records a page view, store-CTA clicks
// (tagged by on-page position), how far down the page visitors scroll, off-page exits, and
// the TRUE Android beta funnel (modal open vs invite submit). Everything POSTs a tiny beacon
// to the Gig backend; the counts surface in the moderation dashboard's "Landing page" view.
// Best-effort only — every call is fire-and-forget and wrapped so a tracking failure never
// affects the page.
const BACKEND = "https://backend-production-9a98f.up.railway.app";
const PATH = "/gig";

// A/B hero variant id — project.js (or any experiment flag) may set window.__gigVariant
// before this module runs; otherwise we read <html data-variant> (default "v2").
const VARIANT = (window.__gigVariant || document.documentElement.dataset.variant || "v2").slice(0, 24);

// Per-link source/campaign id from the URL: ?id= (or ?ref / ?utm_source / ?utm_campaign), or
// a /gig/id=VALUE path. Sanitized to a short code and persisted for the whole visit (so a tap
// 30s after landing is still credited to the link the visitor arrived on).
function readSrcId() {
  try {
    const q = new URLSearchParams(location.search);
    let raw = q.get("id") || q.get("ref") || q.get("utm_source") || q.get("utm_campaign");
    if (!raw) {
      const m = location.pathname.match(/\/id=([^/]+)/i); // /gig/id=56
      if (m) raw = decodeURIComponent(m[1]);
    }
    const clean = raw ? raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) : null;
    if (clean) sessionStorage.setItem("@gig_src_id", clean);
    return clean || sessionStorage.getItem("@gig_src_id");
  } catch {
    return null;
  }
}
const SRC_ID = readSrcId();

function track(type, label) {
  try {
    const body = JSON.stringify({
      type,
      path: PATH,
      referrer: document.referrer || "",
      label: label || null,
      variant: VARIANT,
      srcId: SRC_ID || null,
    });
    // keepalive lets the request survive a navigation (e.g. the iOS link opening the App
    // Store). sendBeacon is the ideal transport but can't set JSON content type, so we use
    // fetch+keepalive and fall back to sendBeacon if fetch is gone.
    if (window.fetch) {
      fetch(`${BACKEND}/landing-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
    } else if (navigator.sendBeacon) {
      navigator.sendBeacon(`${BACKEND}/landing-event`, body);
    }
  } catch {
    /* never let analytics throw */
  }
}

// Expose so android-access.js can record the real Android funnel (open vs submit).
window.gigTrack = track;

// One page view per load (carries the active variant).
track("view");

// Click attribution. iOS = any App Store link; Android = the beta-invite triggers; exit =
// any element marked data-exit (wordmark, blog, social, legal). label = nearest data-pos
// (hero | closing | status) for store CTAs, or the data-exit value for exits.
document.addEventListener("click", (e) => {
  const el = e.target.closest("a, button");
  if (!el) return;
  const posEl = el.closest("[data-pos]");
  const pos = posEl ? posEl.getAttribute("data-pos") : null;

  if (el.closest('a[href*="apps.apple.com"]')) {
    track("ios", pos);
  } else if (el.id === "androidBtn" || el.classList.contains("js-android-open")) {
    track("android", pos);
  } else {
    const exitEl = el.closest("[data-exit]");
    if (exitEl) track("exit", exitEl.getAttribute("data-exit"));
  }
});

// Section reach — fire once when each [data-section] scrolls into view, so we can see how
// far the funnel actually gets (does anyone even reach the closing CTA?).
if ("IntersectionObserver" in window) {
  const seen = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const name = en.target.getAttribute("data-section");
        if (name && !seen.has(name)) {
          seen.add(name);
          track("section", name);
        }
        io.unobserve(en.target);
      }
    },
    { threshold: 0.4 }
  );
  document.querySelectorAll("[data-section]").forEach((el) => io.observe(el));
}
