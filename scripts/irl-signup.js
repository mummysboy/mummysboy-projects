/**
 * The IRL sign-up dialog — one dialog, two modes.
 *
 *   spectator    short RSVP. Confirmed on submit; the only cap is seats.
 *   participant  the grouping questionnaire. Lands as `pending` and waits for
 *                a human to build the lineup (see /irldatingshows/admin/).
 *
 * Accessibility contract, matched to the Gig modal reference in CLAUDE.md:
 * role="dialog" + aria-modal + aria-labelledby, Esc and overlay-click to close,
 * focus moves in on open and returns to the trigger on close, the rest of the
 * page is `inert` while it is open, and body scroll is locked.
 *
 * Everything written with innerHTML goes through esc(). Event titles and venue
 * names come from the database, so they are untrusted as far as this file is
 * concerned even though only an admin can write them.
 */
import { db, DbError } from "./irl-db.js";
import { GENDERS, SEEKING, INTENTIONS } from "../data/irl-config.js";

const overlay = document.getElementById("dlgOverlay");
const dialog = document.getElementById("dlg");
const form = document.getElementById("dlgForm");
const fields = document.getElementById("dlgFields");
const kicker = document.getElementById("dlgKicker");
const title = document.getElementById("dlgTitle");
const intro = document.getElementById("dlgIntro");
const submit = document.getElementById("dlgSubmit");
const msg = document.getElementById("dlgMsg");
const fine = document.getElementById("dlgFine");
const done = document.getElementById("dlgDone");
const doneTitle = document.getElementById("dlgDoneTitle");
const doneText = document.getElementById("dlgDoneText");
const doneClose = document.getElementById("dlgDoneClose");
const closeBtn = document.getElementById("dlgClose");

const pageRegions = document.querySelectorAll(
  "body > header, body > main, body > footer",
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let state = null; // { event, role }
let lastFocused = null;

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

/** A pill group. `multi` toggles; single-select behaves like a radio set. */
function choiceGroup(name, options, { multi = false, label, hint } = {}) {
  const pills = options
    .map(
      (opt) =>
        `<button class="choice" type="button" role="${multi ? "checkbox" : "radio"}"
           aria-checked="false" aria-pressed="false" data-choice="${esc(name)}"
           data-value="${esc(opt)}">${esc(opt)}</button>`,
    )
    .join("");

  return `
    <fieldset class="field" data-group="${esc(name)}">
      <legend class="field__label">${esc(label)}</legend>
      <div class="choices" role="${multi ? "group" : "radiogroup"}">${pills}</div>
      ${hint ? `<p class="field__hint">${esc(hint)}</p>` : ""}
    </fieldset>`;
}

// --- Field sets -------------------------------------------------------------

function spectatorFields(event) {
  return `
    <div class="field">
      <label class="field__label" for="f-name">Your name</label>
      <input class="input" id="f-name" name="name" type="text" autocomplete="name"
             maxlength="80" required />
    </div>

    <div class="row2">
      <div class="field">
        <label class="field__label" for="f-email">Email</label>
        <input class="input" id="f-email" name="email" type="email" inputmode="email"
               autocomplete="email" maxlength="120" required />
      </div>
      <div class="field">
        <label class="field__label" for="f-party">How many seats</label>
        <select class="select" id="f-party" name="party_size">
          ${[1, 2, 3, 4, 5, 6]
            .map((n) => `<option value="${n}">${n}</option>`)
            .join("")}
        </select>
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="f-phone">
        Phone <span class="opt">— optional, for day-of changes</span>
      </label>
      <input class="input" id="f-phone" name="phone" type="tel" inputmode="tel"
             autocomplete="tel" maxlength="30" />
    </div>

    <label class="check">
      <input type="checkbox" name="consent_age" required />
      <span>I am ${esc(event.min_age)} or over and will bring ID.</span>
    </label>`;
}

function participantFields(event) {
  return `
    <div class="field">
      <label class="field__label" for="f-name">Your name</label>
      <input class="input" id="f-name" name="name" type="text" autocomplete="name"
             maxlength="80" required />
    </div>

    <div class="row2">
      <div class="field">
        <label class="field__label" for="f-email">Email</label>
        <input class="input" id="f-email" name="email" type="email" inputmode="email"
               autocomplete="email" maxlength="120" required />
      </div>
      <div class="field">
        <label class="field__label" for="f-phone">Phone</label>
        <input class="input" id="f-phone" name="phone" type="tel" inputmode="tel"
               autocomplete="tel" maxlength="30" required />
      </div>
    </div>

    <div class="dlg__group">
      <p class="dlg__grouphead">So we can build the lineup</p>

      <div class="field">
        <label class="field__label" for="f-age">Your age</label>
        <input class="input" id="f-age" name="age" type="number" inputmode="numeric"
               min="${esc(event.min_age)}" max="99" required />
      </div>

      ${choiceGroup("gender", GENDERS, { label: "You are" })}

      <div class="field" id="f-selfwrap" hidden>
        <label class="field__label" for="f-self">How you would describe it</label>
        <input class="input" id="f-self" name="gender_self" type="text" maxlength="40" />
      </div>

      ${choiceGroup("seeking", SEEKING, {
        multi: true,
        label: "You want to meet",
        hint: "Pick as many as apply.",
      })}

      ${choiceGroup("looking_for", INTENTIONS, { label: "You are looking for" })}

      <div class="field">
        <label class="field__label" for="f-about">
          One line about you <span class="opt">— optional</span>
        </label>
        <textarea class="textarea" id="f-about" name="about" maxlength="240"
                  placeholder="Whatever you would want the host to know."></textarea>
      </div>

      <div class="field">
        <label class="field__label" for="f-ig">
          Instagram <span class="opt">— optional</span>
        </label>
        <input class="input" id="f-ig" name="instagram" type="text" maxlength="40"
               placeholder="@yourhandle" />
      </div>
    </div>

    <div class="dlg__group">
      <p class="dlg__grouphead">Before you send it</p>

      <label class="check">
        <input type="checkbox" name="consent_age" required />
        <span>I am ${esc(event.min_age)} or over, single, and free on this date.</span>
      </label>

      <label class="check">
        <input type="checkbox" name="consent_conduct" required />
        <span>
          I have read the house rules and I will keep the room a place people want to be
          in.
        </span>
      </label>

      <label class="check">
        <input type="checkbox" name="consent_filming" />
        <span>
          I am happy to appear in footage from the night. <span class="opt">Optional —
          leave it unticked and we keep you out of anything we post.</span>
        </span>
      </label>
    </div>`;
}

// --- Open / close -----------------------------------------------------------

function render() {
  const { event, role } = state;
  const isPlayer = role === "participant";

  const when = new Date(event.starts_at).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  kicker.textContent = `${when} · ${event.venue_name}`;
  title.textContent = isPlayer ? "Apply to play" : "Reserve a seat";
  intro.textContent = isPlayer
    ? "A person reads every application. If you are on the lineup we will email you the details a few days before the show."
    : "Seats are held under your name at the door. No payment here.";

  fields.innerHTML = isPlayer
    ? participantFields(event)
    : spectatorFields(event);

  // Honeypot — a field no human sees and every naive bot fills.
  const trap = document.createElement("div");
  trap.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden";
  trap.setAttribute("aria-hidden", "true");
  trap.innerHTML =
    '<label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>';
  fields.appendChild(trap);

  submit.textContent = isPlayer ? "Send my application" : "Hold my seats";
  fine.textContent = isPlayer
    ? "Used to build the lineup and contact you about the show. Never published, never shared."
    : "Used only to hold your seats and tell you if anything changes.";

  msg.textContent = "";
  msg.className = "formmsg";
  form.hidden = false;
  done.hidden = true;
  submit.disabled = false;

  wireChoices();
}

/** Pill selection, plus the "self-describe" reveal it drives. */
function wireChoices() {
  fields.querySelectorAll("[data-choice]").forEach((pill) => {
    pill.addEventListener("click", () => {
      const group = pill.dataset.choice;
      const multi = pill.getAttribute("role") === "checkbox";
      const on = pill.getAttribute("aria-pressed") === "true";

      if (!multi) {
        fields
          .querySelectorAll(`[data-choice="${CSS.escape(group)}"]`)
          .forEach((p) => {
            p.setAttribute("aria-pressed", "false");
            p.setAttribute("aria-checked", "false");
          });
      }
      pill.setAttribute("aria-pressed", String(!on));
      pill.setAttribute("aria-checked", String(!on));

      if (group === "gender") {
        const wrap = document.getElementById("f-selfwrap");
        if (wrap) {
          const selfPicked =
            fields.querySelector('[data-choice="gender"][aria-pressed="true"]')
              ?.dataset.value === "Prefer to self-describe";
          wrap.hidden = !selfPicked;
        }
      }
    });
  });
}

function picked(group) {
  return [
    ...fields.querySelectorAll(
      `[data-choice="${CSS.escape(group)}"][aria-pressed="true"]`,
    ),
  ].map((p) => p.dataset.value);
}

export function openSignup(event, role, trigger) {
  state = { event, role };
  lastFocused = trigger || document.activeElement;

  render();

  pageRegions.forEach((el) => el.setAttribute("inert", ""));
  document.body.style.overflow = "hidden";
  overlay.classList.add("open");
  dialog.scrollTop = 0;

  setTimeout(() => {
    const first = form.querySelector("input, select, textarea, button");
    if (first) first.focus();
  }, 60);
}

function close() {
  overlay.classList.remove("open");
  pageRegions.forEach((el) => el.removeAttribute("inert"));
  document.body.style.overflow = "";
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  state = null;
}

closeBtn.addEventListener("click", close);
doneClose.addEventListener("click", close);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) close();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlay.classList.contains("open")) close();
});

/** Keep Tab inside the dialog while it is open. */
dialog.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const focusable = [
    ...dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.offsetParent !== null || el === document.activeElement);

  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// --- Submit -----------------------------------------------------------------

function fail(message, focusName) {
  msg.className = "formmsg formmsg--err";
  msg.textContent = message;
  if (focusName) {
    const el = form.elements[focusName];
    if (el && el.focus) {
      el.setAttribute("aria-invalid", "true");
      el.focus();
    }
  }
  return false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state) return;

  const { event, role } = state;
  const isPlayer = role === "participant";
  const data = new FormData(form);
  const get = (k) => String(data.get(k) || "").trim();

  form
    .querySelectorAll('[aria-invalid="true"]')
    .forEach((el) => el.removeAttribute("aria-invalid"));
  msg.className = "formmsg";
  msg.textContent = "";

  // Honeypot: a filled trap means a bot. Show the success state and drop it —
  // telling a scraper why it failed just teaches it to try again.
  if (get("website")) {
    form.hidden = true;
    done.hidden = false;
    doneTitle.textContent = "You're on the list.";
    doneText.textContent = "Check your email for confirmation.";
    return;
  }

  const name = get("name");
  const email = get("email");
  const phone = get("phone");

  if (name.length < 2) return fail("Tell us your name.", "name");
  if (!EMAIL_RE.test(email)) return fail("That email doesn't look right.", "email");

  // Argument names match public.submit_signup(...) in supabase/schema.sql.
  const row = {
    p_event_id: event.id,
    p_role: role,
    p_name: name,
    p_email: email.toLowerCase(),
    p_phone: phone || null,
  };

  if (isPlayer) {
    const age = Number(get("age"));
    const genders = picked("gender");
    const seeking = picked("seeking");
    const intent = picked("looking_for");

    if (!Number.isFinite(age) || age < event.min_age || age > 99) {
      return fail(`You need to be ${event.min_age} or over to play.`, "age");
    }
    if (!genders.length) return fail("Pick how you'd describe yourself.");
    if (!seeking.length) return fail("Pick who you'd like to meet.");
    if (!intent.length) return fail("Pick what you're looking for.");
    if (!phone) return fail("We need a phone number for day-of changes.", "phone");
    if (!data.get("consent_age")) return fail("Tick the age and availability box.");
    if (!data.get("consent_conduct")) return fail("Tick the house-rules box.");

    const self = get("gender_self");
    row.p_age = age;
    row.p_gender =
      genders[0] === "Prefer to self-describe" && self ? self : genders[0];
    row.p_seeking = seeking;
    row.p_looking_for = intent[0];
    row.p_about = get("about") || null;
    row.p_instagram = get("instagram") || null;
    row.p_consent_age = true;
    row.p_consent_conduct = true;
    row.p_consent_filming = Boolean(data.get("consent_filming"));
  } else {
    if (!data.get("consent_age")) return fail("Tick the age box.");
    row.p_party_size = Number(get("party_size")) || 1;
    row.p_consent_age = true;
  }

  const original = submit.textContent;
  submit.disabled = true;
  submit.textContent = "Sending…";

  try {
    // Returns the status the row was actually stored with. A spectator can be
    // dropped to the waitlist by the database when the room fills, and the page
    // has no way to read the row back to find out — so the server says.
    const status = await db.rpc("submit_signup", row);

    form.hidden = true;
    done.hidden = false;

    if (isPlayer) {
      doneTitle.textContent = "Application in.";
      doneText.textContent =
        "We read every one. If you are on the lineup you will get an email with the details a few days before the show.";
    } else if (status === "waitlist") {
      doneTitle.textContent = "You're on the waitlist.";
      doneText.textContent =
        "The room filled while you were typing, so we could not hold those seats. We will email you the moment some open up — people drop out most weeks.";
    } else {
      doneTitle.textContent = "Seats held.";
      doneText.textContent = `We have got you down for ${row.p_party_size} at ${event.venue_name}. Come to the door under your own name.`;
    }
    doneClose.focus();
  } catch (err) {
    submit.disabled = false;
    submit.textContent = original;

    // 23505 = unique violation: this email already signed up for this event.
    if (err instanceof DbError && err.code === "23505") {
      return fail(
        isPlayer
          ? "You have already applied for this one. We will be in touch."
          : "That email already has seats for this show.",
      );
    }
    // The insert policy rejects signups for a show that is full, cancelled or past.
    if (err instanceof DbError && (err.status === 401 || err.status === 403)) {
      return fail("Sign-ups for this show just closed. Try another date.");
    }
    return fail(
      err instanceof DbError && err.message
        ? err.message
        : "Something went wrong. Try again in a moment.",
    );
  }
});
