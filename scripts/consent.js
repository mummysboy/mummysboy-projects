// Privacy consent for the one third-party tracker on this site (scripts/mediago.js).
//
// Two legal regimes, two behaviours, one banner:
//
//   strict (UK / EEA — UK GDPR + PECR, ePrivacy)
//       OPT-IN. Nothing loads until the visitor accepts. Accept and Reject are the same
//       size, weight, and colour — "equally prominent" is the actual requirement, not a
//       nicety, and it is why this banner spends no volt on a preferred answer.
//
//   us (United States — CPRA and the state laws modelled on it)
//       OPT-OUT. Notice at collection, tracking runs, and the visitor can opt out at any
//       time from the banner or the permanent footer link. Global Privacy Control is
//       honoured as a valid opt-out signal.
//
// Everywhere else falls back to strict, because guessing wrong in that direction only
// costs measurement, and guessing wrong the other way is the violation.
//
// This must load BEFORE scripts/mediago.js — it defines window.mbConsent, which the pixel
// waits on. Classic script, not a module, for the same reason: modules defer until after
// parse and the gate has to exist before anything can ask it.
(function () {
  "use strict";

  var KEY = "mb.consent.v1";
  var PRIVACY_URL = "https://backend-production-9a98f.up.railway.app/privacy";

  // ---- Region -------------------------------------------------------------------
  // Timezone is the only region signal available to a static site — Netlify publishes the
  // repo as-is, so there is no server to read a geo header and no geo-IP lookup that would
  // not itself be a third-party call needing consent. It is an inference, not a fact: a
  // British visitor with their laptop clock on New York time is read as US. That is the
  // known limit of doing this without a backend.
  var US_ZONES = [
    "America/New_York", "America/Detroit", "America/Chicago", "America/Denver",
    "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Adak",
    "America/Juneau", "America/Sitka", "America/Metlakatla", "America/Yakutat",
    "America/Nome", "America/Boise", "America/Menominee", "Pacific/Honolulu",
    "America/Puerto_Rico", "Pacific/Guam", "Pacific/Saipan", "America/St_Thomas",
  ];
  // Indiana, Kentucky and North Dakota split into per-county zones.
  var US_PREFIXES = ["America/Indiana/", "America/Kentucky/", "America/North_Dakota/"];

  function detectRegime() {
    var tz = "";
    try {
      tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "").trim();
    } catch (e) {
      return "strict";
    }
    if (US_ZONES.indexOf(tz) !== -1) return "us";
    for (var i = 0; i < US_PREFIXES.length; i++) {
      if (tz.indexOf(US_PREFIXES[i]) === 0) return "us";
    }
    return "strict";
  }

  var REGIME = detectRegime();
  var GPC = navigator.globalPrivacyControl === true;

  // ---- Stored decision ----------------------------------------------------------
  // src distinguishes a deliberate click ("user") from one we inferred ("gpc"), which is
  // what lets an explicit later choice override the browser signal without the signal
  // being ignored by default.
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || (o.state !== "granted" && o.state !== "denied")) return null;
      return o;
    } catch (e) {
      return null; // private mode, storage disabled, corrupt value — treat as undecided
    }
  }

  function write(state, src) {
    stored = { state: state, src: src, regime: REGIME, ts: Date.now() };
    try {
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch (e) {
      /* the in-memory value still governs this page view */
    }
  }

  var stored = read();

  // The decision that actually applies right now. GPC sets the default, an explicit click
  // beats it — CPRA wants the signal honoured, not a visitor's own later choice discarded.
  function decision() {
    if (stored && stored.src === "user") return stored.state;
    if (GPC) return "denied";
    if (stored) return stored.state;
    return null; // undecided
  }

  // May we run advertising tech at this moment? Opt-in vs opt-out lives here and nowhere
  // else: under CPRA an undecided US visitor is tracked, under PECR they are not.
  function allowed() {
    var d = decision();
    if (d === "granted") return true;
    if (d === "denied") return false;
    return REGIME === "us";
  }

  var listeners = [];
  function notify() {
    var v = allowed();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](v);
      } catch (e) {
        /* one bad subscriber must not stop the others */
      }
    }
  }

  // ---- Copy ---------------------------------------------------------------------
  var COPY = {
    strict: {
      text:
        "We'd like to set advertising cookies so we can measure which ads bring people here. " +
        "Nothing is set unless you accept, and you can change this any time.",
      yes: "Accept",
      no: "Reject",
      link: "Cookie settings",
    },
    us: {
      text:
        "We share limited device and activity data with our advertising partners to measure " +
        "our ads. You can opt out at any time.",
      yes: "Got it",
      no: "Opt out",
      link: "Your privacy choices",
    },
  };
  var copy = COPY[REGIME];

  // ---- Banner -------------------------------------------------------------------
  var banner = null;
  var trigger = null; // the footer link, when the banner was reopened from it
  var status = null;

  function announce(msg) {
    if (!status) {
      status = document.createElement("p");
      status.className = "sr-only";
      status.setAttribute("role", "status");
      document.body.appendChild(status);
    }
    status.textContent = msg;
  }

  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function measure() {
    if (!banner) return;
    // Keep the fixed banner from sitting on top of the footer while it is open.
    document.documentElement.style.setProperty("--consent-h", banner.offsetHeight + "px");
    document.body.classList.add("has-consent");
  }

  function hide() {
    if (!banner) return;
    var el = banner;
    banner = null;
    document.body.classList.remove("has-consent");
    document.documentElement.style.removeProperty("--consent-h");
    el.classList.remove("consent--in");

    var gone = function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    if (reducedMotion()) gone();
    else setTimeout(gone, 220); // just past the 180ms transition

    // Return focus deliberately rather than letting it fall to the top of the document.
    if (trigger && document.contains(trigger)) {
      trigger.focus();
      trigger = null;
      return;
    }
    var main = document.querySelector("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
      main.addEventListener("blur", function once() {
        main.removeAttribute("tabindex");
        main.removeEventListener("blur", once);
      });
    }
  }

  function choose(state) {
    write(state, "user");
    announce(
      state === "granted"
        ? "Advertising cookies allowed. You can change this from the footer."
        : "Advertising cookies turned off. You can change this from the footer."
    );
    hide();
    notify();
    syncLink();
  }

  function show() {
    if (banner) return;

    var el = document.createElement("section");
    el.className = "consent";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Privacy choices");

    var inner = document.createElement("div");
    inner.className = "consent__inner";

    var body = document.createElement("div");
    var label = document.createElement("p");
    label.className = "consent__label";
    label.textContent = "Privacy";
    var text = document.createElement("p");
    text.className = "consent__text";
    text.textContent = copy.text + " ";
    var a = document.createElement("a");
    a.href = PRIVACY_URL;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Privacy policy";
    text.appendChild(a);
    body.appendChild(label);
    body.appendChild(text);

    var actions = document.createElement("div");
    actions.className = "consent__actions";
    var yes = document.createElement("button");
    yes.type = "button";
    yes.className = "consent__btn";
    yes.textContent = copy.yes;
    yes.addEventListener("click", function () {
      choose("granted");
    });
    var no = document.createElement("button");
    no.type = "button";
    no.className = "consent__btn";
    no.textContent = copy.no;
    no.addEventListener("click", function () {
      choose("denied");
    });
    actions.appendChild(yes);
    actions.appendChild(no);

    inner.appendChild(body);
    inner.appendChild(actions);
    el.appendChild(inner);

    // First in the body so keyboard and screen-reader users meet the choice before the
    // page, even though it is painted at the bottom.
    document.body.insertBefore(el, document.body.firstChild);
    banner = el;
    measure();

    if (reducedMotion()) {
      el.classList.add("consent--in");
    } else {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.classList.add("consent--in");
        });
      });
    }
  }

  // ---- Permanent footer link ----------------------------------------------------
  // Required to be persistently available in California, and it is the only way to undo an
  // accept anywhere else. Injected rather than authored into 13 footers by hand: the tracker
  // it controls is JS-only, so a JS-injected control is never the reason someone is stuck.
  var footerLink = null;

  function syncLink() {
    if (!footerLink) return;
    var d = decision();
    footerLink.setAttribute(
      "aria-label",
      copy.link + " — advertising cookies are currently " + (allowed() ? "on" : "off") + (d === null ? " (no choice made)" : "")
    );
  }

  function addLink() {
    var foot = document.querySelector("footer.footer");
    if (!foot || footerLink) return;

    var link = document.createElement("button");
    link.type = "button";
    link.className = "privacy-choices";
    link.textContent = copy.link;
    link.addEventListener("click", function () {
      trigger = link;
      show();
    });

    // The Gig pages already have a trust-link nav; everywhere else the footer is just a
    // social row, so the link goes straight into the bar ahead of it.
    var nav = foot.querySelector(".footer-links");
    if (nav) {
      nav.appendChild(link);
    } else {
      var bar = foot.querySelector(".bar") || foot;
      var social = bar.querySelector(".social");
      if (social) bar.insertBefore(link, social);
      else bar.appendChild(link);
    }
    footerLink = link;
    syncLink();
  }

  // ---- Boot ---------------------------------------------------------------------
  function boot() {
    addLink();
    // Undecided means the visitor has been told nothing yet — a notice under CPRA, a real
    // question under PECR. A GPC signal counts as an answer, so those visitors see nothing.
    if (decision() === null) show();
    window.addEventListener("resize", measure);
    // The banner is measured at DOMContentLoaded, before the web fonts land — and a
    // re-flowed line of copy changes its height, which is the number holding the footer
    // clear of it. Re-measure once everything has settled.
    window.addEventListener("load", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // ---- Public API ---------------------------------------------------------------
  window.mbConsent = {
    regime: REGIME,
    gpc: GPC,
    allowed: allowed,
    decision: decision,
    // Fires immediately with the current answer, then again on every change, so a
    // subscriber only ever needs this one hook.
    onChange: function (fn) {
      if (typeof fn !== "function") return;
      listeners.push(fn);
      try {
        fn(allowed());
      } catch (e) {
        /* never let a subscriber throw into boot */
      }
    },
    open: function () {
      show();
    },
  };
})();
