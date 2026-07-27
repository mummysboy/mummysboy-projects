// Desktop "scan to install" bridge for the Gig landing arms.
//
// Email campaigns land people on a desktop, where a store badge can't install
// anything — this draws a QR into every [data-qr] slot so a visitor can move to
// their phone in one motion. Rendered client-side (rather than shipped as an image
// file) for two reasons: the code carries the visitor's own campaign id through to
// the phone, and there's no static asset to cache-bust when the URL changes.
//
// Phones don't get it — they can't scan their own screen — so the slot only shows
// on `html.is-desktop`, the pre-paint UA class each page's <head> sets.
import { qrSvg } from "./qr.js";

// Always encode the canonical production origin: a QR scanned off a localhost or
// deploy-preview screen still has to resolve on someone's phone.
const ORIGIN = "https://mummysboy.com";

// Campaign id, read the same way gig-analytics.js reads it (query first, then the
// visit-scoped copy it stores). Duplicated deliberately — analytics is best-effort
// and this must not depend on it having loaded.
function srcId() {
  try {
    const q = new URLSearchParams(location.search);
    let raw = q.get("id") || q.get("ref") || q.get("utm_source") || q.get("utm_campaign");
    if (!raw) {
      const m = location.pathname.match(/\/id=([^/]+)/i);
      if (m) raw = decodeURIComponent(m[1]);
    }
    const clean = raw ? raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) : null;
    return clean || sessionStorage.getItem("@gig_src_id");
  } catch {
    return null;
  }
}

// Same arm, same campaign, tagged as a scan: a phone that arrives from the code is
// credited to the email that produced the desktop visit, not to bare organic.
function scanUrl() {
  let path = location.pathname.replace(/\/id=[^/]*/i, "/"); // drop the pretty campaign segment
  if (!path.endsWith("/")) path += "/";
  const id = srcId();
  const tag = id ? `${id.slice(0, 37)}-qr` : "qr";
  return `${ORIGIN}${path}?id=${encodeURIComponent(tag)}`;
}

const slots = document.querySelectorAll("[data-qr]");
if (slots.length && document.documentElement.classList.contains("is-desktop")) {
  const url = scanUrl();
  const pretty = url.replace(/^https:\/\//, "").replace(/\?.*$/, "");
  try {
    const svg = qrSvg(url, {
      label: `QR code — opens ${pretty} on your phone`,
      // Fixed near-black on white regardless of theme: scanners want maximum contrast,
      // and the landing arms already render on an App Store white page.
      dark: "#0b0b0d",
      light: "#ffffff",
    });
    slots.forEach((slot) => {
      const target = slot.querySelector("[data-qr-code]") || slot;
      target.innerHTML = svg;
      slot.classList.add("scan--ready");
    });
  } catch {
    /* leave the slot hidden — the store badges still carry the page */
  }
}
