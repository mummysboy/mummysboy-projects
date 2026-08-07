// MediaGo advertising pixel + store-CTA conversion tracking.
//
// This site has no build step and no shared layout, so the vendor's inline snippet lives
// here once and every page loads it with a single <script src> in its <head>. The paired
// <noscript> pageview image stays inline at the top of each <body> (it has to — a script
// can't help a visitor with scripting off).
//
// It is deliberately a classic script, not an ES module: modules are deferred until after
// the document parses, and an ad pixel wants to fire on the page view it is measuring.
//
// This is entirely separate from scripts/gig-analytics.js. That is our own first-party
// funnel and stays the source of truth for CTA numbers; this reports the same taps to
// MediaGo so ad spend can be attributed. Like that module, everything here is wrapped and
// fire-and-forget — a tracking failure must never throw or affect the page.
(function () {
  "use strict";

  var ACID = "32781";
  var PXD = "170256161746704";
  var TN = "f9f2b1ef23fe2759c2cad0953029a94b";
  var CONVERSION = "App Store Button Click Lead";

  var CONV_URL =
    "//trace.mediago.io/api/bidder/track/pixel/conversion?cvn=" +
    encodeURIComponent(CONVERSION) +
    "&acid=" +
    ACID +
    "&pxd=" +
    PXD +
    "&tn=" +
    TN;

  function queue() {
    window._megoaa = window._megoaa || [];
    return window._megoaa;
  }

  // --- Consent gate ----------------------------------------------------------------
  // scripts/consent.js decides whether advertising tech may run at all: opt-in in the
  // UK/EEA, opt-out (plus Global Privacy Control) in the US. Nothing below touches the
  // network until it says yes.
  var granted = false;

  // --- Base pixel -----------------------------------------------------------------
  var started = false;

  function startPixel() {
    if (started) return; // onChange fires immediately and again on every change
    started = true;
    try {
      var q = queue();
      q.push({ type: "event", name: "pageview", acid: ACID });
      q.push({ type: "nextjump", link: ["www.mummysboy.com"] });

      if (!document.getElementById("pixel_megoaa_script")) {
        var t = document.createElement("script");
        t.async = 1;
        t.src = "//cdn.mediago.io/js/pixel.js?acid=" + ACID;
        t.id = "pixel_megoaa_script";
        var f = document.getElementsByTagName("script")[0];
        if (f && f.parentNode) f.parentNode.insertBefore(t, f);
        else (document.head || document.documentElement).appendChild(t);
      }
    } catch (e) {
      /* never let the pixel break the page */
    }
  }

  // No consent module means no way for a visitor to say no, so the safe failure is
  // silence — a broken gate must not become an open one.
  if (window.mbConsent) {
    window.mbConsent.onChange(function (ok) {
      granted = ok;
      if (ok) {
        startPixel();
      } else if (started) {
        // Withdrawal has to actually stop the tracking, and a third-party script cannot be
        // unloaded once it is running. Reloading is the only honest way to end it on the
        // page the visitor opted out from; the gate keeps it out on every load after this.
        // Guarded on `started`, so the immediate first onChange never triggers it.
        location.reload();
      }
    });
  }

  // --- Conversion: App Store / Google Play button clicks ---------------------------

  // Store links navigate in place — no target="_blank" anywhere, per CLAUDE.md, because a
  // new tab is silently dead inside the Instagram/Facebook webviews. So the conversion has
  // to survive the document going away rather than delay it: we do NOT preventDefault and
  // we do NOT hold the redirect. fetch(keepalive) is the transport that is specified to
  // outlive the page; the DOM <img> below is the fallback for browsers without it and is
  // the exact request the <noscript> tag would have made.
  //
  // The URL is byte-identical on every click, so cache:"no-store" (and the `_` buster on the
  // <img> path, which can't set a cache mode) keeps a second conversion in the same session
  // from being answered out of the browser's cache instead of reaching MediaGo.
  function sendBackupPixel() {
    try {
      if (window.fetch) {
        fetch(CONV_URL, {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          keepalive: true,
          credentials: "include",
        }).catch(function () {});
        return;
      }
    } catch (e) {
      /* fall through to the image */
    }
    try {
      var img = document.createElement("img");
      img.width = 0;
      img.height = 0;
      img.style.display = "none";
      img.alt = "";
      img.src = CONV_URL + "&_=" + Date.now(); // an <img> can't set a cache mode
      (document.body || document.documentElement).appendChild(img);
    } catch (e) {
      /* nothing else to try */
    }
  }

  // Repeat-tap guard, same reasoning as gig-analytics.js: a CTA that appears not to respond
  // invites frantic re-tapping, and each of those taps would otherwise report as a separate
  // lead and inflate the campaign's conversion count. One tap is one intent.
  var DEDUPE_MS = 3000;
  var lastFired = 0;

  function fireConversion() {
    if (!granted) return; // re-checked at click time: consent can be withdrawn mid-visit

    var now = Date.now();
    if (now - lastFired < DEDUPE_MS) {
      lastFired = now; // sliding window: an unbroken burst collapses to one lead
      return;
    }
    lastFired = now;

    try {
      queue().push({ type: "event", name: CONVERSION, acid: ACID, pxd: PXD });
    } catch (e) {
      /* keep going — the backup pixel is the one that must not be skipped */
    }
    sendBackupPixel();
  }

  // Capture phase so the conversion is recorded even if something downstream stops
  // propagation. Matches the same hooks gig-analytics.js uses: any App Store link, any Play
  // Store link, and (should the Android beta modal ever come back) its opener.
  function isStoreCta(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest('a[href*="apps.apple.com"]') ||
      el.closest('a[href*="play.google.com"]') ||
      el.closest("#androidBtn") ||
      el.closest(".js-android-open")
    );
  }

  document.addEventListener(
    "click",
    function (e) {
      try {
        var el = e.target && e.target.closest ? e.target.closest("a, button") : null;
        if (isStoreCta(el)) fireConversion();
      } catch (err) {
        /* never let tracking throw out of a click handler */
      }
    },
    true
  );

  // Keyboard activation of a link fires a click event too, so the listener above covers it.
  // Exposed for console verification and for any future non-link CTA.
  window.mediagoTrackStoreClick = fireConversion;
})();
