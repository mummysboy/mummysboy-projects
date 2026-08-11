/**
 * signup-email — the two emails that go out when someone signs up for a show.
 *
 * Called by the `signups_notify` trigger in schema.sql (via pg_net) with nothing
 * but a row id. The row is read back here with the service role, so no personal
 * data ever sits in pg_net's request queue as well as in `signups`.
 *
 * Two messages per signup:
 *   1. an alert to us, with everything the lineup gets built from;
 *   2. a confirmation to the person, whose wording depends on what actually
 *      happened to them — an application is not a place, and a waitlisted
 *      spectator must not be told their seats are held.
 *
 * Nothing in here may throw its way back into the transaction. The trigger
 * already swallows errors, and this function always answers 200: a sign-up that
 * succeeded must never look failed because an email provider had a bad minute.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Shows run in San Francisco. `events` has no per-show timezone column, so if
 *  IRL ever runs a night in another city this needs to become one — a 7pm show
 *  would otherwise be announced in Pacific time to someone standing in London. */
const EVENT_TZ = "America/Los_Angeles";

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

/** Length-independent compare, so the secret can't be guessed a byte at a time. */
function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

type Signup = {
  id: string;
  event_id: string;
  role: "participant" | "spectator";
  status: string;
  name: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  age: number | null;
  gender: string | null;
  seeking: string[] | null;
  looking_for: string | null;
  about: string | null;
  party_size: number;
  consent_age: boolean;
  consent_conduct: boolean;
  consent_filming: boolean;
  created_at: string;
};

type EventRow = {
  slug: string;
  title: string;
  venue_name: string;
  address: string | null;
  city: string;
  starts_at: string;
  ends_at: string | null;
  doors_at: string | null;
  ticket_note: string | null;
  min_age: number;
};

/** "Wednesday, September 16 · 7:00 – 9:00 PM" in the venue's own timezone. */
function whenLabel(ev: EventRow): string {
  const start = new Date(ev.starts_at);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  const clock = ev.ends_at
    ? `${time.format(start)} – ${time.format(new Date(ev.ends_at))}`
    : time.format(start);
  return `${day} · ${clock}`;
}

function whereLabel(ev: EventRow): string {
  return [ev.venue_name, ev.address, ev.city].filter(Boolean).join(", ");
}

/** Wraps body lines in the plainest HTML that still reads well in a mail client.
 *  No images, no web fonts, no tracking pixel — this is a confirmation, not a
 *  campaign, and the site's own privacy notice says we don't track you here. */
function wrap(lines: string[]): string {
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#141417;max-width:34em">`,
    ...lines,
    `</div>`,
  ].join("");
}

function confirmationFor(s: Signup, ev: EventRow) {
  const when = whenLabel(ev);
  const where = whereLabel(ev);
  const details = [
    `<p style="margin:1.2em 0"><strong>${esc(ev.title)}</strong><br>`,
    `${esc(when)}<br>`,
    `${esc(where)}`,
    ev.ticket_note ? `<br>${esc(ev.ticket_note)}` : "",
    `</p>`,
  ].join("");

  // Participants are never told they have a place — lineups are built by hand
  // and this email goes out the moment the form is submitted.
  if (s.role === "participant") {
    return {
      subject: `Your application is in — ${ev.title}`,
      text:
        `Thanks ${s.name} — your application to play is in.\n\n` +
        `${ev.title}\n${when}\n${where}\n` +
        (ev.ticket_note ? `${ev.ticket_note}\n` : "") +
        `\nEvery application is read by a person and we build each lineup by hand, ` +
        `usually about a week before the show. This email confirms we have your ` +
        `application — it is not a place on the lineup yet, and we will email you ` +
        `either way.\n\n` +
        `If a show fills before we get to you, you stay on the list for the next ` +
        `one — you do not need to apply again.\n\n` +
        `Changed your mind, or want your details deleted? Reply to this email and ` +
        `we will take care of it.\n`,
      html: wrap([
        `<p style="margin:0 0 1.2em">Thanks ${esc(s.name)} — your application to play is in.</p>`,
        details,
        `<p style="margin:1.2em 0">Every application is read by a person and we build each lineup by hand, usually about a week before the show. This email confirms we have your application — <strong>it is not a place on the lineup yet</strong>, and we will email you either way.</p>`,
        `<p style="margin:1.2em 0">If a show fills before we get to you, you stay on the list for the next one — you do not need to apply again.</p>`,
        `<p style="margin:1.2em 0;color:#4a5260">Changed your mind, or want your details deleted? Reply to this email and we will take care of it.</p>`,
      ]),
    };
  }

  const seats = s.party_size === 1 ? "1 seat" : `${s.party_size} seats`;

  // A waitlisted spectator turning up to a full door is the exact failure the
  // RPC returns a status to prevent. Say it plainly.
  if (s.status === "waitlist") {
    return {
      subject: `You are on the waitlist — ${ev.title}`,
      text:
        `Thanks ${s.name}. The show was full when your request came in, so you ` +
        `are on the waitlist for ${seats}.\n\n` +
        `${ev.title}\n${when}\n${where}\n` +
        (ev.ticket_note ? `${ev.ticket_note}\n` : "") +
        `\nWe will email you if seats free up. Please do not travel for this one ` +
        `unless you hear from us — we cannot let you in without a confirmed seat.\n\n` +
        `Want off the list, or your details deleted? Reply to this email.\n`,
      html: wrap([
        `<p style="margin:0 0 1.2em">Thanks ${esc(s.name)}. The show was full when your request came in, so you are on the waitlist for ${esc(seats)}.</p>`,
        details,
        `<p style="margin:1.2em 0">We will email you if seats free up. <strong>Please do not travel for this one unless you hear from us</strong> — we cannot let you in without a confirmed seat.</p>`,
        `<p style="margin:1.2em 0;color:#4a5260">Want off the list, or your details deleted? Reply to this email.</p>`,
      ]),
    };
  }

  return {
    subject: `${seats} held — ${ev.title}`,
    text:
      `Thanks ${s.name} — ${seats} are held under your name at the door.\n\n` +
      `${ev.title}\n${when}\n${where}\n` +
      (ev.ticket_note ? `${ev.ticket_note}\n` : "") +
      `\nNothing to print and nothing to pay here. Give your name at the door. ` +
      `You must be ${ev.min_age} or over and bring ID.\n\n` +
      `If you cannot make it, reply and tell us so we can give the seats to ` +
      `someone on the waitlist. Want your details deleted? Reply and ask.\n`,
    html: wrap([
      `<p style="margin:0 0 1.2em">Thanks ${esc(s.name)} — <strong>${esc(seats)}</strong> are held under your name at the door.</p>`,
      details,
      `<p style="margin:1.2em 0">Nothing to print and nothing to pay here. Give your name at the door. You must be ${esc(ev.min_age)} or over and bring ID.</p>`,
      `<p style="margin:1.2em 0;color:#4a5260">If you cannot make it, reply and tell us so we can give the seats to someone on the waitlist. Want your details deleted? Reply and ask.</p>`,
    ]),
  };
}

function alertFor(s: Signup, ev: EventRow) {
  const rows: [string, unknown][] =
    s.role === "participant"
      ? [
          ["Show", ev.title],
          ["When", whenLabel(ev)],
          ["Role", "Participant — wants to play"],
          ["Status", s.status],
          ["Name", s.name],
          ["Email", s.email],
          ["Phone", s.phone || "—"],
          ["Instagram", s.instagram || "—"],
          ["Age", s.age ?? "—"],
          ["Describes self as", s.gender || "—"],
          ["Wants to meet", (s.seeking || []).join(", ") || "—"],
          ["Looking for", s.looking_for || "—"],
          ["About", s.about || "—"],
          ["On camera", s.consent_filming ? "yes" : "NO — keep out of footage"],
          ["Age confirmed", s.consent_age ? "yes" : "no"],
          ["House rules", s.consent_conduct ? "agreed" : "no"],
        ]
      : [
          ["Show", ev.title],
          ["When", whenLabel(ev)],
          ["Role", "Spectator"],
          ["Status", s.status],
          ["Seats", s.party_size],
          ["Name", s.name],
          ["Email", s.email],
          ["Phone", s.phone || "—"],
          ["Age confirmed", s.consent_age ? "yes" : "no"],
        ];

  const label =
    s.role === "participant"
      ? `Application — ${s.name}`
      : `${s.party_size === 1 ? "1 seat" : `${s.party_size} seats`} — ${s.name}`;

  return {
    subject: `IRL ${s.status}: ${label} · ${ev.title}`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
    html: wrap([
      `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">`,
      ...rows.map(
        ([k, v]) =>
          `<tr><td style="padding:2px 14px 2px 0;color:#4a5260;vertical-align:top;white-space:nowrap">${esc(k)}</td>` +
          `<td style="padding:2px 0;vertical-align:top">${esc(v)}</td></tr>`,
      ),
      `</table>`,
      `<p style="margin:1.4em 0 0"><a href="https://mummysboy.com/irldatingshows/admin/">Open the admin console</a></p>`,
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
    // Logged, not thrown: one failed message must not cost us the other one.
    console.error("resend failed", res.status, await res.text());
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  if (!secretsMatch(req.headers.get("x-irl-secret") ?? "", env("IRL_WEBHOOK_SECRET"))) {
    // The function is reachable without a user JWT so the database can call it,
    // which makes this header the only thing standing between the open internet
    // and a free email sender. Say nothing useful about why it failed.
    return new Response("no", { status: 401 });
  }

  try {
    const { signup_id } = await req.json();
    if (!signup_id) return new Response("ok", { status: 200 });

    const base = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    const auth = { apikey: key, Authorization: `Bearer ${key}` };

    const sRes = await fetch(
      `${base}/rest/v1/signups?id=eq.${encodeURIComponent(signup_id)}&select=*`,
      { headers: auth },
    );
    const [signup] = (await sRes.json()) as Signup[];
    if (!signup) {
      console.error("signup not found", signup_id);
      return new Response("ok", { status: 200 });
    }

    const eRes = await fetch(
      `${base}/rest/v1/events?id=eq.${encodeURIComponent(signup.event_id)}` +
        `&select=slug,title,venue_name,address,city,starts_at,ends_at,doors_at,ticket_note,min_age`,
      { headers: auth },
    );
    const [event] = (await eRes.json()) as EventRow[];
    if (!event) {
      console.error("event not found", signup.event_id);
      return new Response("ok", { status: 200 });
    }

    const from = env("IRL_MAIL_FROM");
    const replyTo = env("IRL_MAIL_REPLY_TO");
    const alertTo = env("IRL_ALERT_TO");

    const confirmation = confirmationFor(signup, event);
    const alert = alertFor(signup, event);

    // Both go out together; neither waits on the other's outcome.
    await Promise.all([
      send({
        from,
        to: [signup.email],
        reply_to: replyTo,
        subject: confirmation.subject,
        text: confirmation.text,
        html: confirmation.html,
      }),
      alertTo
        ? send({
            from,
            to: [alertTo],
            reply_to: signup.email,
            subject: alert.subject,
            text: alert.text,
            html: alert.html,
          })
        : Promise.resolve(),
    ]);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("signup-email failed", err);
    // Still 200. The sign-up itself already succeeded; there is nothing the
    // caller can usefully do with a failure here.
    return new Response("ok", { status: 200 });
  }
});
