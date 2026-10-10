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

-- Money is a list of things, each with its own amount and reason, kept as a
-- JSON array: [{"amount": 40, "reason": "groceries"}, …]. This is the shape
-- check; the CHECK constraint on the column calls it. Runs as the inserting
-- role, so authenticated needs EXECUTE (granted below).
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
           or char_length(e ->> 'reason') > 200
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
  urgency      text not null default 'soon'
                 check (urgency in ('whenever', 'soon', 'urgent')),

  -- money: one or more lines, see money_items_ok()
  money_items  jsonb check (money_items is null or public.money_items_ok(money_items)),
  -- call
  topic        text check (topic is null or char_length(topic) between 1 and 300),
  -- message
  body         text check (body is null or char_length(body) between 1 and 2000),

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

alter table public.requests drop constraint if exists requests_money_items_check;
alter table public.requests add constraint requests_money_items_check check (
  money_items is null or public.money_items_ok(money_items)
);
alter table public.requests add constraint requests_fields_match_kinds check (
  (('money'   = any (kinds)) = (money_items is not null))
  and (('call'    = any (kinds)) = (topic is not null))
  and (('message' = any (kinds)) = (body  is not null))
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
grant insert (kinds, urgency, money_items, topic, body)
  on public.requests to authenticated;
grant update (status) on public.requests to authenticated;

-- The shape check runs as the inserting role.
revoke all on function public.money_items_ok(jsonb) from public;
grant execute on function public.money_items_ok(jsonb) to authenticated;

-- ---- Email ------------------------------------------------------------------
-- Hand the new row's id — only the id — to the `request-email` edge function.
-- pg_net queues the request and sends it after this transaction commits, so a
-- request is never slowed down or failed by the mailer. Same shape, same
-- shared secret and same header as private.notify_signup() in schema.sql.
create or replace function private.notify_request()
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

  if secret is null then
    return null;
  end if;

  perform net.http_post(
    url := 'https://ykqeshyloyemchswsusn.supabase.co/functions/v1/request-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'sb_publishable_f5d1HUm0Llv56gALG-zpug_YOIHIo-s',
      'x-irl-secret', secret
    ),
    body := jsonb_build_object('request_id', new.id),
    timeout_milliseconds := 5000
  );

  return null;
exception
  when others then
    -- A request must never fail because a mailer did.
    return null;
end;
$$;

drop trigger if exists requests_notify on public.requests;
create trigger requests_notify
  after insert on public.requests
  for each row execute function private.notify_request();
