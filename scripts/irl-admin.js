/**
 * IRL admin — run a show from a phone.
 *
 * Three jobs, in the order they actually get used at a venue:
 *   Lineup  read applications, approve or decline, tag people into rounds
 *   Seats   see who is coming to watch and how many they are bringing
 *   Show    create, edit, publish or cancel a date
 *
 * Access is enforced by row-level security, not by this file. Anyone can reach
 * this page and anyone can authenticate; only a row in `admins` grants the
 * ability to read a signup or write an event. The check below is a courtesy so
 * a non-admin gets a sentence instead of a wall of empty lists.
 *
 * Destructive actions use a two-tap confirm rather than confirm(), which blocks
 * the page and is miserable on a phone.
 */
import { auth, db, DbError } from "./irl-db.js";

const $ = (id) => document.getElementById(id);

const signinView = $("signinView");
const consoleView = $("consoleView");
const signOutBtn = $("signOut");
const toastEl = $("toast");

const EVENT_COLUMNS = "*";
const DRAFT_STATUSES = ["draft", "published", "cancelled", "completed"];

let events = [];
let current = null; // selected event
let privateNotes = ""; // event_private.notes for `current` — admins only
let signups = [];
let lineupFilter = "pending";
let toastTimer = null;

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

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

/** ISO ⇄ the local wall-clock string <input type="datetime-local"> speaks. */
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value); // parsed as local time, which is what was typed
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function whenLabel(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// --- Boot -------------------------------------------------------------------

async function boot() {
  auth.consumeUrlSession(); // magic-link landing

  const user = await auth.me();
  if (!user) return showSignIn();

  // Does this account actually have admin rows? RLS lets you read only your own.
  let rows = [];
  try {
    rows = (await db.select("admins", { select: "user_id" })) || [];
  } catch {
    rows = [];
  }

  if (!rows.length) {
    signinView.hidden = false;
    signinView.innerHTML = `
      <h1 class="signin__title">No access</h1>
      <p class="signin__text">
        You are signed in as ${esc(user.email)}, but that account is not an admin
        on this project. Add its user id to the <code>admins</code> table in
        Supabase, then reload.
      </p>`;
    signOutBtn.hidden = false;
    return;
  }

  showConsole();
}

function showSignIn() {
  signinView.hidden = false;
  consoleView.hidden = true;
  signOutBtn.hidden = true;
}

async function showConsole() {
  signinView.hidden = true;
  consoleView.hidden = false;
  signOutBtn.hidden = false;
  await loadEvents();
}

// --- Sign in ----------------------------------------------------------------

$("signinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("signinMsg");
  const btn = $("signinSubmit");
  const email = $("s-email").value.trim();
  const password = $("s-pass").value;

  if (!email || !password) {
    msg.className = "formmsg formmsg--err";
    msg.textContent = "Email and password, please.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Signing in…";
  msg.className = "formmsg";
  msg.textContent = "";

  try {
    await auth.signIn(email, password);
    $("s-pass").value = "";
    await boot();
  } catch (err) {
    msg.className = "formmsg formmsg--err";
    msg.textContent =
      err instanceof DbError && err.message ? err.message : "Sign-in failed.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

$("magicBtn").addEventListener("click", async () => {
  const msg = $("signinMsg");
  const email = $("s-email").value.trim();
  if (!email) {
    msg.className = "formmsg formmsg--err";
    msg.textContent = "Put your email in first.";
    $("s-email").focus();
    return;
  }
  try {
    await auth.sendMagicLink(email, location.origin + location.pathname);
    msg.className = "formmsg formmsg--ok";
    msg.textContent = "Link sent. Check your email on this device.";
  } catch (err) {
    msg.className = "formmsg formmsg--err";
    msg.textContent =
      err instanceof DbError && err.message ? err.message : "Could not send it.";
  }
});

signOutBtn.addEventListener("click", async () => {
  await auth.signOut();
  location.reload();
});

// --- Events -----------------------------------------------------------------

async function loadEvents({ keepId } = {}) {
  try {
    events =
      (await db.select("events", {
        select: EVENT_COLUMNS,
        order: "starts_at.desc",
        limit: 200,
      })) || [];
  } catch (err) {
    toast(err.message || "Could not load shows.");
    events = [];
  }

  const pick = $("eventPick");
  if (!events.length) {
    pick.innerHTML = `<option value="">No shows yet — tap New</option>`;
    current = null;
    privateNotes = "";
    renderScore();
    renderLineup();
    renderSeats();
    fillEditor(null);
    return;
  }

  // What's next comes first: upcoming shows soonest-first, then past ones
  // most-recent-first underneath. A date-ordered dump would bury tonight's
  // show under a draft three months out.
  const now = Date.now();
  const isFuture = (e) => new Date(e.starts_at).getTime() >= now;
  const upcoming = events
    .filter(isFuture)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = events
    .filter((e) => !isFuture(e))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  events = [...upcoming, ...past];

  pick.innerHTML = events
    .map(
      (e) =>
        `<option value="${esc(e.id)}">${esc(whenLabel(e.starts_at))} — ${esc(
          e.title,
        )}${e.status === "published" ? "" : ` (${esc(e.status)})`}</option>`,
    )
    .join("");

  // Default to the next show that is actually running, not the next row.
  const wanted = keepId && events.find((e) => String(e.id) === String(keepId));
  current =
    wanted ||
    upcoming.find((e) => e.status === "published") ||
    upcoming[0] ||
    events[0];

  pick.value = current.id;
  await selectEvent(current.id);
}

$("eventPick").addEventListener("change", (e) => selectEvent(e.target.value));

async function selectEvent(id) {
  current = events.find((e) => String(e.id) === String(id)) || null;
  privateNotes = current ? await loadNotes(current.id) : "";
  fillEditor(current);
  renderScore();
  await loadSignups();
}

/** Private notes live in their own admin-only table, so anon has no path to
 *  them at all — see supabase/schema.sql for why they are not a column. */
async function loadNotes(eventId) {
  try {
    const [row] = await db.select("event_private", {
      select: "notes",
      event_id: `eq.${eventId}`,
      limit: 1,
    });
    return row?.notes || "";
  } catch {
    return "";
  }
}

async function loadSignups() {
  if (!current) {
    signups = [];
    renderLineup();
    renderSeats();
    return;
  }
  try {
    signups =
      (await db.select("signups", {
        select: "*",
        event_id: `eq.${current.id}`,
        order: "created_at.asc",
        limit: 1000,
      })) || [];
  } catch (err) {
    toast(err.message || "Could not load signups.");
    signups = [];
  }
  renderLineup();
  renderSeats();
  renderScore();
}

// --- Scoreboard -------------------------------------------------------------

function renderScore() {
  const box = $("score");
  if (!current) {
    box.innerHTML = "";
    return;
  }

  const players = signups.filter((s) => s.role === "participant");
  const pending = players.filter((s) => s.status === "pending").length;
  const approved = players.filter((s) => s.status === "approved").length;
  const heads = signups
    .filter((s) => s.role === "spectator" && s.status === "approved")
    .reduce((n, s) => n + (s.party_size || 1), 0);

  box.innerHTML = `
    <div class="score__cell${pending ? " score__cell--alert" : ""}">
      <p class="score__n">${pending}</p>
      <p class="score__k">To review</p>
    </div>
    <div class="score__cell">
      <p class="score__n">${approved}<span style="color:var(--steel)">/${esc(current.participant_capacity)}</span></p>
      <p class="score__k">On the lineup</p>
    </div>
    <div class="score__cell">
      <p class="score__n">${heads}${current.spectator_capacity != null ? `<span style="color:var(--steel)">/${esc(current.spectator_capacity)}</span>` : ""}</p>
      <p class="score__k">Watching</p>
    </div>`;

  const badge = $("pendingBadge");
  badge.hidden = !pending;
  badge.textContent = String(pending);
}

// --- Lineup -----------------------------------------------------------------

const LINEUP_FILTERS = [
  ["pending", "To review"],
  ["approved", "Lineup"],
  ["waitlist", "Waitlist"],
  ["declined", "Declined"],
  ["all", "All"],
];

function renderFilters() {
  $("lineupFilters").innerHTML = LINEUP_FILTERS.map(([key, label]) => {
    const n =
      key === "all"
        ? signups.filter((s) => s.role === "participant").length
        : signups.filter((s) => s.role === "participant" && s.status === key)
            .length;
    return `<button class="choice" type="button" role="radio"
              aria-pressed="${lineupFilter === key}" aria-checked="${lineupFilter === key}"
              data-filter="${key}">${esc(label)} ${n}</button>`;
  }).join("");

  $("lineupFilters")
    .querySelectorAll("[data-filter]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        lineupFilter = b.dataset.filter;
        renderLineup();
      }),
    );
}

function personHTML(s) {
  const facts = [
    s.age ? `<span><b>age</b> ${esc(s.age)}</span>` : "",
    s.gender ? `<span><b>is</b> ${esc(s.gender)}</span>` : "",
    Array.isArray(s.seeking) && s.seeking.length
      ? `<span><b>wants</b> ${esc(s.seeking.join(", "))}</span>`
      : "",
    s.looking_for ? `<span><b>for</b> ${esc(s.looking_for)}</span>` : "",
    s.consent_filming ? "" : `<span><b>camera</b> no</span>`,
  ]
    .filter(Boolean)
    .join("");

  const actions =
    s.status === "pending"
      ? `
        <button class="btn btn--solid" type="button" data-set="approved" data-id="${esc(s.id)}">Add to lineup</button>
        <button class="btn btn--ghost" type="button" data-set="waitlist" data-id="${esc(s.id)}">Waitlist</button>
        <button class="btn btn--quiet" type="button" data-set="declined" data-id="${esc(s.id)}">Decline</button>`
      : s.status === "approved"
        ? `
        <button class="btn btn--ghost" type="button" data-set="waitlist" data-id="${esc(s.id)}">Move to waitlist</button>
        <button class="btn btn--quiet" type="button" data-set="declined" data-id="${esc(s.id)}">Remove</button>`
        : `
        <button class="btn btn--solid" type="button" data-set="approved" data-id="${esc(s.id)}">Add to lineup</button>`;

  const group =
    s.status === "approved"
      ? `
      <div class="field">
        <label class="field__label" for="g-${esc(s.id)}">Round / group</label>
        <input class="input" id="g-${esc(s.id)}" type="text" maxlength="40"
               value="${esc(s.group_label || "")}" data-group-for="${esc(s.id)}"
               placeholder="e.g. Round 2 — late 20s" />
      </div>`
      : "";

  return `
    <article class="person">
      <div class="person__head">
        <h2 class="person__name">${esc(s.name)}</h2>
        <span class="pill pill--${esc(s.status)}">${esc(s.status)}</span>
      </div>

      <div class="person__facts">${facts}</div>
      ${s.about ? `<p class="person__about">${esc(s.about)}</p>` : ""}

      <div class="person__contact">
        <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>
        ${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : ""}
        ${
          s.instagram
            ? `<a href="https://instagram.com/${esc(String(s.instagram).replace(/^@/, ""))}" target="_blank" rel="noopener noreferrer">${esc(s.instagram)}</a>`
            : ""
        }
      </div>

      ${group}
      <div class="person__actions">${actions}</div>
    </article>`;
}

function renderLineup() {
  renderFilters();
  const box = $("lineupList");

  if (!current) {
    box.innerHTML = `<p class="admin-state"><strong>No show selected</strong>Create one to start taking applications.</p>`;
    return;
  }

  const rows = signups
    .filter((s) => s.role === "participant")
    .filter((s) => lineupFilter === "all" || s.status === lineupFilter);

  if (!rows.length) {
    box.innerHTML = `<p class="admin-state"><strong>Nothing here</strong>${
      lineupFilter === "pending"
        ? "Every application has been dealt with."
        : "No one in this list yet."
    }</p>`;
    return;
  }

  box.innerHTML = rows.map(personHTML).join("");

  box.querySelectorAll("[data-set]").forEach((btn) =>
    btn.addEventListener("click", () => setStatus(btn.dataset.id, btn.dataset.set)),
  );

  box.querySelectorAll("[data-group-for]").forEach((input) =>
    input.addEventListener("change", () =>
      saveField(input.dataset.groupFor, { group_label: input.value.trim() || null }),
    ),
  );
}

// --- Seats ------------------------------------------------------------------

/** One audience booking. Waitlisted rows get a promote action instead. */
function seatHTML(s, waiting) {
  return `
      <article class="person">
        <div class="person__head">
          <h2 class="person__name">${esc(s.name)}</h2>
          <span class="pill pill--${waiting ? "waitlist" : "approved"}">${
            waiting ? "waitlist" : ""
          } ×${esc(s.party_size || 1)}</span>
        </div>
        <div class="person__contact">
          <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>
          ${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : ""}
        </div>
        <div class="person__actions">
          ${
            waiting
              ? `<button class="btn btn--solid" type="button" data-seat-set="approved" data-id="${esc(s.id)}">Give them seats</button>`
              : ""
          }
          <button class="btn btn--quiet" type="button" data-seat-set="cancelled" data-id="${esc(s.id)}">
            ${waiting ? "Remove" : "Cancel booking"}
          </button>
        </div>
      </article>`;
}

function renderSeats() {
  const tools = $("seatTools");
  const box = $("seatList");

  const rows = signups.filter(
    (s) => s.role === "spectator" && s.status === "approved",
  );
  // People the room filled up on. They are still waiting to hear — leaving them
  // out of the admin entirely is how a waitlist quietly becomes a dead end.
  const waiting = signups.filter(
    (s) => s.role === "spectator" && s.status === "waitlist",
  );
  const heads = rows.reduce((n, s) => n + (s.party_size || 1), 0);

  tools.innerHTML = rows.length
    ? `<button class="choice" type="button" id="copyDoor">Copy door list</button>
       <button class="choice" type="button" id="copyEmails">Copy emails</button>`
    : "";

  if (rows.length) {
    $("copyDoor").addEventListener("click", () =>
      copy(
        rows
          .map((s) => `${s.name} × ${s.party_size || 1}`)
          .sort((a, b) => a.localeCompare(b))
          .join("\n"),
        "Door list copied",
      ),
    );
    $("copyEmails").addEventListener("click", () =>
      copy(rows.map((s) => s.email).join(", "), "Emails copied"),
    );
  }

  if (!rows.length && !waiting.length) {
    box.innerHTML = `<p class="admin-state"><strong>No seats booked</strong>Nobody has reserved yet.</p>`;
    return;
  }

  const summary = rows.length
    ? `<p class="admin-state" style="padding:0 0 1rem;text-align:left">${rows.length} ${
        rows.length === 1 ? "booking" : "bookings"
      } · ${heads} through the door</p>`
    : "";

  const waitlist = waiting.length
    ? `<div class="dlg__group"><p class="dlg__grouphead">Waiting for seats — ${waiting.length}</p></div>` +
      waiting.map((s) => seatHTML(s, true)).join("")
    : "";

  box.innerHTML =
    summary + rows.map((s) => seatHTML(s, false)).join("") + waitlist;

  box.querySelectorAll("[data-seat-set]").forEach((btn) =>
    btn.addEventListener("click", () =>
      setStatus(btn.dataset.id, btn.dataset.seatSet),
    ),
  );
}

async function copy(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    toast("Clipboard blocked — select and copy manually.");
  }
}

// --- Mutations --------------------------------------------------------------

async function setStatus(id, status) {
  try {
    await db.update("signups", { id: `eq.${id}` }, { status }, { returning: false });
    const row = signups.find((s) => String(s.id) === String(id));
    if (row) row.status = status;
    // Counters on the event are maintained by a trigger — refetch to show them.
    await refreshCurrentEvent();
    renderLineup();
    renderSeats();
    renderScore();
    toast(`Marked ${status}.`);
  } catch (err) {
    toast(err.message || "Could not save that.");
  }
}

async function saveField(id, patch) {
  try {
    await db.update("signups", { id: `eq.${id}` }, patch, { returning: false });
    const row = signups.find((s) => String(s.id) === String(id));
    if (row) Object.assign(row, patch);
    toast("Saved.");
  } catch (err) {
    toast(err.message || "Could not save that.");
  }
}

async function refreshCurrentEvent() {
  if (!current) return;
  try {
    const [fresh] = await db.select("events", {
      select: EVENT_COLUMNS,
      id: `eq.${current.id}`,
      limit: 1,
    });
    if (fresh) {
      Object.assign(current, fresh);
      const i = events.findIndex((e) => String(e.id) === String(fresh.id));
      if (i > -1) events[i] = current;
    }
  } catch {
    /* counters will catch up on the next load */
  }
}

// --- Event editor -----------------------------------------------------------

function fillEditor(event) {
  const f = $("eventForm");
  const set = (name, value) => {
    if (f.elements[name]) f.elements[name].value = value ?? "";
  };

  $("deleteWrap").hidden = !event;

  if (!event) {
    f.reset();
    set("min_age", 21);
    set("participant_capacity", 12);
    set("status", "draft");
    return;
  }

  set("title", event.title);
  set("format", event.format);
  set("status", DRAFT_STATUSES.includes(event.status) ? event.status : "draft");
  set("tagline", event.tagline);
  set("venue_name", event.venue_name);
  set("city", event.city);
  set("address", event.address);
  set("starts_at", toLocalInput(event.starts_at));
  set("ends_at", toLocalInput(event.ends_at));
  set("doors_at", toLocalInput(event.doors_at));
  set("participant_capacity", event.participant_capacity);
  set("spectator_capacity", event.spectator_capacity);
  set("min_age", event.min_age);
  set("ticket_note", event.ticket_note);
  set("notes", privateNotes);
}

/** A URL-safe slug, made unique by the date so two "Blind Table" nights differ. */
function slugify(title, startsAt) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const d = new Date(startsAt);
  const stamp = Number.isNaN(d.getTime())
    ? ""
    : `-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
        d.getDate(),
      ).padStart(2, "0")}`;
  return `${base || "show"}${stamp}`;
}

$("newEvent").addEventListener("click", () => {
  current = null;
  privateNotes = "";
  $("eventPick").value = "";
  fillEditor(null);
  signups = [];
  renderScore();
  renderLineup();
  renderSeats();
  switchTab("event");
  $("e-title").focus();
  toast("New show — fill it in and save.");
});

$("eventCancel").addEventListener("click", () => {
  fillEditor(current);
  toast(current ? "Reverted." : "Cleared.");
});

$("eventForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const msg = $("eventMsg");
  const btn = $("eventSave");
  const get = (n) => String(f.elements[n]?.value || "").trim();

  const startsAt = fromLocalInput(get("starts_at"));
  const endsAt = fromLocalInput(get("ends_at"));
  const fail = (text, focus) => {
    msg.className = "formmsg formmsg--err";
    msg.textContent = text;
    if (focus && f.elements[focus]) f.elements[focus].focus();
  };

  if (!get("title")) return fail("The show needs a title.", "title");
  if (!get("venue_name")) return fail("Which venue?", "venue_name");
  if (!get("city")) return fail("Which city?", "city");
  if (!startsAt) return fail("Set a start date and time.", "starts_at");
  // The database enforces this too; catching it here gives a sentence instead
  // of a constraint-violation error.
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return fail("The end time has to be after the start.", "ends_at");
  }

  const payload = {
    title: get("title"),
    format: get("format") || null,
    tagline: get("tagline") || null,
    venue_name: get("venue_name"),
    city: get("city"),
    address: get("address") || null,
    starts_at: startsAt,
    ends_at: endsAt,
    doors_at: fromLocalInput(get("doors_at")),
    participant_capacity: Number(get("participant_capacity")) || 0,
    spectator_capacity: get("spectator_capacity")
      ? Number(get("spectator_capacity"))
      : null,
    min_age: Number(get("min_age")) || 21,
    ticket_note: get("ticket_note") || null,
    status: get("status"),
  };
  const notes = get("notes");

  btn.disabled = true;
  btn.textContent = "Saving…";
  msg.className = "formmsg";
  msg.textContent = "";

  try {
    if (current) {
      await db.update("events", { id: `eq.${current.id}` }, payload, {
        returning: false,
      });
      await db.upsert("event_private", { event_id: current.id, notes: notes || null });
      toast("Show saved.");
      await loadEvents({ keepId: current.id });
    } else {
      payload.slug = slugify(payload.title, startsAt);
      const [created] = await db.insert("events", payload, { returning: true });
      if (created && notes) {
        await db.upsert("event_private", { event_id: created.id, notes });
      }
      toast("Show created.");
      await loadEvents({ keepId: created?.id });
    }
  } catch (err) {
    msg.className = "formmsg formmsg--err";
    msg.textContent =
      err instanceof DbError && err.code === "23505"
        ? "A show with that title already exists on that date."
        : err.message || "Could not save.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Save show";
  }
});

// Two-tap delete — no blocking confirm() dialog.
let armed = false;
let armTimer = null;
$("eventDelete").addEventListener("click", async () => {
  const btn = $("eventDelete");

  if (!armed) {
    armed = true;
    btn.textContent = "Tap again to delete";
    btn.classList.add("btn--accent");
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      armed = false;
      btn.textContent = "Delete this show";
      btn.classList.remove("btn--accent");
    }, 4000);
    return;
  }

  clearTimeout(armTimer);
  armed = false;
  btn.textContent = "Delete this show";
  btn.classList.remove("btn--accent");

  if (!current) return;
  try {
    await db.remove("events", { id: `eq.${current.id}` });
    toast("Show deleted.");
    current = null;
    await loadEvents();
  } catch (err) {
    toast(err.message || "Could not delete.");
  }
});

// --- Tabs -------------------------------------------------------------------

function switchTab(name) {
  ["lineup", "seats", "event"].forEach((key) => {
    const on = key === name;
    $(`tab-${key}`).setAttribute("aria-selected", String(on));
    $(`panel-${key}`).hidden = !on;
  });
}

["lineup", "seats", "event"].forEach((key) =>
  $(`tab-${key}`).addEventListener("click", () => switchTab(key)),
);

// Arrow-key navigation across the tablist (WAI-ARIA tabs pattern).
document.querySelector('[role="tablist"]').addEventListener("keydown", (e) => {
  const keys = ["lineup", "seats", "event"];
  const i = keys.findIndex(
    (k) => $(`tab-${k}`).getAttribute("aria-selected") === "true",
  );
  let next = null;
  if (e.key === "ArrowRight") next = keys[(i + 1) % keys.length];
  if (e.key === "ArrowLeft") next = keys[(i - 1 + keys.length) % keys.length];
  if (!next) return;
  e.preventDefault();
  switchTab(next);
  $(`tab-${next}`).focus();
});

switchTab("lineup");
boot();
