// First-party analytics for the Gig landing page. Records a page view on load and a
// click on each store CTA, by POSTing a tiny beacon to the Gig backend. The counts
// surface in the local moderation dashboard's "Landing" view. Best-effort only —
// every call is fire-and-forget and wrapped so a tracking failure never affects the page.
const BACKEND = "https://backend-production-9a98f.up.railway.app";
const PATH = "/gig";

function track(type) {
  try {
    const body = JSON.stringify({
      type,
      path: PATH,
      referrer: document.referrer || "",
    });
    // keepalive lets the request survive a navigation (e.g. the iOS link opening
    // the App Store). sendBeacon is the ideal transport but can't set JSON content
    // type, so we use fetch+keepalive and fall back to sendBeacon if fetch is gone.
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

// One page view per load.
track("view");

// CTA clicks. iOS = any App Store link; Android = the beta-invite triggers.
document.addEventListener("click", (e) => {
  const el = e.target.closest("a, button");
  if (!el) return;
  if (el.closest('a[href*="apps.apple.com"]')) {
    track("ios");
  } else if (el.id === "androidBtn" || el.classList.contains("js-android-open")) {
    track("android");
  }
});
