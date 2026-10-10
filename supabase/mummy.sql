-- ============================================================================
-- Family requests — the table behind /mummy/.
--
-- A family member signs in (an ordinary account in this project, created in
-- the dashboard; sign-ups are off) and files a request: money, a phone call,
-- a message — any mix of the three in one go. Each insert fires an email to the owner via the `request-email`
-- edge function, the same way a show sign-up emails IRL.
--
-- Run AFTER schema.sql, in the SQL editor, as the whole file. It is idempotent.
-- It depends on schema.sql for: pgcrypto, the `private` schema, public.is_admin(),
-- pg_net, the `irl_webhook_secret` vault entry, and irl_webhook_secret_ok().
--
-- Who may do what (see README → "Family requests"):
--   anon             nothing — no grant, no policy
--   family (any      insert a request as themselves; read their own rows
--     signed-in
--     account)
--   admins           read every request; mark it done
-- ============================================================================

-- Money is a list of things, each with its own amount, reason and urgency, kept
-- as a JSON array: [{"amount": 40, "reason": "groceries", "urgency": "soon"}, …].
-- This is the shape check; the CHECK constraint on the column calls it. Runs as
-- the inserting role, so authenticated needs EXECUTE (granted below).
create or replace function public.money_items_ok(items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(items) = 'array'
     and jsonb_array_length(items) between 1 and 20
     and not exists (
       select 1
         from jsonb_array_elements(items) as e
        where jsonb_typeof(e) <> 'object'
           or jsonb_typeof(e -> 'amount') <> 'number'
           or (e ->> 'amount')::numeric <= 0
           or (e ->> 'amount')::numeric > 99999999.99
           or jsonb_typeof(e -> 'reason') <> 'string'
           or btrim(e ->> 'reason') = ''
           or char_length(e ->> 'reason') > 20
           or jsonb_typeof(e -> 'urgency') <> 'string'
           or (e ->> 'urgency') not in ('whenever', 'soon', 'urgent')
     );
$$;

create table if not exists public.requests (
  id           uuid primary key default gen_random_uuid(),

  -- Who filed it. All three come from the caller's JWT via column defaults;
  -- the column grants below mean the client cannot set them, only inherit them.
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  sender_email text not null default auth.email(),
  sender_name  text default (auth.jwt() -> 'user_metadata' ->> 'name'),

  kinds        text[] not null,
  -- How soon the CALL is wanted (each money line carries its own; the message
  -- has message_urgency). Defaults so a request without a call still has a value.
  urgency      text not null default 'soon'
                 check (urgency in ('whenever', 'soon', 'urgent')),

  -- money: one or more lines, see money_items_ok()
  money_items  jsonb check (money_items is null or public.money_items_ok(money_items)),
  -- call
  topic        text check (topic is null or char_length(topic) between 1 and 300),
  -- message
  body         text check (body is null or char_length(body) between 1 and 2000),
  message_urgency text check (message_urgency is null
                              or message_urgency in ('whenever', 'soon', 'urgent')),

  status       text not null default 'open' check (status in ('open', 'done')),
  created_at   timestamptz not null default now(),

  -- At least one kind, all of them known.
  constraint requests_kinds_check check (
    cardinality(kinds) >= 1
    and kinds <@ array['money', 'call', 'message']::text[]
  ),

  -- A kind that is asked for carries its fields; one that is not carries none.
  -- The page enforces the same rule with friendlier wording; this one holds.
  constraint requests_fields_match_kinds check (
    (('money'   = any (kinds)) = (money_items is not null))
    and (('call'    = any (kinds)) = (topic is not null))
    and (('message' = any (kinds)) = (body  is not null))
    and (('message' = any (kinds)) = (message_urgency is not null))
  )
);

-- ---- Migration from the first cut (2026-10-09, one `kind` per request) ----
-- Safe to run on a fresh table too: every step is guarded.
alter table public.requests add column if not exists kinds text[];

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'requests' and column_name = 'kind'
  ) then
    update public.requests set kinds = array[kind] where kinds is null;
    alter table public.requests drop column kind;
  end if;
end
$$;

alter table public.requests alter column kinds set not null;
alter table public.requests drop constraint if exists requests_fields_match_kind;
alter table public.requests drop constraint if exists requests_kinds_check;
alter table public.requests drop constraint if exists requests_fields_match_kinds;
alter table public.requests add constraint requests_kinds_check check (
  cardinality(kinds) >= 1
  and kinds <@ array['money', 'call', 'message']::text[]
);

-- ---- Migration from the second cut (one amount + reason per request) -------
alter table public.requests add column if not exists money_items jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'requests' and column_name = 'amount'
  ) then
    update public.requests
       set money_items = jsonb_build_array(jsonb_build_object('amount', amount, 'reason', reason))
     where money_items is null and amount is not null;
    alter table public.requests drop column amount;
    alter table public.requests drop column reason;
  end if;
end
$$;

-- ---- Migration from the third cut (urgency once per request) -------------
-- Each money line now carries its own urgency; lines without one inherit the
-- request's. Runs before the shape constraint is (re)added below.
update public.requests
   set money_items = (
     select jsonb_agg(
              case when e ? 'urgency' then e
                   else e || jsonb_build_object('urgency', urgency) end)
       from jsonb_array_elements(money_items) as e)
 where money_items is not null
   and exists (select 1 from jsonb_array_elements(money_items) as e
                where not (e ? 'urgency'));

alter table public.requests drop constraint if exists requests_money_items_check;
alter table public.requests add constraint requests_money_items_check check (
  money_items is null or public.money_items_ok(money_items)
);
-- ---- Migration from the fourth cut (a message had no urgency) -------------
alter table public.requests add column if not exists message_urgency text
  check (message_urgency is null or message_urgency in ('whenever', 'soon', 'urgent'));
update public.requests set message_urgency = 'urgent'
 where 'message' = any (kinds) and message_urgency is null;

alter table public.requests add constraint requests_fields_match_kinds check (
  (('money'   = any (kinds)) = (money_items is not null))
  and (('call'    = any (kinds)) = (topic is not null))
  and (('message' = any (kinds)) = (body  is not null))
  and (('message' = any (kinds)) = (message_urgency is not null))
);

create index if not exists requests_user_id_idx on public.requests (user_id);

alter table public.requests enable row level security;

-- ---- Policies ---------------------------------------------------------------
-- (select auth.uid()) rather than bare auth.uid(), same as schema.sql — it is
-- evaluated once per statement instead of once per row.

drop policy if exists "family may file a request" on public.requests;
create policy "family may file a request"
  on public.requests for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "family may read their own requests" on public.requests;
create policy "family may read their own requests"
  on public.requests for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "admins may read every request" on public.requests;
create policy "admins may read every request"
  on public.requests for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "admins may update requests" on public.requests;
create policy "admins may update requests"
  on public.requests for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- No delete policy. A request, once filed, stays on the record.

-- ---- Grants -----------------------------------------------------------------
-- Supabase's default privileges hand anon full DML on every new table in
-- public (schema.sql explains). Take it all away, then hand back only what a
-- signed-in family member needs — and only the columns they may write. The
-- identity columns and `status` are reachable through defaults alone, so a
-- tampered payload fails on column permission before RLS even looks at it.
revoke all on public.requests from anon;
revoke all on public.requests from authenticated;

grant select on public.requests to authenticated;
grant insert (kinds, urgency, money_items, topic, body, message_urgency)
  on public.requests to authenticated;
grant update (status) on public.requests to authenticated;

-- The shape check runs as the inserting role.
revoke all on function public.money_items_ok(jsonb) from public;
grant execute on function public.money_items_ok(jsonb) to authenticated;

-- ---- Delivery ---------------------------------------------------------------
-- When Isaac hears about something depends on how soon it was wanted:
--
--   urgent    now
--   soon      the next 7pm Pacific
--   whenever  the next Tuesday or Thursday, 7pm Pacific
--
-- Every money line, the call and the message each choose their own.
--
-- So a request is not emailed as one unit. Each thing in it — every money
-- line, the call, the message — becomes a row in `deliveries` with its own
-- due time. A pg_cron job runs private.dispatch_due() every minute; it claims
-- the rows that are due and hands their ids to the `request-email` edge
-- function, which sends one digest per urgency and marks them sent. The
-- insert trigger calls the same dispatcher straight away, which is how
-- "urgent" leaves within seconds instead of within a minute.
--
-- pg_net queues the HTTP call and sends it after the transaction commits, so a
-- request is never slowed down or failed by the mailer. Same shared secret and
-- header as private.notify_signup() in schema.sql.

create table if not exists public.deliveries (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests (id) on delete cascade,
  kind        text not null check (kind in ('money', 'call', 'message')),
  urgency     text check (urgency is null or urgency in ('whenever', 'soon', 'urgent')),
  item        jsonb not null,            -- {amount, reason} | {topic} | {body}
  due_at      timestamptz not null,
  claimed_at  timestamptz,               -- handed to the mailer; retried if not sent
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists deliveries_due_idx
  on public.deliveries (due_at) where sent_at is null;

alter table public.deliveries enable row level security;

drop policy if exists "admins may read deliveries" on public.deliveries;
create policy "admins may read deliveries"
  on public.deliveries for select to authenticated
  using ((select public.is_admin()));

-- Nobody writes this table through the API: the trigger fills it and the edge
-- function (service role) marks rows sent.
revoke all on public.deliveries from anon;
revoke all on public.deliveries from authenticated;
grant select on public.deliveries to authenticated;

-- "7pm Pacific" means America/Los_Angeles: PST in winter, PDT in summer.
create or replace function private.next_due(urgency text, from_ts timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  tz         constant text := 'America/Los_Angeles';
  local_now  timestamp := from_ts at time zone tz;
  day        date := local_now::date;
  candidate  timestamp;
begin
  if urgency is null or urgency = 'urgent' then
    return from_ts;
  end if;

  if urgency = 'soon' then
    candidate := day + time '19:00';
    if candidate <= local_now then
      candidate := candidate + interval '1 day';
    end if;
    return candidate at time zone tz;
  end if;

  -- whenever: the next Tuesday (dow 2) or Thursday (dow 4) at 19:00, today
  -- included if 19:00 has not passed yet.
  for i in 0..7 loop
    candidate := (day + i) + time '19:00';
    if extract(dow from day + i) in (2, 4) and candidate > local_now then
      return candidate at time zone tz;
    end if;
  end loop;

  return from_ts; -- unreachable; keeps the planner honest
end;
$$;

-- Claim every due, unsent delivery and hand the batch to the edge function.
-- A claim older than ten minutes that never became a send is claimed again,
-- so a mailer hiccup is retried rather than lost.
create or replace function private.dispatch_due()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  ids    uuid[];
begin
  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'irl_webhook_secret';
  if secret is null then
    return;
  end if;

  with claimed as (
    update public.deliveries
       set claimed_at = now()
     where sent_at is null
       and due_at <= now()
       and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    returning id
  )
  select array_agg(id) into ids from claimed;

  if ids is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://ykqeshyloyemchswsusn.supabase.co/functions/v1/request-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'sb_publishable_f5d1HUm0Llv56gALG-zpug_YOIHIo-s',
      'x-irl-secret', secret
    ),
    body := jsonb_build_object('delivery_ids', to_jsonb(ids)),
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- A request must never fail because a mailer did.
    null;
end;
$$;

-- Split a new request into deliveries, then send whatever is due right now.
create or replace function private.explode_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if 'money' = any (new.kinds) then
    insert into public.deliveries (request_id, kind, urgency, item, due_at)
    select new.id, 'money', e ->> 'urgency',
           e - 'urgency',
           private.next_due(e ->> 'urgency', new.created_at)
      from jsonb_array_elements(new.money_items) as e;
  end if;

  if 'call' = any (new.kinds) then
    insert into public.deliveries (request_id, kind, urgency, item, due_at)
    values (new.id, 'call', new.urgency,
            jsonb_build_object('topic', new.topic),
            private.next_due(new.urgency, new.created_at));
  end if;

  if 'message' = any (new.kinds) then
    insert into public.deliveries (request_id, kind, urgency, item, due_at)
    values (new.id, 'message', new.message_urgency,
            jsonb_build_object('body', new.body),
            private.next_due(new.message_urgency, new.created_at));
  end if;

  perform private.dispatch_due();
  return null;
exception
  when others then
    return null;
end;
$$;

-- The first cut emailed each request whole; that trigger goes.
drop trigger if exists requests_notify on public.requests;
drop function if exists private.notify_request();

drop trigger if exists requests_explode on public.requests;
create trigger requests_explode
  after insert on public.requests
  for each row execute function private.explode_request();

-- The clock. pg_cron keeps its schedule in UTC, so the job just polls and the
-- due times (computed in Pacific above) decide what goes.
create extension if not exists pg_cron;
select cron.schedule('mummy-dispatch', '* * * * *', $$select private.dispatch_due()$$);
