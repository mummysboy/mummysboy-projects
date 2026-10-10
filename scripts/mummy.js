/**
 * /mummy/ — the family request page.
 *
 * Sign in, press Request, pick money / a call / a message, fill in the two or
 * three fields, send. The row lands in `requests` (supabase/mummy.sql) and a
 * trigger emails Isaac. Nothing else happens here: no analytics, no history.
 *
 * Same Supabase project as IRL, but its own session (`mummy.session`), so
 * signing out here never signs the admin console out, and vice versa. Any
 * account in the project may file a request — the `admins` table gates IRL,
 * not this. Who filed it is stamped on the row by column defaults from the
 * JWT; the client never sends identity fields.
 */
import { SUPABASE_URL, SUPABASE_KEY } from "../data/irl-config.js";
import { createClient, DbError } from "./sb-client.js";

const { auth, db } = createClient({
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  storageKey: "mummy.session",
  // Everything here needs a signed-in user, so a refused token should come
  // back as "sign in again", not be swapped for an anonymous retry.
  retryAnon: false,
});

const $ = (id) => document.getElementById(id);

const LIMITS = { reason: 200, topic: 300, body: 2000, amount: 99_999_999.99 };

const TITLES = {
  money: "How much, and what for?",
  call: "What's the call about?",
  message: "What do you want to say?",
};

/** Which fields each kind shows. Everything else is hidden and disabled. */
const FIELDS = {
  money: ["urgencyField", "amountField", "reasonField"],
  call: ["urgencyField", "topicField"],
  message: ["bodyField"],
};

const views = {
  signin: $("signinView"),
  home: $("homeView"),
  chooser: $("chooserView"),
  form: $("formView"),
  done: $("doneView"),
};

const signOutBtn = $("signOut");

let kind = null;
let urgency = "soon";

// --- Views ------------------------------------------------------------------

/** Show one view, hide the rest, and put focus on its heading so a screen
 *  reader (and the scroll position) follows the swap. */
function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  const heading = views[name].querySelector("h1");
  if (heading) heading.focus({ preventScroll: false });
  window.scrollTo(0, 0);
}

function setMsg(el, text, tone) {
  el.className = tone ? `formmsg formmsg--${tone}` : "formmsg";
  el.textContent = text || "";
}

// --- Boot -------------------------------------------------------------------

async function boot() {
  auth.consumeUrlSession(); // magic-link landing

  const user = await auth.me();
  if (!user) {
    signOutBtn.hidden = true;
    show("signin");
    return;
  }

  $("who").textContent = user.user_metadata?.name || user.email || "there";
  signOutBtn.hidden = false;
  show("home");
}

// --- Sign in ----------------------------------------------------------------

$("signinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("signinMsg");
  const btn = $("signinSubmit");
  const email = $("s-email").value.trim();
  const password = $("s-pass").value;

  if (!email || !password) {
    setMsg(msg, "Email and password, please.", "err");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Signing in…";
  setMsg(msg, "");

  try {
    await auth.signIn(email, password);
    $("s-pass").value = "";
    await boot();
  } catch (err) {
    setMsg(
      msg,
      err instanceof DbError && err.message ? err.message : "Sign-in failed.",
      "err",
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

$("magicBtn").addEventListener("click", async () => {
  const msg = $("signinMsg");
  const email = $("s-email").value.trim();
  if (!email) {
    setMsg(msg, "Put your email in first.", "err");
    $("s-email").focus();
    return;
  }
  try {
    await auth.sendMagicLink(email, location.origin + location.pathname);
    setMsg(msg, "Link sent. Check your email on this device.", "ok");
  } catch (err) {
    setMsg(
      msg,
      err instanceof DbError && err.message ? err.message : "Could not send it.",
      "err",
    );
  }
});

signOutBtn.addEventListener("click", async () => {
  await auth.signOut();
  location.reload();
});

// --- Home → chooser → form --------------------------------------------------

$("requestBtn").addEventListener("click", () => show("chooser"));

for (const pick of document.querySelectorAll(".pick")) {
  pick.addEventListener("click", () => configureForm(pick.dataset.kind));
}

for (const back of document.querySelectorAll("[data-back]")) {
  back.addEventListener("click", () => show(back.dataset.back));
}

function setUrgency(value) {
  urgency = value;
  for (const b of $("urgencySeg").querySelectorAll(".seg__btn")) {
    b.setAttribute("aria-pressed", String(b.dataset.urgency === value));
  }
}

$("urgencySeg").addEventListener("click", (e) => {
  const b = e.target.closest(".seg__btn");
  if (b) setUrgency(b.dataset.urgency);
});

function configureForm(next) {
  kind = next;
  const form = $("reqForm");
  form.reset();
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  setMsg($("reqMsg"), "");
  setUrgency("soon");

  $("formTitle").textContent = TITLES[kind];

  const wanted = new Set(FIELDS[kind]);
  for (const id of ["urgencyField", "amountField", "reasonField", "topicField", "bodyField"]) {
    const field = $(id);
    const on = wanted.has(id);
    field.hidden = !on;
    // Disabled controls leave the tab order and never submit — belt to the
    // hidden attribute's braces.
    for (const c of field.querySelectorAll("input, textarea, button")) c.disabled = !on;
  }

  show("form");
}

// --- Validation + submit ----------------------------------------------------

/** "$1,200.50" → 1200.5; anything that isn't a positive dollar amount → null. */
function parseAmount(raw) {
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > LIMITS.amount) return null;
  return Math.round(n * 100) / 100;
}

function fail(input, message) {
  input.setAttribute("aria-invalid", "true");
  setMsg($("reqMsg"), message, "err");
  input.focus();
}

function textOf(id) {
  return $(id).value.trim();
}

$("reqForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!kind) return show("chooser");

  const msg = $("reqMsg");
  const btn = $("reqSubmit");
  for (const el of e.currentTarget.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");

  const row = { kind, urgency, reason: null, amount: null, topic: null, body: null };

  if (kind === "money") {
    const amount = parseAmount($("amount").value);
    if (amount == null) return fail($("amount"), "Put in an amount, like 40 or 12.50.");
    const reason = textOf("reason");
    if (!reason) return fail($("reason"), "Say what it's for.");
    if (reason.length > LIMITS.reason) return fail($("reason"), "Keep the reason under 200 characters.");
    row.amount = amount;
    row.reason = reason;
  } else if (kind === "call") {
    const topic = textOf("topic");
    if (!topic) return fail($("topic"), "Say what the call should be about.");
    if (topic.length > LIMITS.topic) return fail($("topic"), "Keep it under 300 characters.");
    row.topic = topic;
  } else {
    const body = textOf("body");
    if (!body) return fail($("body"), "Write something first.");
    if (body.length > LIMITS.body) return fail($("body"), "Keep it under 2000 characters.");
    row.body = body;
    row.urgency = "soon"; // not asked for a message; the default is honest
  }

  btn.disabled = true;
  btn.textContent = "Sending…";
  setMsg(msg, "");

  try {
    await db.insert("requests", row);
    $("reqForm").reset();
    show("done");
  } catch (err) {
    if (err instanceof DbError && (err.status === 401 || err.status === 403)) {
      // The session died under us. Send them back to the door with a reason.
      signOutBtn.hidden = true;
      show("signin");
      setMsg($("signinMsg"), "You were signed out — sign in again.", "err");
    } else {
      setMsg(
        msg,
        err instanceof DbError && err.message ? err.message : "Could not send it. Try again.",
        "err",
      );
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Send";
  }
});

boot();
