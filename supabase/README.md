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
is fine for the magic-link fallback. If you ever want to email applicants from
the app, add a real SMTP provider first.

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
- **Confirmation emails.** Nothing is emailed today — the admin shows you who
  applied and you contact them. A database webhook on `signups` into Resend or
  Postmark would automate it.
