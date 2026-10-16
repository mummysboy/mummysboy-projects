// Gig affiliate application (gig/partnerships/). Sends the Netlify form in place
// instead of navigating; without JavaScript the form still posts to its action and
// the browser lands on gig/partnerships/thanks/.
const form = document.getElementById("applyForm");
const done = document.getElementById("applyDone");

// The form's steps for the moderation dashboard's Partnerships panel, through the beacon
// gig-analytics.js exposes (window.gigTrack, variant "partners"). Looked up at call time, since
// that module runs after this one. Never what anyone typed: only that a step happened.
function beacon(type, label) {
  try {
    if (window.gigTrack) window.gigTrack(type, label || null);
  } catch {}
}

if (form && done) {
  const status = document.getElementById("applyStatus");
  const button = form.querySelector('button[type="submit"]');

  // Credit the link the applicant came from (?id=, ?ref=, utm_source), same params
  // gig-analytics.js reads. Best-effort: never blocks the form.
  try {
    const q = new URLSearchParams(location.search);
    const src = q.get("id") || q.get("ref") || q.get("utm_source") || "";
    document.getElementById("applySource").value = src.slice(0, 64);
  } catch {}

  // Started = the first thing typed or picked, not focus: arrive() focuses the first field
  // by itself on a computer.
  const started = () => {
    form.removeEventListener("input", started);
    form.removeEventListener("change", started);
    beacon("apply_start");
  };
  form.addEventListener("input", started);
  form.addEventListener("change", started);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // "Traffic sources" has no native required for a checkbox group.
    if (!form.querySelector('input[name="traffic_sources[]"]:checked')) {
      status.dataset.state = "error";
      status.textContent = "Pick at least one traffic source.";
      form.querySelector('input[name="traffic_sources[]"]').focus();
      return;
    }

    button.disabled = true;
    status.dataset.state = "";
    status.textContent = "Sending…";

    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) {
        beacon("apply_error", `http-${res.status}`);
        throw new Error(`HTTP ${res.status}`);
      }
      beacon("apply_submit");
      form.hidden = true;
      done.hidden = false;
      done.querySelector("h3").focus();
    } catch (err) {
      if (!/^HTTP /.test((err && err.message) || "")) beacon("apply_error", "network");
      status.dataset.state = "error";
      status.textContent = "That didn’t send. Please try again in a moment.";
      button.disabled = false;
    }
  });
}

// "Apply now": an eased glide down to the form instead of the browser's quick jump, then
// the cursor in the first field (computers only) and a brief ring on the card so the eye lands there.
// Under Reduce Motion it jumps straight there. A wheel, touch or key press during the
// glide hands the scroll back to the visitor. Without JS the #apply link still works.
const section = document.getElementById("apply");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

function arrive() {
  // Cursor in the first field on a computer only: on a phone it would throw the keyboard up.
  const fine = window.matchMedia("(pointer: fine)").matches;
  const first = fine && form && !form.hidden ? form.querySelector(".apply__input") : null;
  if (first) first.focus({ preventScroll: true });
  if (form && !form.hidden) {
    form.classList.remove("is-arrived");
    void form.offsetWidth; // restart the animation on a second press
    form.classList.add("is-arrived");
  }
  try {
    history.replaceState(null, "", "#apply");
  } catch {}
}

function glideTo(y) {
  const start = window.scrollY;
  const dist = y - start;
  if (reduce.matches || Math.abs(dist) < 2) {
    window.scrollTo(0, y);
    arrive();
    return;
  }
  // Longer trips take a little longer, inside a calm 650–1100ms window.
  const duration = Math.min(1100, Math.max(650, Math.abs(dist) * 0.45));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let t0 = null;
  let cancelled = false;
  const stop = () => {
    cancelled = true;
  };
  const events = ["wheel", "touchstart", "keydown"];
  events.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }));
  const done = () => events.forEach((e) => window.removeEventListener(e, stop));

  requestAnimationFrame(function step(now) {
    if (cancelled) return done();
    if (t0 === null) t0 = now;
    const t = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, start + dist * ease(t));
    if (t < 1) return requestAnimationFrame(step);
    done();
    arrive();
  });
}

if (section) {
  document.querySelectorAll('a[href="#apply"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const pos = link.closest("[data-pos]");
      beacon("apply_cta", pos ? pos.getAttribute("data-pos") : null);
      const top = section.getBoundingClientRect().top + window.scrollY - 24;
      glideTo(Math.max(0, top));
    });
  });
}
