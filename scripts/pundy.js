/**
 * /pundy/ — the owner's dashboard for family requests.
 *
 * Sign in (username, like /mummy/), see every request newest first, filter
 * open / done / all, mark them done. Reads `requests` with their `deliveries`
 * (when each thing goes, and whether it went) through the admin policies in
 * supabase/mummy.sql; the only write is `status`.
 *
 * Same Supabase project as IRL and /mummy/, its own session (`pundy.session`).
 * Power comes from a row in `admins`, exactly as the IRL console.
 */
import { SUPABASE_URL, SUPABASE_KEY } from "../data/irl-config.js";
import { createClient, DbError } from "./sb-client.js";

const { auth, db } = createClient({
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  storageKey: "pundy.session",
  retryAnon: false,
});

const $ = (id) => document.getElementById(id);

/** Same scheme as /mummy/: a username is an address under the site's own
 *  domain ("pundy" → pundy@mummysboy.com); a real email still works. */
const USERNAME_DOMAIN = "mummysboy.com";
const toEmail = (u) => (u.includes("@") ? u : `${u.toLowerCase()}@${USERNAME_DOMAIN}`);

const OWNER_TZ = "America/Los_Angeles";

const views = { signin: $("signinView"), dash: $("dashView") };
const signOutBtn = $("signOut");

let filter = "open";
let range = "week";
let requests = [];
let approved = []; // every approved money line: { approved_amount, decided_at }

// --- Helpers ----------------------------------------------------------------

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  views[name].querySelector("h1")?.focus();
  window.scrollTo(0, 0);
}

function setMsg(el, text, tone) {
  el.className = tone ? `formmsg formmsg--${tone}` : "formmsg";
  el.textContent = text || "";
}

/** Escape anything that goes in via innerHTML. */
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));

const when = (iso) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: OWNER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const clock = (iso) =>
  new Intl.DateTimeFormat("en-US", { timeZone: OWNER_TZ, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );

function senderName(r) {
  const meta = (r.sender_name || "").trim();
  if (meta) return meta;
  const local = (r.sender_email || "").split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Someone";
}

const URGENCY = { urgent: "Now", soon: "Tonight 7pm", whenever: "Tue/Thu 7pm" };

/** Parse "$1,200.50" → 1200.5; anything that isn't a non-negative amount → null. */
function parseAmount(raw) {
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999.99) return null;
  return Math.round(n * 100) / 100;
}

/** "sent 7:25 PM" / "goes 7:00 PM" / "goes Tue, Oct 13, 7:00 PM" for a delivery. */
function deliveryState(d) {
  if (!d) return "";
  if (d.sent_at) return `sent ${clock(d.sent_at)}`;
  const due = new Date(d.due_at);
  const sameDay =
    new Intl.DateTimeFormat("en-US", { timeZone: OWNER_TZ, dateStyle: "short" }).format(due) ===
    new Intl.DateTimeFormat("en-US", { timeZone: OWNER_TZ, dateStyle: "short" }).format(new Date());
  return `goes ${sameDay ? clock(d.due_at) : when(d.due_at)}`;
}

// --- Boot -------------------------------------------------------------------

async function boot() {
  auth.consumeUrlSession();
  const user = await auth.me();
  if (!user) {
    signOutBtn.hidden = true;
    show("signin");
    return;
  }

  // Power comes from a row in `admins`; RLS lets you read only your own.
  let rows = [];
  try {
    rows = (await db.select("admins", { select: "user_id" })) || [];
  } catch {
    rows = [];
  }
  if (!rows.length) {
    views.signin.innerHTML = `
      <h1 class="view__title" tabindex="-1">No access</h1>
      <p class="mm-lede">You are signed in as ${esc(user.email)}, but that account is not an admin.</p>`;
    signOutBtn.hidden = false;
    show("signin");
    return;
  }

  signOutBtn.hidden = false;
  show("dash");
  await load();
}

// --- Sign in ----------------------------------------------------------------

$("signinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("signinMsg");
  const btn = $("signinSubmit");
  const username = $("s-user").value.trim();
  const password = $("s-pass").value;

  if (!username || !password) {
    setMsg(msg, "Username and password, please.", "err");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Signing in…";
  setMsg(msg, "");
  try {
    await auth.signIn(toEmail(username), password);
    $("s-pass").value = "";
    await boot();
  } catch (err) {
    setMsg(msg, err instanceof DbError && err.message ? err.message : "Sign-in failed.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

signOutBtn.addEventListener("click", async () => {
  await auth.signOut();
  location.reload();
});

// --- Dashboard --------------------------------------------------------------

async function load() {
  const state = $("dashState");
  state.textContent = "Loading…";
  try {
    [requests, approved] = await Promise.all([
      db.select("requests", {
        select: "*,deliveries(id,kind,urgency,item,due_at,sent_at,decision,approved_amount,decided_at)",
        order: "created_at.desc",
        limit: 200,
      }),
      // Every approved money line ever, for the spending figures — small
      // numbers for a family, so no paging.
      db.select("deliveries", {
        select: "approved_amount,decided_at",
        kind: "eq.money",
        decision: "eq.approved",
      }),
    ]);
    requests = requests || [];
    approved = approved || [];
    renderTiles();
    renderChart();
    render();
  } catch (err) {
    if (err instanceof DbError && (err.status === 401 || err.status === 403)) {
      signOutBtn.hidden = true;
      show("signin");
      setMsg($("signinMsg"), "You were signed out — sign in again.", "err");
      return;
    }
    state.textContent =
      err instanceof DbError && err.message ? err.message : "Could not load the requests.";
  }
}

$("refresh").addEventListener("click", load);

// --- Figures ----------------------------------------------------------------
// Sums of approved amounts by when they were approved, in Pacific time:
// this week (from Monday), this month, this year, or everything.

/** The Pacific calendar date of an instant as a day number (UTC midnight of
 *  that y/m/d), plus its weekday — so period maths is plain subtraction. */
function laDay(iso) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OWNER_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y, m, day: Date.UTC(y, m - 1, d), dow };
}

function inRange(iso, now) {
  if (range === "all") return true;
  const t = laDay(iso);
  if (range === "year") return t.y === now.y;
  if (range === "month") return t.y === now.y && t.m === now.m;
  const monday = now.day - ((now.dow + 6) % 7) * 86_400_000; // week: from Monday
  return t.day >= monday;
}

const RANGE_LABEL = { week: "this week", month: "this month", year: "this year", all: "all time" };

/** Every money line across the loaded requests, with its request attached. */
function moneyLines() {
  return requests.flatMap((r) => (r.deliveries || []).filter((d) => d.kind === "money").map((d) => ({ ...d, r })));
}

const compact = (n) =>
  n >= 10_000
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n)
    : usd(n);

function renderTiles() {
  const now = laDay(new Date().toISOString());
  const label = RANGE_LABEL[range];

  const spent = approved.filter((a) => a.decided_at && inRange(a.decided_at, now));
  const spentTotal = spent.reduce((sum, a) => sum + Number(a.approved_amount || 0), 0);
  $("tSpent").textContent = compact(spentTotal);
  $("tSpentSub").textContent = `${spent.length} approved ${spent.length === 1 ? "thing" : "things"} ${label}`;

  const lines = moneyLines();
  const pending = lines.filter((d) => d.decision === "pending");
  const pendingTotal = pending.reduce((sum, d) => sum + Number(d.item?.amount || 0), 0);
  $("tPending").textContent = String(pending.length);
  $("tPendingSub").textContent = pending.length ? `${compact(pendingTotal)} asked` : "nothing waiting";

  const open = requests.filter((r) => r.status === "open");
  $("tOpen").textContent = String(open.length);
  $("tOpenSub").textContent = `${requests.length} in all`;

  const denied = lines.filter((d) => d.decision === "denied" && d.decided_at && inRange(d.decided_at, now));
  const deniedTotal = denied.reduce((sum, d) => sum + Number(d.item?.amount || 0), 0);
  $("tDenied").textContent = String(denied.length);
  $("tDeniedSub").textContent = denied.length ? `${compact(deniedTotal)} ${label}` : label;
}

for (const b of document.querySelectorAll(".pd-range .seg__btn")) {
  b.addEventListener("click", () => {
    range = b.dataset.range;
    for (const sib of b.parentElement.querySelectorAll(".seg__btn")) {
      sib.setAttribute("aria-pressed", String(sib === b));
    }
    renderTiles();
  });
}

// --- Chart: approved spending by month, last 12 months --------------------
// One series, so one hue and no legend: the title names it. Bars are thin,
// rounded at the data end and square at the baseline; the grid is a hairline.
// Hover (or focus) a bar for its value; a table of the same numbers is below.

function monthKey(iso) {
  const t = laDay(iso);
  return `${t.y}-${String(t.m).padStart(2, "0")}`;
}

function lastMonths(n) {
  const now = laDay(new Date().toISOString());
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = now.y;
    let m = now.m - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const label = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(Date.UTC(y, m - 1, 1)));
    out.push({ key: `${y}-${String(m).padStart(2, "0")}`, label, y, m });
  }
  return out;
}

function renderChart() {
  const months = lastMonths(12);
  const byMonth = new Map(months.map((mo) => [mo.key, { total: 0, count: 0 }]));
  for (const a of approved) {
    if (!a.decided_at) continue;
    const slot = byMonth.get(monthKey(a.decided_at));
    if (slot) {
      slot.total += Number(a.approved_amount || 0);
      slot.count += 1;
    }
  }

  const W = 640;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...months.map((mo) => byMonth.get(mo.key).total));
  const band = plotW / months.length;
  const barW = Math.min(24, band * 0.6);
  const baseline = padT + plotH;
  const r = 4;

  const bars = months.map((mo, i) => {
    const { total, count } = byMonth.get(mo.key);
    const h = Math.round((total / max) * plotH);
    const x = padL + band * i + (band - barW) / 2;
    const y = baseline - h;
    // Rounded at the top, square at the baseline.
    const path =
      h <= r
        ? `M${x},${baseline} h${barW} v${-h} h${-barW} z`
        : `M${x},${baseline} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`;
    const isMax = total === max && total > 0;
    return `
      <g class="bar" tabindex="0" role="img"
         aria-label="${esc(mo.label)}: ${esc(usd(total))}, ${count} approved"
         data-label="${esc(mo.label)}" data-total="${esc(usd(total))}" data-count="${count}">
        <rect class="bar__hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}" />
        <path class="bar__mark" d="${path}" />
        ${isMax ? `<text class="bar__value" x="${x + barW / 2}" y="${y - 6}" text-anchor="middle">${esc(usd(total))}</text>` : ""}
        <text class="bar__label" x="${padL + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${esc(mo.label)}</text>
      </g>`;
  });

  $("chartPlot").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Approved spending by month, last 12 months" preserveAspectRatio="none">
      <line class="chart__grid" x1="${padL}" x2="${W - padR}" y1="${padT}" y2="${padT}" />
      <line class="chart__grid" x1="${padL}" x2="${W - padR}" y1="${padT + plotH / 2}" y2="${padT + plotH / 2}" />
      <line class="chart__axis" x1="${padL}" x2="${W - padR}" y1="${baseline}" y2="${baseline}" />
      ${bars.join("")}
    </svg>`;

  const tip = $("chartTip");
  const showTip = (g) => {
    tip.textContent = `${g.dataset.label}: ${g.dataset.total} · ${g.dataset.count} approved`;
    tip.hidden = false;
  };
  for (const g of $("chartPlot").querySelectorAll(".bar")) {
    g.addEventListener("mouseenter", () => showTip(g));
    g.addEventListener("focus", () => showTip(g));
    g.addEventListener("mouseleave", () => (tip.hidden = true));
    g.addEventListener("blur", () => (tip.hidden = true));
  }

  $("chartTable").querySelector("tbody").innerHTML = months
    .map((mo) => {
      const { total, count } = byMonth.get(mo.key);
      return `<tr><th scope="row">${esc(mo.label)} ${mo.y}</th><td>${esc(usd(total))}</td><td>${count}</td></tr>`;
    })
    .join("");
}

function render() {
  const list = $("reqList");
  const state = $("dashState");
  const shown = requests.filter((r) => filter === "all" || r.status === filter);

  state.textContent = shown.length
    ? `${shown.length} ${filter === "all" ? "" : filter + " "}request${shown.length === 1 ? "" : "s"}`
    : filter === "open"
      ? "Nothing open."
      : "Nothing here.";

  list.innerHTML = shown.map(card).join("");

  for (const btn of list.querySelectorAll("[data-toggle]")) {
    btn.addEventListener("click", () => toggleStatus(btn.dataset.toggle, btn));
  }
  for (const btn of list.querySelectorAll("[data-approve]")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.approve;
      const input = $(`amt-${id}`);
      const amount = parseAmount(input.value);
      if (amount == null) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      decide(id, "approved", amount);
    });
  }
  for (const btn of list.querySelectorAll("[data-deny]")) {
    btn.addEventListener("click", () => decide(btn.dataset.deny, "denied", null));
  }
  for (const btn of list.querySelectorAll("[data-change]")) {
    btn.addEventListener("click", () => decide(btn.dataset.change, "pending", null));
  }
}

function card(r) {
  const kinds = new Set(r.kinds || []);
  const ds = r.deliveries || [];
  const parts = [];

  if (kinds.has("money")) {
    // One deliveries row per money line, each with its own decision.
    const lines = ds.filter((x) => x.kind === "money");
    const asked = lines.reduce((s, d) => s + Number(d.item?.amount || 0), 0);
    const ok = lines.filter((d) => d.decision === "approved");
    const okTotal = ok.reduce((s, d) => s + Number(d.approved_amount || 0), 0);
    const pending = lines.filter((d) => d.decision === "pending").length;
    const first = lines[0];
    parts.push(`
      <div class="req__part">
        <div class="req__head">
          <span class="req__kind">Money</span>
          <span class="req__meta">${esc(URGENCY[first?.urgency] || "")}${first ? " · " + esc(deliveryState(first)) : ""}</span>
        </div>
        <ul class="lines">
          ${lines.map(moneyLine).join("")}
        </ul>
        <p class="req__total">
          Asked ${esc(usd(asked))}${ok.length ? ` · approved ${esc(usd(okTotal))}` : ""}${pending ? ` · ${pending} to decide` : ""}
        </p>
      </div>`);
  }

  if (kinds.has("call")) {
    const d = ds.find((x) => x.kind === "call");
    parts.push(`
      <div class="req__part">
        <div class="req__head">
          <span class="req__kind">Phone call</span>
          <span class="req__meta">${esc(URGENCY[r.urgency] || "")}${d ? " · " + esc(deliveryState(d)) : ""}</span>
        </div>
        <p class="req__text">${esc(r.topic)}</p>
      </div>`);
  }

  if (kinds.has("message")) {
    const d = ds.find((x) => x.kind === "message");
    parts.push(`
      <div class="req__part">
        <div class="req__head">
          <span class="req__kind">Message</span>
          <span class="req__meta">${esc(URGENCY[r.message_urgency] || "")}${d ? " · " + esc(deliveryState(d)) : ""}</span>
        </div>
        <p class="req__text">${esc(r.body)}</p>
      </div>`);
  }

  const done = r.status === "done";
  return `
    <li class="req${done ? " req--done" : ""}" data-id="${esc(r.id)}">
      <div class="req__top">
        <span class="req__who">${esc(senderName(r))}</span>
        <span class="req__when">${esc(when(r.created_at))}</span>
      </div>
      ${parts.join("")}
      <div class="req__foot">
        <span class="req__status">${done ? "Done" : "Open"}</span>
        <button class="btn ${done ? "btn--ghost" : "btn--solid"}" type="button" data-toggle="${esc(r.id)}">
          ${done ? "Reopen" : "Mark done"}
        </button>
      </div>
    </li>`;
}

/** A money line: what was asked, and either the decision or the controls. */
function moneyLine(d) {
  const amount = Number(d.item?.amount || 0);
  const reason = d.item?.reason || "";
  if (d.decision === "approved") {
    const changed = Number(d.approved_amount) !== amount;
    return `
      <li class="line line--approved" data-line="${esc(d.id)}">
        <span class="line__asked"><b>${esc(usd(amount))}</b> ${esc(reason)}</span>
        <span class="line__state">Approved${changed ? ` ${esc(usd(d.approved_amount))}` : ""}</span>
        <button class="line__change" type="button" data-change="${esc(d.id)}">Change</button>
      </li>`;
  }
  if (d.decision === "denied") {
    return `
      <li class="line line--denied" data-line="${esc(d.id)}">
        <span class="line__asked"><b>${esc(usd(amount))}</b> ${esc(reason)}</span>
        <span class="line__state">Denied</span>
        <button class="line__change" type="button" data-change="${esc(d.id)}">Change</button>
      </li>`;
  }
  return `
    <li class="line" data-line="${esc(d.id)}">
      <span class="line__asked"><b>${esc(usd(amount))}</b> ${esc(reason)}</span>
      <div class="line__ctl">
        <label class="sr-only" for="amt-${esc(d.id)}">Amount to approve</label>
        <div class="amount line__amt">
          <span class="amount__sign" aria-hidden="true">$</span>
          <input class="input" id="amt-${esc(d.id)}" type="text" inputmode="decimal" value="${esc(amount.toFixed(2))}" />
        </div>
        <button class="btn btn--solid btn--mini" type="button" data-approve="${esc(d.id)}">Approve</button>
        <button class="btn btn--ghost btn--mini" type="button" data-deny="${esc(d.id)}">Deny</button>
      </div>
    </li>`;
}

function findDelivery(id) {
  for (const r of requests) {
    const d = (r.deliveries || []).find((x) => x.id === id);
    if (d) return d;
  }
  return null;
}

/** Record a decision on one money line, then refresh the figures. */
async function decide(id, decision, amount) {
  const d = findDelivery(id);
  if (!d) return;
  const patch = {
    decision,
    approved_amount: decision === "approved" ? amount : null,
    decided_at: decision === "pending" ? null : new Date().toISOString(),
  };
  try {
    await db.update("deliveries", { id: `eq.${id}` }, patch, { returning: false });
    Object.assign(d, patch);
    approved = (await db.select("deliveries", {
      select: "approved_amount,decided_at",
      kind: "eq.money",
      decision: "eq.approved",
    })) || [];
    renderTiles();
    renderChart();
    render();
  } catch (err) {
    $("dashState").textContent =
      err instanceof DbError && err.message ? err.message : "Could not save that.";
  }
}

async function toggleStatus(id, btn) {
  const r = requests.find((x) => x.id === id);
  if (!r) return;
  const next = r.status === "done" ? "open" : "done";
  btn.disabled = true;
  try {
    await db.update("requests", { id: `eq.${id}` }, { status: next }, { returning: false });
    r.status = next;
    renderTiles();
    render();
  } catch (err) {
    $("dashState").textContent =
      err instanceof DbError && err.message ? err.message : "Could not update it.";
    btn.disabled = false;
  }
}

boot();
