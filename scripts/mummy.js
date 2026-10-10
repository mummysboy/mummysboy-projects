/**
 * /mummy/ — the family request page.
 *
 * Sign in, press Request, tick any of money / a call / a message, fill in
 * their fields, send — one request, one email, however many things are in it. The row lands in `requests` (supabase/mummy.sql) and a
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

/**
 * Sign-in is by username, but Supabase Auth only knows emails, so a username
 * is an address under the site's own domain: "mummy" → mummy@mummysboy.com.
 * Nothing is ever sent to it (the domain has no mailbox), it is just the key
 * the account is stored under. A real address still works if someone has one.
 */
const USERNAME_DOMAIN = "mummysboy.com";
const toEmail = (u) => (u.includes("@") ? u : `${u.toLowerCase()}@${USERNAME_DOMAIN}`);

/** "Mummy" from user metadata, else from the username part of the address. */
function displayName(user) {
  const meta = (user.user_metadata?.name || "").trim();
  if (meta) return meta;
  const local = (user.email || "").split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

const LIMITS = { reason: 200, topic: 300, body: 2000, amount: 99_999_999.99 };

/** One request can carry any mix of these. Each toggle reveals its fields. */
const KINDS = {
  money: { fields: "moneyFields", first: "amount" },
  call: { fields: "callFields", first: "topic" },
  message: { fields: "messageFields", first: "body" },
};

const views = {
  signin: $("signinView"),
  home: $("homeView"),
  form: $("formView"),
  done: $("doneView"),
};

const signOutBtn = $("signOut");

const kinds = new Set();
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

  $("who").textContent = displayName(user);
  signOutBtn.hidden = false;
  show("home");
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

signOutBtn.addEventListener("click", async () => {
  await auth.signOut();
  location.reload();
});

// --- Home → form ------------------------------------------------------------

$("requestBtn").addEventListener("click", () => {
  resetForm();
  show("form");
});

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

/** Turn a kind on or off: its fields show/hide, and disabled controls leave
 *  the tab order and never submit — belt to the hidden attribute's braces. */
function setKind(kind, on, { focus = false } = {}) {
  if (on) kinds.add(kind);
  else kinds.delete(kind);

  const toggle = document.querySelector(`.pick__toggle[data-kind="${kind}"]`);
  toggle.setAttribute("aria-pressed", String(on));
  toggle.closest(".pick").classList.toggle("pick--on", on);

  const fields = $(KINDS[kind].fields);
  fields.hidden = !on;
  for (const c of fields.querySelectorAll("input, textarea")) {
    c.disabled = !on;
    if (!on) c.removeAttribute("aria-invalid");
  }
  if (on && focus) $(KINDS[kind].first).focus();
}

for (const toggle of document.querySelectorAll(".pick__toggle")) {
  toggle.addEventListener("click", () => {
    const kind = toggle.dataset.kind;
    setKind(kind, !kinds.has(kind), { focus: true });
  });
}

function resetForm() {
  const form = $("reqForm");
  form.reset();
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  setMsg($("reqMsg"), "");
  setUrgency("soon");
  for (const kind of Object.keys(KINDS)) setKind(kind, false);
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

  const msg = $("reqMsg");
  const btn = $("reqSubmit");
  for (const el of e.currentTarget.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");

  if (kinds.size === 0) {
    setMsg(msg, "Pick at least one thing to ask for.", "err");
    document.querySelector(".pick__toggle").focus();
    return;
  }

  const row = { kinds: [...kinds], urgency, reason: null, amount: null, topic: null, body: null };

  if (kinds.has("money")) {
    const amount = parseAmount($("amount").value);
    if (amount == null) return fail($("amount"), "Put in an amount, like 40 or 12.50.");
    const reason = textOf("reason");
    if (!reason) return fail($("reason"), "Say what the money is for.");
    if (reason.length > LIMITS.reason) return fail($("reason"), "Keep the reason under 200 characters.");
    row.amount = amount;
    row.reason = reason;
  }
  if (kinds.has("call")) {
    const topic = textOf("topic");
    if (!topic) return fail($("topic"), "Say what the call should be about.");
    if (topic.length > LIMITS.topic) return fail($("topic"), "Keep it under 300 characters.");
    row.topic = topic;
  }
  if (kinds.has("message")) {
    const body = textOf("body");
    if (!body) return fail($("body"), "Write the message first.");
    if (body.length > LIMITS.body) return fail($("body"), "Keep it under 2000 characters.");
    row.body = body;
  }

  btn.disabled = true;
  btn.textContent = "Sending…";
  setMsg(msg, "");

  try {
    await db.insert("requests", row);
    resetForm();
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
