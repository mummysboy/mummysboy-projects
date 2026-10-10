/**
 * request-email — the one email that goes out when a family member files a
 * request on /mummy/.
 *
 * Called by the `requests_notify` trigger in mummy.sql (via pg_net) with nothing
 * but a row id. The row is read back here with the service role, so the request
 * itself never sits in pg_net's queue as a second copy.
 *
 * One message, to the owner. Reply-To is the family member's own address, so
 * answering is just pressing Reply.
 *
 * Nothing in here may throw its way back into the transaction. The trigger
 * already swallows errors, and this function always answers 200: a request that
 * was saved must never look failed because an email provider had a bad minute.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** The owner's clock. The timestamp is for them, not the sender. */
const OWNER_TZ = "America/Los_Angeles";

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
 * Checks the caller's secret against the one the trigger reads, which lives in
 * Vault — the comparison happens in Postgres and the secret never leaves the
 * database. Only service_role may execute the function. Shared with signup-email.
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

type RequestRow = {
  id: string;
  user_id: string;
  sender_email: string;
  sender_name: string | null;
  kind: "money" | "call" | "message";
  urgency: "whenever" | "soon" | "urgent";
  reason: string | null;
  amount: string | number | null;
  topic: string | null;
  body: string | null;
  status: string;
  created_at: string;
};

const usd = (n: string | number) =>
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

const URGENCY_LABEL: Record<RequestRow["urgency"], string> = {
  whenever: "Whenever",
  soon: "Soon",
  urgent: "Urgent",
};

function alertFor(r: RequestRow) {
  const who = (r.sender_name ?? "").trim() || r.sender_email;
  // "Soon" is the default and the common case, so it earns no prefix; the two
  // ends of the scale do — that is what lets the subject line triage itself.
  const prefix =
    r.urgency === "urgent" ? "[Urgent] " : r.urgency === "whenever" ? "[Whenever] " : "";

  let subject: string;
  const rows: [string, string][] = [["From", `${who} <${r.sender_email}>`]];

  if (r.kind === "money") {
    subject = `${prefix}${who} needs ${usd(r.amount ?? 0)} — ${clip(r.reason ?? "", 60)}`;
    rows.push(["Kind", "Money"]);
    rows.push(["Urgency", URGENCY_LABEL[r.urgency]]);
    rows.push(["Amount", usd(r.amount ?? 0)]);
    rows.push(["Reason", r.reason ?? ""]);
  } else if (r.kind === "call") {
    subject = `${prefix}${who} wants a call — ${clip(r.topic ?? "", 60)}`;
    rows.push(["Kind", "Phone call"]);
    rows.push(["Urgency", URGENCY_LABEL[r.urgency]]);
    rows.push(["About", r.topic ?? ""]);
  } else {
    subject = `${who} sent a message — "${clip(r.body ?? "", 60)}"`;
    rows.push(["Kind", "Message"]);
    rows.push(["Message", r.body ?? ""]);
  }

  rows.push(["Sent", whenLabel(r.created_at)]);

  return {
    subject,
    text: [
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "",
      "Reply to this email to answer them.",
    ].join("\n"),
    html: wrap([
      `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">`,
      ...rows.map(
        ([k, v]) =>
          `<tr><td style="padding:2px 14px 2px 0;color:#4a5260;vertical-align:top;white-space:nowrap">${esc(k)}</td>` +
          `<td style="padding:2px 0;vertical-align:top;white-space:pre-wrap">${esc(v)}</td></tr>`,
      ),
      `</table>`,
      `<p style="margin:1.4em 0 0;color:#4a5260">Reply to this email to answer them.</p>`,
    ]),
  };
}

async function send(payload: Record<string, unknown>): Promise<void> {
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
    const { request_id } = await req.json();
    if (!request_id) return new Response("ok", { status: 200 });

    const res = await fetch(
      `${base}/rest/v1/requests?id=eq.${encodeURIComponent(request_id)}&select=*`,
      { headers: auth },
    );
    const [row] = (await res.json()) as RequestRow[];
    if (!row) {
      console.error("request not found", request_id);
      return new Response("ok", { status: 200 });
    }

    const from = env("MUMMY_MAIL_FROM");
    const alertTo = env("MUMMY_ALERT_TO");
    if (!from || !alertTo) {
      console.error("MUMMY_MAIL_FROM / MUMMY_ALERT_TO not set");
      return new Response("ok", { status: 200 });
    }

    const alert = alertFor(row);
    await send({
      from,
      to: [alertTo],
      reply_to: row.sender_email,
      subject: alert.subject,
      text: alert.text,
      html: alert.html,
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("request-email failed", err);
    // Still 200. The request itself is already saved; there is nothing the
    // caller can usefully do with a failure here.
    return new Response("ok", { status: 200 });
  }
});
