-- ============================================================================
-- IRL — live dating shows. Full schema, privileges and row-level security.
--
-- This file is the source of truth for the database behind /irldatingshows/.
-- It is idempotent: safe to re-run after an edit.
--
-- The security model, in one paragraph. The browser holds the project's public
-- key, so treat every anon request as hostile. `events` is fully public-safe —
-- private per-show notes live in their own table that anon has no grant on at
-- all. `signups` holds the personal data and anon has no access to it whatever:
-- no select, no insert, no grant. The only public write is submit_signup(), a
-- closed SECURITY DEFINER endpoint that returns one word. The "seats left"
-- numbers come from counters a trigger maintains on `events`, which is why the
-- page never has to count signup rows to render a listing.
-- ============================================================================

create extension if not exists pgcrypto;

-- Trigger helpers live outside the exposed schema so they are not reachable
-- through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ============================================================================
-- admins — the allow-list. Authenticating proves who you are; a row in here is
-- what actually grants power. Add yourself by user id after signing up.
-- ============================================================================
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

drop policy if exists "admins may read their own row" on public.admins;
create policy "admins may read their own row"
  on public.admins for select
  to authenticated
  using (user_id = (select auth.uid()));

-- SECURITY INVOKER on purpose: it reads `admins` under the caller's own RLS,
-- so it can only ever confirm something about the caller. auth.uid() is wrapped
-- in a select so it is evaluated once per query rather than once per row.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = (select auth.uid())
  );
$$;

-- ============================================================================
-- events — every column here is safe for the public to read. Anything private
-- belongs in event_private below. Keep it that way: a new secret column on this
-- table would be readable by anyone with the public key.
-- ============================================================================
create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  title                 text not null check (char_length(title) between 1 and 120),
  format                text check (format is null or char_length(format) <= 60),
  tagline               text check (tagline is null or char_length(tagline) <= 240),

  venue_name            text not null check (char_length(venue_name) between 1 and 120),
  address               text check (address is null or char_length(address) <= 160),
  city                  text not null check (char_length(city) between 1 and 80),

  starts_at             timestamptz not null,
  -- Nullable: a night that runs until it runs out is legitimate. When set, the
  -- listing shows a range ("7:00 – 9:00 PM") instead of a start time.
  ends_at               timestamptz,
  doors_at              timestamptz,
  ticket_note           text check (ticket_note is null or char_length(ticket_note) <= 80),

  participant_capacity  integer not null default 12
                          check (participant_capacity between 0 and 200),
  spectator_capacity    integer
                          check (spectator_capacity is null
                                 or spectator_capacity between 0 and 2000),
  min_age               integer not null default 21 check (min_age between 16 and 99),

  status                text not null default 'draft'
                          check (status in ('draft','published','cancelled','completed')),

  -- Maintained by trigger, never written by hand. Public because the listing
  -- needs them to say "sold out" without being able to count signup rows.
  participant_confirmed integer not null default 0,
  spectator_confirmed   integer not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint events_ends_after_start
    check (ends_at is null or ends_at > starts_at)
);

-- The listing query is `status in (...) and starts_at >= now() order by starts_at`.
create index if not exists events_status_starts_at_idx
  on public.events (status, starts_at);

alter table public.events enable row level security;

drop policy if exists "anyone may read listed shows" on public.events;
create policy "anyone may read listed shows"
  on public.events for select
  to anon, authenticated
  using (status in ('published','cancelled'));

drop policy if exists "admins may read every show" on public.events;
create policy "admins may read every show"
  on public.events for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "admins may create shows" on public.events;
create policy "admins may create shows"
  on public.events for insert
  to authenticated
  with check ((select public.is_admin()));

-- An UPDATE has to be able to SELECT the row first, and needs WITH CHECK so the
-- new version is validated too — without it the using-clause alone is a hole.
drop policy if exists "admins may edit shows" on public.events;
create policy "admins may edit shows"
  on public.events for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "admins may delete shows" on public.events;
create policy "admins may delete shows"
  on public.events for delete
  to authenticated
  using ((select public.is_admin()));

-- ============================================================================
-- event_private — admin-only notes. A separate table rather than a column on
-- `events`, because column privileges cannot be made row-conditional: if this
-- lived on `events`, any signed-in non-admin could read it.
-- ============================================================================
create table if not exists public.event_private (
  event_id   uuid primary key references public.events (id) on delete cascade,
  notes      text check (notes is null or char_length(notes) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.event_private enable row level security;

drop policy if exists "admins only" on public.event_private;
create policy "admins only"
  on public.event_private for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ============================================================================
-- signups — the personal data. Public may write, public may never read.
-- ============================================================================
create table if not exists public.signups (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,

  role             text not null check (role in ('participant','spectator')),
  status           text not null default 'pending'
                     check (status in ('pending','approved','declined',
                                       'waitlist','cancelled','attended')),

  -- contact
  name             text not null check (char_length(name) between 2 and 80),
  email            text not null
                     check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                            and char_length(email) <= 120),
  phone            text check (phone is null or char_length(phone) <= 30),
  instagram        text check (instagram is null or char_length(instagram) <= 40),

  -- what the lineup is actually built from
  age              integer check (age is null or age between 16 and 99),
  gender           text check (gender is null or char_length(gender) <= 40),
  seeking          text[] check (seeking is null or array_length(seeking, 1) <= 6),
  looking_for      text check (looking_for is null or char_length(looking_for) <= 60),
  about            text check (about is null or char_length(about) <= 240),

  -- spectators
  party_size       integer not null default 1 check (party_size between 1 and 10),

  consent_age      boolean not null default false,
  consent_conduct  boolean not null default false,
  consent_filming  boolean not null default false,

  -- admin-only working columns; anon has no insert grant on these
  group_label      text check (group_label is null or char_length(group_label) <= 40),
  admin_note       text check (admin_note is null or char_length(admin_note) <= 500),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- one application and one booking per person per show
  unique (event_id, email, role)
);

-- Covers the admin's per-event list, the counter recount, and the FK.
create index if not exists signups_event_role_status_idx
  on public.signups (event_id, role, status);

alter table public.signups enable row level security;

-- The public has no direct access to this table at all — not insert, not
-- select. Everything a visitor can do goes through public.submit_signup()
-- below, which is the only way in and the only thing anon may execute.
--
-- Note the absence of a SELECT policy for anon. That is the point.
drop policy if exists "admins may read signups" on public.signups;
create policy "admins may read signups"
  on public.signups for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "admins may edit signups" on public.signups;
create policy "admins may edit signups"
  on public.signups for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "admins may delete signups" on public.signups;
create policy "admins may delete signups"
  on public.signups for delete
  to authenticated
  using ((select public.is_admin()));

-- ============================================================================
-- Triggers
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists event_private_touch on public.event_private;
create trigger event_private_touch before update on public.event_private
  for each row execute function public.touch_updated_at();

drop trigger if exists signups_touch on public.signups;
create trigger signups_touch before update on public.signups
  for each row execute function public.touch_updated_at();

-- Normalize the email so the unique constraint actually catches duplicates, and
-- move a spectator to the waitlist when the room is already sold out. SECURITY
-- DEFINER because it has to count rows the inserting visitor cannot read; it
-- only ever looks at the event being inserted into, and it lives in `private`
-- so it is not callable through the API.
create or replace function private.guard_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap   integer;
  taken integer;
begin
  new.email := lower(btrim(new.email));

  if new.role = 'spectator' then
    select e.spectator_capacity into cap
      from public.events e where e.id = new.event_id;

    if cap is not null then
      select coalesce(sum(s.party_size), 0) into taken
        from public.signups s
       where s.event_id = new.event_id
         and s.role = 'spectator'
         and s.status = 'approved';

      if taken + new.party_size > cap then
        new.status := 'waitlist';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists signups_guard on public.signups;
create trigger signups_guard before insert on public.signups
  for each row execute function private.guard_signup();

-- Keep the public counters on `events` in step with reality. Recomputed from
-- scratch rather than incremented, so the numbers cannot drift out of sync.
create or replace function private.sync_event_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := array_remove(
    array[ (case when tg_op <> 'DELETE' then new.event_id end),
           (case when tg_op <> 'INSERT' then old.event_id end) ],
    null
  );
  target uuid;
begin
  foreach target in array ids loop
    update public.events e
       set participant_confirmed = c.p_conf,
           spectator_confirmed   = c.s_conf
      from (
        select
          count(*) filter (
            where s.role = 'participant' and s.status = 'approved'
          )::int as p_conf,
          coalesce(sum(s.party_size) filter (
            where s.role = 'spectator' and s.status = 'approved'
          ), 0)::int as s_conf
        from public.signups s
        where s.event_id = target
      ) c
     where e.id = target;
  end loop;

  return null;
end;
$$;

drop trigger if exists signups_sync_counts on public.signups;
create trigger signups_sync_counts
  after insert or update or delete on public.signups
  for each row execute function private.sync_event_counts();

-- ============================================================================
-- submit_signup — the public write endpoint, and the only one.
--
-- Why an RPC instead of a plain insert: the page has to tell someone the truth
-- about what just happened to them. A spectator who arrives as the room fills
-- is moved to the waitlist by the trigger above, and because anon deliberately
-- cannot read `signups` back, a direct insert leaves the browser guessing —
-- it would cheerfully say "seats held" to someone who is actually waitlisted,
-- and send a real person to a full door. This returns the stored status, read
-- back with RETURNING, so what the visitor is told is what the row says.
--
-- SECURITY DEFINER is required (it writes a table anon has no grant on) and is
-- safe here because it is a closed endpoint: the caller cannot choose the
-- status, cannot set the admin-only columns, cannot target an unpublished or
-- past show, and gets back exactly one word.
-- ============================================================================
create or replace function public.submit_signup(
  p_event_id        uuid,
  p_role            text,
  p_name            text,
  p_email           text,
  p_phone           text     default null,
  p_instagram       text     default null,
  p_age             integer  default null,
  p_gender          text     default null,
  p_seeking         text[]   default null,
  p_looking_for     text     default null,
  p_about           text     default null,
  p_party_size      integer  default 1,
  p_consent_age     boolean  default false,
  p_consent_conduct boolean  default false,
  p_consent_filming boolean  default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev     public.events%rowtype;
  result text;
begin
  select * into ev from public.events e where e.id = p_event_id;

  if not found or ev.status <> 'published' or ev.starts_at <= now() then
    raise exception 'Sign-ups for this show are closed.' using errcode = '42501';
  end if;

  if p_consent_age is not true then
    raise exception 'You need to confirm your age.' using errcode = '23514';
  end if;

  if p_role = 'participant' then
    if p_consent_conduct is not true then
      raise exception 'You need to accept the house rules.' using errcode = '23514';
    end if;
    if p_age is null or p_age < ev.min_age then
      raise exception 'You need to be % or over to play.', ev.min_age
        using errcode = '23514';
    end if;
    result := 'pending';
  elsif p_role = 'spectator' then
    result := 'approved'; -- the guard trigger drops this to waitlist if full
  else
    raise exception 'Unknown sign-up type.' using errcode = '22023';
  end if;

  insert into public.signups (
    event_id, role, status, name, email, phone, instagram,
    age, gender, seeking, looking_for, about, party_size,
    consent_age, consent_conduct, consent_filming
  ) values (
    p_event_id,
    p_role,
    result,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_instagram, '')), ''),
    p_age,
    p_gender,
    p_seeking,
    p_looking_for,
    nullif(btrim(coalesce(p_about, '')), ''),
    greatest(coalesce(p_party_size, 1), 1),
    true,
    coalesce(p_consent_conduct, false),
    coalesce(p_consent_filming, false)
  )
  returning status into result; -- whatever the trigger settled on

  return result;
end;
$$;

-- ============================================================================
-- Privileges. RLS decides which rows; these decide which tables and columns are
-- reachable through the Data API at all. Least privilege, explicitly.
-- ============================================================================
grant usage on schema public to anon, authenticated;

-- Supabase's default privileges hand `anon` full DML on every new table in
-- `public`, so each table has to have that taken away explicitly. RLS was
-- already refusing those writes — verified against the live project, an anon
-- DELETE came back "0 rows" rather than deleting anything — but relying on RLS
-- alone means a single mistake in a single policy is the entire defence.
-- Revoke first, then grant back only what is actually needed.
--
-- This matters again every time a table is added here: a new table starts with
-- anon holding select/insert/update/delete on it.
revoke all on public.events        from anon;
revoke all on public.event_private from anon;
revoke all on public.admins        from anon;
revoke all on public.signups       from anon;

-- events: the only thing anon may read. RLS still hides drafts.
grant select on public.events to anon;
grant select, insert, update, delete on public.events to authenticated;

-- event_private: admins only, and anon has no grant to fall back on.
grant select, insert, update, delete on public.event_private to authenticated;

-- admins: read-only, and RLS narrows that to your own row.
grant select on public.admins to authenticated;

-- signups: no anon access of any kind. The public reaches it only through
-- submit_signup(), which is what makes the questionnaire both writable by a
-- visitor and unreadable to one.
grant select, insert, update, delete on public.signups to authenticated;

-- Postgres grants EXECUTE to PUBLIC on every new function, so lock the RPC down
-- and hand it back deliberately.
revoke all on function public.submit_signup(
  uuid, text, text, text, text, text, integer, text, text[], text, text,
  integer, boolean, boolean, boolean
) from public;
grant execute on function public.submit_signup(
  uuid, text, text, text, text, text, integer, text, text[], text, text,
  integer, boolean, boolean, boolean
) to anon, authenticated;

-- ============================================================================
-- Signup email — hand the new row off to the `signup-email` edge function,
-- which sends the applicant their confirmation and us the alert.
--
-- pg_net is asynchronous: http_post queues the request and a background worker
-- sends it after this transaction commits. That ordering is the whole reason
-- for doing it here rather than inside submit_signup() — a visitor's sign-up
-- must not wait on, or fail because of, an email provider.
-- ============================================================================
create extension if not exists pg_net;

-- The shared secret the edge function checks. Generated in the database so it
-- is never written down in this repo, and only created once — re-running this
-- file must not rotate a secret the deployed function is still using.
--
-- To read it when configuring the function (once, in the SQL editor):
--   select decrypted_secret from vault.decrypted_secrets
--    where name = 'irl_webhook_secret';
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'irl_webhook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'irl_webhook_secret',
      'Shared secret between the signups trigger and the signup-email function.'
    );
  end if;
end
$$;

-- How the edge function checks the header above. It holds the service role, so
-- it asks the database rather than carrying its own copy of the secret in an
-- env var: two copies is one more than necessary, and when they drift the only
-- symptom is a 401 that the sign-up path is built to swallow — nothing anywhere
-- reports a problem, and the emails just stop.
--
-- Returns a boolean, never the secret. anon and authenticated cannot execute it.
create or replace function public.irl_webhook_secret_ok(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
     where name = 'irl_webhook_secret'
       and decrypted_secret = candidate
  );
$$;

revoke all on function public.irl_webhook_secret_ok(text) from public, anon, authenticated;
grant execute on function public.irl_webhook_secret_ok(text) to service_role;

create or replace function private.notify_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'irl_webhook_secret';

  -- No secret configured yet means the email side is not set up. That is not a
  -- reason to refuse someone a seat.
  if secret is null then
    return null;
  end if;

  perform net.http_post(
    url := 'https://ykqeshyloyemchswsusn.supabase.co/functions/v1/signup-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The anon key only gets us past the platform's JWT check; the header
      -- below is what actually authenticates this call. Both are sent so the
      -- trigger works whether or not the function is deployed with
      -- verify_jwt disabled.
      'Authorization', 'Bearer ' ||
        'sb_publishable_f5d1HUm0Llv56gALG-zpug_YOIHIo-s',
      'x-irl-secret', secret
    ),
    -- Only the id travels. pg_net keeps request bodies in its own tables, and
    -- there is no reason for a name, phone number and sexual orientation to sit
    -- in a queue as well as in `signups`.
    body := jsonb_build_object('signup_id', new.id),
    timeout_milliseconds := 5000
  );

  return null;
exception when others then
  -- Belt and braces around the same principle as above: whatever goes wrong
  -- reaching the mailer, the sign-up stands.
  return null;
end;
$$;

drop trigger if exists signups_notify on public.signups;
create trigger signups_notify
  after insert on public.signups
  for each row execute function private.notify_signup();
