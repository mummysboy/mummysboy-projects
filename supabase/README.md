# IRL backend — setup

The database behind `/irldatingshows/`. Everything the site needs is in
`schema.sql`; this is the order to do it in.

Nothing here is served to the web — `netlify.toml` returns 404 for `/supabase/*`.

---

## 1. Create the project

Supabase dashboard → **New project**. Region closest to your audience. Save the
database password somewhere safe; you will not need it for any of this, but you
cannot recover it.

## 2. Run the schema

Dashboard → **SQL Editor** → paste all of `schema.sql` → Run.

It is idempotent, so re-running it after an edit is safe and is how you apply
changes later.

## 3. Point the site at it

Dashboard → **Project Settings → API**. Copy the **Project URL** and the
**publishable** (or `anon`) key into `data/irl-config.js`:

```js
export const SUPABASE_URL = "https://<ref>.supabase.co";
export const SUPABASE_KEY = "sb_publishable_…";
```

Both belong in the repo — the key identifies the project and authorizes
nothing on its own. **Never put the `service_role` / secret key in this repo.**

## 4. Create your admin account

Dashboard → **Authentication → Users → Add user**. Use your own email and set a
password (a password manager on your phone makes this one tap at a venue).

Then tell the database that user is an admin. SQL Editor:

```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'you@example.com'
on conflict (user_id) do nothing;
```

Until that row exists the admin page will sign you in and then tell you that you
have no access — that is row-level security working, not a bug.

## 5. Lock the front door

Dashboard → **Authentication → Sign In / Providers**:

- Turn **off** "Allow new users to sign up". Nobody but you needs an account.
  Without it, anyone can create one — they still get nothing, because power
  comes from the `admins` table, but there is no reason to leave it open.
- Leave **Email** enabled. The admin page signs in with email + password and
  offers a magic link as a fallback.

Supabase's built-in mailer is rate-limited to a couple of messages an hour, which
is fine for the magic-link fallback. It cannot send the sign-up emails — those go
through Resend, below.

## 6. Turn on the sign-up emails

Running `schema.sql` installs `pg_net`, generates a shared secret in Vault, and
adds a `signups_notify` trigger that hands each new row to the `signup-email`
edge function. The function is deployed but sends nothing until these are set.

**a. Resend.** Create an account, add **rightimagedigital.com** as a sending
domain, and put the DKIM/SPF records it gives you into Netlify DNS (the domain
is on Netlify's nameservers). Then create an API key.

Adding it does **not** disturb the Google Workspace mail already on that domain.
Resend puts its SPF and bounce MX on `send.rightimagedigital.com` and its DKIM at
`resend._domainkey.rightimagedigital.com` — all three unused — and leaves the
root `v=spf1 include:_spf.google.com ~all` record alone. Only one SPF record is
allowed per name, so if a future provider ever asks you to edit the *root* TXT,
merge its `include:` into the existing record rather than adding a second one.

**b. Set the function's secrets.** These are **project-wide**, not per-function,
and they are not on the function's own page: Dashboard → **Project Settings →
Edge Functions → Edge Function Secrets** (or `supabase secrets set`). They take
effect on the next invocation; no redeploy needed.

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the key from step a |
| `IRL_MAIL_FROM` | `IRL <irl@rightimagedigital.com>` |
| `IRL_MAIL_REPLY_TO` | `support@rightimagedigital.com` |
| `IRL_ALERT_TO` | wherever you want the alerts |

There is no `IRL_WEBHOOK_SECRET` to set. The function verifies the header by
calling `public.irl_webhook_secret_ok()` with its service role, which compares
against Vault inside the database — so the secret exists in exactly one place and
cannot be mistyped into a silent 401. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected by the platform; do not add them, and do
not put any of the above in this repo.

**The from address has to actually receive mail.** People reply to a
confirmation — to cancel a seat, or to ask to be deleted, which the email itself
invites. `irl@rightimagedigital.com` is a Google Workspace **group**; two of its
settings are load-bearing and neither is on by default in a useful way:

- it needs at least one **member** subscribed to *Each email*, or replies are
  accepted and delivered to nobody;
- **Who can post** must be *Anyone on the web*, because every applicant is
  external to the org and would otherwise be rejected.

A rejected or undelivered reply is invisible from our side, so test the path from
a non-Workspace address after any change to that group.

**Not mummysboy.com**, even though that is the site people just used: it has no
MX records, so every reply to it would bounce. Sending from the domain that
already has a mailbox keeps the reply path honest.

**The function is deployed with `verify_jwt` off** because the database calls it,
and the trigger has no user session. What actually authenticates the call is the
`x-irl-secret` header, compared in constant time inside the function. If you
redeploy it, keep JWT verification off or the trigger silently stops working —
and never remove that header check, or the endpoint becomes a free email sender
for anyone who finds the URL.

**Failure is deliberately silent.** The trigger swallows every error and the
function always answers 200. A sign-up must never fail because a mail provider
did. The cost is that a broken mailer looks like nothing happening — check
**Edge Functions → Logs** if a confirmation does not turn up.

---

## How the security model works

Read this before changing any policy.

| Table | Public (anon) | Admin |
|---|---|---|
| `events` | read published + cancelled rows | full |
| `event_private` | **no grant at all** | full |
| `signups` | **no grant at all** | full |
| `submit_signup()` | execute | execute |

Three things hold it together:

1. **`signups` is unreadable to the public.** There is no anon select policy and
   no anon grant. A visitor can put their questionnaire in and can never get it,
   or anyone else's, back out. This is why the public page gets "seats left" from
   counters on `events` rather than by counting signup rows.

2. **`submit_signup()` is the only public write path.** It is `SECURITY DEFINER`,
   so it can write a table anon cannot touch, and it is closed: the caller cannot
   choose their own status, cannot set the admin-only columns (`group_label`,
   `admin_note`), and cannot sign up for a draft, cancelled or past show. It
   returns one word — the status the row was actually stored with — so the page
   can tell a waitlisted person the truth instead of guessing.

3. **Private things live in their own table.** Column privileges in Postgres
   cannot be made row-conditional, so a `notes` column on `events` would be
   readable by any signed-in user. That is why `event_private` exists.

If you add a column to `events`, assume the whole internet can read it. Anything
that should not be public goes in `event_private`.

**If you add a table**, remember that Supabase's default privileges hand `anon`
select/insert/update/delete on every new table in `public`. The schema revokes
those explicitly per table. A new table without a matching `revoke` is relying on
RLS alone.

### Advisor warnings that are expected

`supabase db advisors` (or the dashboard's Security Advisor) reports two
`SECURITY DEFINER` warnings on this project. Both are fine — do not "fix" them:

- **`public.submit_signup`** — flagged because `anon` can execute it. That is the
  entire point; it is the public sign-up endpoint. It is closed by construction
  (see above), which the linter has no way to know.
- **`public.rls_auto_enable`** — not ours. Supabase installs this event trigger to
  auto-enable RLS on new tables. It returns `event_trigger`, so it cannot actually
  be invoked over the REST API.

## Changing the questionnaire

The options offered for gender / seeking / intention live in
`data/irl-config.js`, and the chosen labels are stored verbatim. **Add** options
rather than renaming them once real applications exist, or old rows will say one
thing and the form another.

## Worth adding later

- **Spam protection.** `submit_signup()` is a public endpoint. The form has a
  honeypot and a one-signup-per-email-per-show constraint, which stops casual
  bots; a determined one would get through. Cloudflare Turnstile in front of the
  RPC is the usual next step.
- **A timezone column on `events`.** The confirmation email formats the start
  time in `America/Los_Angeles`, hardcoded in the edge function. The first show
  outside Pacific time will announce itself in the wrong timezone.
- **Status-change emails.** A signup only emails on insert. Approving a
  participant, or promoting a spectator off the waitlist, still means writing to
  them by hand — the `signups_notify` trigger is `after insert` only, on purpose,
  so admin edits in the console do not spray mail at people.
