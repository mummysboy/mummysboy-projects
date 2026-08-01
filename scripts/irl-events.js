/**
 * Renders the upcoming-shows list on /irldatingshows/ from Supabase, and wires
 * each row's two actions to the sign-up dialog.
 *
 * Columns are listed explicitly rather than `select=*` so the shape this page
 * depends on is visible here, and so a column added later does not silently
 * start shipping to every visitor. Every column of `events` is public-safe by
 * design — private per-show notes live in `event_private`, which anon has no
 * grant on (see supabase/schema.sql).
 *
 * Availability copy is deliberately not a raw application count. Twenty people
 * can apply for twelve places, so "12 spots left" would be a lie by the time
 * anyone read it — the lineup reports open/closed, and only spectator seats,
 * which really are first-come, report a number.
 */
import { db } from "./irl-db.js";
import { openSignup } from "./irl-signup.js";

const PUBLIC_COLUMNS = [
  "id",
  "slug",
  "title",
  "format",
  "tagline",
  "venue_name",
  "address",
  "city",
  "starts_at",
  "ends_at",
  "doors_at",
  "ticket_note",
  "participant_capacity",
  "spectator_capacity",
  "min_age",
  "status",
  "participant_confirmed",
  "spectator_confirmed",
].join(",");

const list = document.getElementById("eventList");
const countEl = document.querySelector("[data-event-count]");

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

const fmt = {
  dow: new Intl.DateTimeFormat(undefined, { weekday: "short" }),
  month: new Intl.DateTimeFormat(undefined, { month: "short" }),
  time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }),
};

/** "7:00 – 9:00 PM" when a finish time is set, otherwise just the start.
 *  formatRange collapses the shared meridiem for us and gets the locale right;
 *  older browsers fall back to spelling both out. */
function timeLabel(start, end) {
  if (!end) return fmt.time.format(start);
  try {
    return fmt.time.formatRange(start, end);
  } catch {
    return `${fmt.time.format(start)} – ${fmt.time.format(end)}`;
  }
}

/** What each row can still take. */
function availability(event) {
  if (event.status === "cancelled") {
    return { lineup: "cancelled", seats: "cancelled" };
  }
  const lineupFull =
    (event.participant_confirmed || 0) >= (event.participant_capacity || 0);

  const cap = event.spectator_capacity;
  const seatsLeft = cap == null ? null : cap - (event.spectator_confirmed || 0);

  return {
    lineup: lineupFull ? "waitlist" : "open",
    seats: seatsLeft == null ? "open" : seatsLeft <= 0 ? "full" : "left",
    seatsLeft,
  };
}

function rowHTML(event, avail) {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const cancelled = event.status === "cancelled";

  const where = [event.venue_name, event.city].filter(Boolean).join(" · ");

  // Every state carries a word, never colour on its own (WCAG 1.4.1).
  let status;
  if (cancelled) {
    status = `<span class="avail avail--closed"><span class="avail__dot" aria-hidden="true"></span>Cancelled</span>`;
  } else if (avail.lineup === "waitlist") {
    status = `<span class="avail avail--full"><span class="avail__dot" aria-hidden="true"></span>Lineup set — waitlist open</span>`;
  } else {
    status = `<span class="avail avail--open"><span class="avail__dot" aria-hidden="true"></span>Applications open</span>`;
  }

  let seats = "";
  if (!cancelled) {
    if (avail.seats === "full") {
      seats = `<span class="avail avail--full"><span class="avail__dot" aria-hidden="true"></span>Seats sold out</span>`;
    } else if (avail.seats === "left" && avail.seatsLeft <= 10) {
      seats = `<span class="avail avail--tight"><span class="avail__dot" aria-hidden="true"></span>${avail.seatsLeft} ${
        avail.seatsLeft === 1 ? "seat" : "seats"
      } left</span>`;
    }
  }

  const ticket = event.ticket_note
    ? `<span class="avail avail--tight"><span class="avail__dot" aria-hidden="true"></span>${esc(event.ticket_note)}</span>`
    : "";

  const actions = cancelled
    ? ""
    : `
      <div class="event__actions">
        <button class="btn btn--accent" type="button" data-signup="participant" data-event="${esc(event.id)}">
          ${avail.lineup === "waitlist" ? "Join the waitlist" : "Apply to play"}
        </button>
        ${
          avail.seats === "full"
            ? `<button class="btn btn--ghost" type="button" disabled>Seats sold out</button>`
            : `<button class="btn btn--ghost" type="button" data-signup="spectator" data-event="${esc(event.id)}">Reserve a seat</button>`
        }
      </div>`;

  return `
    <article class="event${cancelled ? " event--muted" : ""}">
      <p class="event__when">
        <span class="event__dow">${esc(fmt.dow.format(start))}</span>
        <span class="event__day">${start.getDate()}</span>
        <span class="event__month">${esc(fmt.month.format(start))}</span>
        <span class="event__time">${esc(timeLabel(start, end))}</span>
      </p>

      <div>
        <h3 class="event__title">
          ${event.format ? `<span class="event__format">${esc(event.format)}</span>` : ""}
          ${esc(event.title)}${cancelled ? `<span class="event__strike">Cancelled</span>` : ""}
        </h3>
        <p class="event__where">${esc(where)}</p>
        ${event.tagline ? `<p class="event__tagline">${esc(event.tagline)}</p>` : ""}
        <div class="event__meta">${status}${seats}${ticket}</div>
        ${actions}
      </div>
    </article>`;
}

/** Event structured data, so a show can surface in search even though the
 *  listings are client-rendered. Only real, published, future shows go in. */
function injectSchema(events) {
  const live = events.filter((e) => e.status === "published");
  if (!live.length) return;

  const node = document.createElement("script");
  node.type = "application/ld+json";
  node.textContent = JSON.stringify(
    live.map((e) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      startDate: e.starts_at,
      ...(e.ends_at ? { endDate: e.ends_at } : {}),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: e.venue_name,
        address: [e.address, e.city].filter(Boolean).join(", "),
      },
      url: "https://mummysboy.com/irldatingshows/",
      ...(e.tagline ? { description: e.tagline } : {}),
    })),
  );
  document.head.appendChild(node);
}

async function load() {
  // Keep tonight's show on the page while it is happening — drop it six hours
  // after doors rather than the moment it starts.
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  let events;
  try {
    events = await db.select("events", {
      select: PUBLIC_COLUMNS,
      status: "in.(published,cancelled)",
      starts_at: `gte.${since}`,
      order: "starts_at.asc",
      limit: 50,
    });
  } catch {
    list.setAttribute("aria-busy", "false");
    list.innerHTML = `
      <p class="events__state">
        <strong>Dates aren't loading</strong>
        Something is wrong on our end. Refresh, or email
        <a class="spec__link" href="mailto:support@rightimagedigital.com">support@rightimagedigital.com</a>
        and we will send you the schedule.
      </p>`;
    if (countEl) countEl.textContent = "Unavailable";
    return;
  }

  list.setAttribute("aria-busy", "false");

  if (!events || !events.length) {
    list.innerHTML = `
      <p class="events__state">
        <strong>No dates on sale right now</strong>
        The next run is being booked. Email
        <a class="spec__link" href="mailto:support@rightimagedigital.com">support@rightimagedigital.com</a>
        to hear first.
      </p>`;
    if (countEl) countEl.textContent = "None scheduled";
    return;
  }

  const byId = new Map(events.map((e) => [String(e.id), e]));

  list.innerHTML = events
    .map((event) => rowHTML(event, availability(event)))
    .join("");

  if (countEl) {
    const n = events.filter((e) => e.status === "published").length;
    countEl.textContent = `${String(n).padStart(2, "0")} — ${n === 1 ? "show" : "shows"}`;
  }

  list.querySelectorAll("[data-signup]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const event = byId.get(btn.dataset.event);
      if (event) openSignup(event, btn.dataset.signup, btn);
    });
  });

  injectSchema(events);
}

load();
