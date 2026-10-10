/**
 * request-email — mails Pundy the deliveries that are due.
 *
 * Called by private.dispatch_due() in mummy.sql (via pg_net) — straight from
 * the insert trigger for anything urgent, and every minute from pg_cron for
 * the rest — with nothing but a list of `deliveries` ids. The rows are read
 * back here with the service role, so no request content ever sits in
 * pg_net's queue as a second copy.
 *
 * A batch is whatever came due together: an urgent request's lines right
 * now, or the day's "soon" items at 7pm, or Tuesday's "whenever" pile. One
 * email goes out per urgency in the batch, and the rows it covered are marked
 * sent. If the mailer fails the rows stay unsent and the dispatcher retries
 * them ten minutes later.
 *
 * Nothing in here may throw its way back into the database: this function
 * always answers 200.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";

/** The owner's clock. The timestamp is for them, not the sender. */
const OWNER_TZ = "America/Los_Angeles";

/** Usernames are stored as addresses under the site's own domain (see
 *  scripts/mummy.js). Such an address has no mailbox, so it is never a Reply-To. */
const USERNAME_DOMAIN = "mummysboy.com";

const env = (name: string) => Deno.env.get(name) ?? "";

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/**
 * Checks the caller's secret against the one the dispatcher reads, which lives
 * in Vault — the comparison happens in Postgres and the secret never leaves
 * the database. Only service_role may execute the function. Shared with
 * signup-email.
 */
async function secretOk(candidate: string, base: string, key: string): Promise<boolean> {
  if (!candidate) return false;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/irl_webhook_secret_ok`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ candidate }),
    });
    return res.ok && (await res.json()) === true;
  } catch (err) {
    console.error("secret check failed", err);
    return false;
  }
}

type Urgency = "whenever" | "soon" | "urgent";

type Delivery = {
  id: string;
  request_id: string;
  kind: "money" | "call" | "message";
  urgency: Urgency | null; // null only on rows from before messages had one
  item: { amount?: number; reason?: string; topic?: string; body?: string };
  due_at: string;
  created_at: string;
  request: { sender_email: string; sender_name: string | null } | null;
  summary?: string; // Claude's précis of a call topic or message, filled in here
};

/**
 * Ask Claude for a short summary of what a call should be about or what a
 * message says, so the email leads with the gist. Plain HTTP on purpose: the
 * function has no imports (see CLAUDE.md → Stack), and this is one request.
 *
 * Every failure returns null and the email carries the original words: a
 * missing key, a timeout, a refusal, a bad status — none of them may cost a
 * delivery. Opus 5.5 at low effort is plenty for a two-sentence précis;
 * `fallbacks: "default"` lets the API re-route a refused request itself.
 */
async function summarize(kind: "call" | "message", who: string, text: string): Promise<string | null> {
  const key = env("ANTHROPIC_API_KEY");
  if (!key || !text.trim()) return null;

  const what = kind === "call" ? "what the phone call is for" : "what it says";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(CLAUDE_ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: "claude-opus-5-5",
        max_tokens: 1024,
        fallbacks: "default",
        output_config: { effort: "low" },
        system:
          `You condense a note from a family member (${who}) to their son, Pundy, into ${what}. ` +
          `Be terse and dry: the fewest words that carry the facts. One line per separate point, ` +
          `no full sentences needed, no pleasantries, no softening, no commentary, no advice. ` +
          `Keep names, times, amounts and places exactly. Drop greetings, sign-offs and asides ` +
          `with no action or fact in them. Output only the condensed note, nothing else.`,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) {
      console.error("claude failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") {
      console.error("claude refused", data.stop_details);
      return null;
    }
    const out = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();
    return out || null;
  } catch (err) {
    console.error("claude call failed", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const isSynthetic = (email: string) => email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`);

/** "mummy@mummysboy.com" → "Mummy". */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : email;
}

function senderName(d: Delivery): string {
  const email = d.request?.sender_email ?? "";
  return (d.request?.sender_name ?? "").trim() || nameFromEmail(email);
}

const usd = (n: number | string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n),
  );

const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

function whenLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: OWNER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Wraps body lines in the plainest HTML that still reads well in a mail client.
 *  No images, no web fonts, no tracking pixel. */
function wrap(lines: string[]): string {
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#141417;max-width:34em">`,
    ...lines,
    `</div>`,
  ].join("");
}

/** The three batches, and how each announces itself. */
const BUCKET: Record<Urgency, { prefix: string; intro: string }> = {
  urgent: { prefix: "[Urgent] ", intro: "" },
  soon: { prefix: "[Today] ", intro: "Asked for today, sent at 7pm." },
  whenever: { prefix: "[Whenever] ", intro: "Asked for whenever — the Tuesday/Thursday round-up." },
};

function digestFor(bucket: Urgency, ds: Delivery[]) {
  const money = ds.filter((d) => d.kind === "money");
  const calls = ds.filter((d) => d.kind === "call");
  const messages = ds.filter((d) => d.kind === "message");
  const total = money.reduce((sum, d) => sum + Number(d.item.amount ?? 0), 0);

  // Everyone in the batch — one name in practice, but say so if not.
  const who = [...new Set(ds.map(senderName))].join(" & ");
  const many = [money.length, calls.length, messages.length].filter((n) => n > 0).length > 1;
  const clipTo = many ? 36 : 60;

  const parts: string[] = [];
  if (money.length) {
    parts.push(`needs ${usd(total)} — ${clip(money.map((d) => d.item.reason ?? "").join(", "), clipTo)}`);
  }
  const callText = (d: Delivery) => d.summary ?? d.item.topic ?? "";
  const messageText = (d: Delivery) => d.summary ?? d.item.body ?? "";
  if (calls.length) {
    parts.push(
      calls.length === 1
        ? `wants a call — ${clip(callText(calls[0]), clipTo)}`
        : `wants ${calls.length} calls`,
    );
  }
  if (messages.length) {
    parts.push(
      messages.length === 1 && !many
        ? `sent a message — ${clip(messageText(messages[0]), clipTo)}`
        : messages.length === 1
          ? "sent a message"
          : `sent ${messages.length} messages`,
    );
  }

  // Urgent gets the family's own alarm phrase, so it stands out in a glance
  // at the inbox; the digests keep the descriptive subject.
  const subject =
    bucket === "urgent"
      ? "Madre is caliente"
      : `${BUCKET[bucket].prefix}${who} ${parts.join(" · ")}`;

  // The body: one line per thing, grouped by kind. The sender's address is
  // shown when it is real — a username login has nothing to reply to.
  const senders = [...new Set(ds.map((d) => d.request?.sender_email ?? ""))].filter(Boolean);
  const rows: [string, string][] = [
    ["From", senders.map((e) => (isSynthetic(e) ? nameFromEmail(e) : `${nameFromEmail(e)} <${e}>`)).join(", ")],
  ];
  if (money.length) {
    rows.push(["Money", money.map((d) => `${usd(d.item.amount ?? 0)} — ${d.item.reason ?? ""}`).join("\n")]);
    if (money.length > 1) rows.push(["Total", usd(total)]);
  }
  // The summary is what the email says. The original words sit behind a
  // "View full message" drop-down (a <details> in the HTML; a trailer in the
  // plain text), so they are there when needed and out of the way when not.
  const full: [string, string][] = [];
  for (const c of calls) {
    rows.push(["Call about", callText(c)]);
    if (c.summary) full.push(["Call", c.item.topic ?? ""]);
  }
  for (const m of messages) {
    rows.push(["Message", messageText(m)]);
    if (m.summary) full.push(["Message", m.item.body ?? ""]);
  }
  rows.push([
    "Asked",
    [...new Set(ds.map((d) => whenLabel(d.created_at)))].join(", "),
  ]);

  const intro = BUCKET[bucket].intro;
  const replyable = senders.some((e) => !isSynthetic(e));

  return {
    subject,
    text: [
      ...(intro ? [intro, ""] : []),
      ...rows.map(([k, v]) => `${k}: ${v}`),
      ...(replyable ? ["", "Reply to this email to answer them."] : []),
      ...full.flatMap(([k, v]) => ["", `--- Full ${k.toLowerCase()} ---`, v]),
    ].join("\n"),
    html: wrap([
      ...(intro ? [`<p style="margin:0 0 1em;color:#4a5260">${esc(intro)}</p>`] : []),
      `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">`,
      ...rows.map(
        ([k, v]) =>
          `<tr><td style="padding:2px 14px 2px 0;color:#4a5260;vertical-align:top;white-space:nowrap">${esc(k)}</td>` +
          `<td style="padding:2px 0;vertical-align:top;white-space:pre-wrap">${esc(v)}</td></tr>`,
      ),
      `</table>`,
      ...(replyable
        ? [`<p style="margin:1.4em 0 0;color:#4a5260">Reply to this email to answer them.</p>`]
        : []),
      ...full.map(
        ([k, v]) =>
          `<details style="margin:1.2em 0 0"><summary style="cursor:pointer;color:#4a5260">View full ${esc(k.toLowerCase())}</summary>` +
          `<p style="margin:0.6em 0 0;white-space:pre-wrap">${esc(v)}</p></details>`,
      ),
    ]),
    replyTo: replyable ? senders.filter((e) => !isSynthetic(e))[0] : undefined,
  };
}

async function send(payload: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("resend failed", res.status, await res.text());
    return false;
  }
  return true;
}

async function markSent(ids: string[], base: string, key: string): Promise<void> {
  try {
    const list = ids.map(encodeURIComponent).join(",");
    await fetch(`${base}/rest/v1/deliveries?id=in.(${list})`, {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ sent_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.error("markSent failed", err);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const base = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const auth = { apikey: key, Authorization: `Bearer ${key}` };

  if (!(await secretOk(req.headers.get("x-irl-secret") ?? "", base, key))) {
    // Reachable without a user JWT so the database can call it, which makes
    // this header the only thing between the open internet and a free email
    // sender. Say nothing useful about why it failed.
    return new Response("no", { status: 401 });
  }

  try {
    const { delivery_ids } = await req.json();
    const ids: string[] = Array.isArray(delivery_ids) ? delivery_ids.map(String) : [];
    if (!ids.length) return new Response("ok", { status: 200 });

    const list = ids.map(encodeURIComponent).join(",");
    const res = await fetch(
      `${base}/rest/v1/deliveries?id=in.(${list})&sent_at=is.null` +
        `&select=*,request:requests(sender_email,sender_name)&order=created_at.asc`,
      { headers: auth },
    );
    const deliveries = (await res.json()) as Delivery[];
    if (!Array.isArray(deliveries) || !deliveries.length) {
      return new Response("ok", { status: 200 });
    }

    const from = env("MUMMY_MAIL_FROM");
    const alertTo = env("MUMMY_ALERT_TO");
    if (!from || !alertTo) {
      console.error("MUMMY_MAIL_FROM / MUMMY_ALERT_TO not set");
      return new Response("ok", { status: 200 });
    }

    // Calls and messages get a précis from Claude first (in parallel; a
    // failure just leaves the original words).
    await Promise.all(
      deliveries
        .filter((d) => d.kind === "call" || d.kind === "message")
        .map(async (d) => {
          const text = d.kind === "call" ? d.item.topic ?? "" : d.item.body ?? "";
          const s = await summarize(d.kind as "call" | "message", senderName(d), text);
          if (s) d.summary = s;
        }),
    );

    // One email per urgency present in the batch.
    const groups = new Map<Urgency, Delivery[]>();
    for (const d of deliveries) {
      const bucket: Urgency = d.urgency ?? "urgent";
      groups.set(bucket, [...(groups.get(bucket) ?? []), d]);
    }

    for (const [bucket, ds] of groups) {
      const digest = digestFor(bucket, ds);
      const ok = await send({
        from,
        to: [alertTo],
        ...(digest.replyTo ? { reply_to: digest.replyTo } : {}),
        subject: digest.subject,
        text: digest.text,
        html: digest.html,
      });
      if (ok) await markSent(ds.map((d) => d.id), base, key);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("request-email failed", err);
    // Still 200. The requests are already saved; the dispatcher will retry.
    return new Response("ok", { status: 200 });
  }
});
