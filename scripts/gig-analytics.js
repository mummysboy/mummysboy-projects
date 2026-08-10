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

// Advertising click id — the network's own per-click key, and the only field that lets their
// serving log and ours be compared row for row. Without it a paid campaign can only be argued
// about in aggregates: on 2026-08-10 MediaGo answered a location complaint by pointing out that
// ad-request geo and observed IP geo legitimately disagree (VPNs, carrier routing, differing
// GeoIP databases), which is true and unfalsifiable from view counts alone. The click id is what
// settles it — the same id arriving on several loads from different DEVICE CLASSES is a fan-out,
// and device class is read from the User-Agent, so no IP argument touches it.
//
// Two sources, in order:
//   1. A `clickid`-style query param, once the network is asked to append its macro to the
//      destination URL (the reliable path — every visit carries one).
//   2. Failing that, `trackingid=` parsed out of document.referrer. Click trackers pass their
//      own URL as the referrer, so this recovers an id with no cooperation from the network at
//      all — it is how the 2026-08-10 samples were obtained, and it keeps working for any
//      network that hasn't been asked for a macro yet. Partial coverage by nature: the referrer
//      survives only some redirect chains.
// Persisted for the visit like SRC_ID, so a store tap 30s after landing still carries it.
function readClickId() {
  try {
    const q = new URLSearchParams(location.search);
    // Common macro names across networks; ours is `clickid`, the rest cost nothing to accept.
    let raw =
      q.get("clickid") ||
      q.get("click_id") ||
      q.get("trackingid") ||
      q.get("gclid") ||
      q.get("msclkid") ||
      q.get("ttclid") ||
      q.get("fbclid");
    if (!raw && document.referrer) {
      const m = document.referrer.match(/[?&]trackingid=([A-Za-z0-9._~=-]+)/);
      if (m) raw = m[1];
    }
    if (!raw) return sessionStorage.getItem("@gig_click_id");
    // A macro the network never filled in arrives literally, and storing one would be worse
    // than storing nothing: the SAME fake id would land on every visit, reading back as the
    // most extreme fan-out imaginable. Delimiters vary by network — MediaGo's is
    // ${TRACKING_ID}, others use {CLICK_ID}, [CLICKID] or __CLICKID__ — and any of them can
    // arrive percent-encoded, so decode before looking. Note '$' is why this check cannot
    // just test the first character.
    let val = raw;
    try { val = decodeURIComponent(raw); } catch { /* not valid encoding — judge the raw value */ }
    if (/[{}$[\]]/.test(val) || /^__/.test(val)) return sessionStorage.getItem("@gig_click_id");
    const clean = val.replace(/[^A-Za-z0-9._~=-]/g, "").slice(0, 128);
    // Belt and braces: some networks drop the delimiters and send the bare macro name, which
    // would otherwise survive sanitizing as a perfectly valid-looking id.
    if (!clean || /^(tracking_?id|click_?id|cid|clickid|clicktrackingid)$/i.test(clean)) {
      return sessionStorage.getItem("@gig_click_id");
    }
    sessionStorage.setItem("@gig_click_id", clean);
    return clean;
  } catch {
    return null;
  }
}
const CLICK_ID = readClickId();

// Session id — one random value shared by every beacon this page load emits, so a visit can
// be read as a visit. Without it each row is independent and the only way to ask "did THIS
// visitor scroll?" is to correlate on timestamps, which answers for a population and not for
// anyone in particular: we can say iOS traffic reaches the footer 4.7% of the time, but not
// that a given click id's session stopped at the hero. That second question is the one an ad
// network asks when it wants to trace a specific placement.
//
// Deliberately per-PAGE-LOAD and deliberately NOT persisted — no cookie, no sessionStorage.
// Module scope already lives exactly as long as the document, so a store tap 30s after
// landing shares the id while a second page load gets a fresh one. Persisting it would merge
// two loads into one funnel and hide the double-render pattern that is the whole reason this
// exists, and it would quietly turn an analytics field into a durable visitor identifier.
// Keep it ephemeral.
const SESSION_ID = (() => {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* fall through to the non-crypto id below */
  }
  // Last resort for old browsers. Uniqueness here only has to hold within a day's traffic,
  // not cryptographically — a collision costs one mis-grouped funnel, nothing more.
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
})();

// Device split from the pre-paint UA class (set in each page's <head>). The primary
// metric is iOS badge taps — without this dimension a variant that happens to draw
// more Android traffic would look artificially weak.
const OS = document.documentElement.classList.contains("is-ios")
  ? "ios"
  : document.documentElement.classList.contains("is-android")
    ? "android"
    : "desktop";

// Apple App Analytics campaign attribution. Set APPLE_PT to the account's provider
// token (App Store Connect → App Analytics → Acquisition → Campaigns → Generate
// Campaign Link — the pt= value in the generated URL). While it's empty, links are
// left untouched. With it set, every App Store link is tagged pt/ct/mt so Apple's
// install numbers line up with the first-party variant × srcId funnel.
const APPLE_PT = "";
if (APPLE_PT) {
  const ct = (VARIANT + (SRC_ID ? `-${SRC_ID}` : ""))
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 40);
  document.querySelectorAll('a[href*="apps.apple.com"]').forEach((a) => {
    try {
      const url = new URL(a.href);
      url.searchParams.set("pt", APPLE_PT);
      url.searchParams.set("ct", ct);
      url.searchParams.set("mt", "8");
      a.href = url.toString();
    } catch {
      /* leave the link as-is */
    }
  });
}

function track(type, label) {
  try {
    const body = JSON.stringify({
      type,
      path: PATH,
      referrer: document.referrer || "",
      label: label || null,
      variant: VARIANT,
      srcId: SRC_ID || null,
      os: OS,
      clickId: CLICK_ID || null,
      sessionId: SESSION_ID,
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

// Repeat-tap guard. A CTA that fails to navigate invites frantic re-tapping, and since the
// handler below never preventDefaults, every one of those taps would beacon as a separate
// conversion (on 2026-07-30 a single visitor logged 18 "iOS clicks" in 28 seconds against a
// dead target="_blank" badge, tripling the day's apparent CTR). One tap on one CTA is one
// intent, so collapse repeats of the same (type,label) inside a short window. Clicks only —
// the section observer already fires once per page, and the Android funnel in
// android-access.js calls window.gigTrack directly, so its ordered steps are untouched.
// The window slides: each tap pushes it out, so an unbroken burst of any length collapses to
// the single beacon that opened it. A fixed window would still leak one beacon every 3s, which
// is how the original 28-second burst would have survived as ~10 "conversions" instead of 18.
const CLICK_DEDUPE_MS = 3000;
const lastClick = new Map();
const repeatReported = new Set();
function trackClick(type, label) {
  const key = `${type}|${label || ""}`;
  const now = Date.now();
  const prev = lastClick.get(key);
  lastClick.set(key, now);
  if (prev && now - prev < CLICK_DEDUPE_MS) {
    // Suppressed as a repeat — but don't just drop it on the floor. Collapsing the burst makes
    // the conversion metric honest and, on its own, makes a dead CTA look exactly like a
    // working one. So report the *fact* of repeat-tapping once per CTA per page: nobody taps a
    // button that visibly worked, and this is the signal that would have surfaced the
    // target="_blank" breakage on day one instead of via a CTR that looked too good.
    if (!repeatReported.has(key)) {
      repeatReported.add(key);
      track("cta_repeat", label);
    }
    return;
  }
  track(type, label);
}

// Click attribution. iOS = any App Store link; Android = any Play Store link; exit =
// any element marked data-exit (wordmark, blog, social, legal). label = nearest data-pos
// (hero | closing | status) for store CTAs, or the data-exit value for exits.
document.addEventListener("click", (e) => {
  const el = e.target.closest("a, button");
  if (!el) return;
  const posEl = el.closest("[data-pos]");
  const pos = posEl ? posEl.getAttribute("data-pos") : null;

  if (el.closest('a[href*="apps.apple.com"]')) {
    trackClick("ios", pos);
  } else if (el.closest('a[href*="play.google.com"]')) {
    trackClick("android", pos);
  } else {
    const exitEl = el.closest("[data-exit]");
    if (exitEl) trackClick("exit", exitEl.getAttribute("data-exit"));
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
