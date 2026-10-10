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

  -- money
  reason       text check (reason is null or char_length(reason) between 1 and 200),
  amount       numeric(10, 2) check (amount is null or amount > 0),
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
    (('money'   = any (kinds)) = (amount is not null))
    and (('money'   = any (kinds)) = (reason is not null))
    and (('call'    = any (kinds)) = (topic  is not null))
    and (('message' = any (kinds)) = (body   is not null))
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
alter table public.requests add constraint requests_fields_match_kinds check (
  (('money'   = any (kinds)) = (amount is not null))
  and (('money'   = any (kinds)) = (reason is not null))
  and (('call'    = any (kinds)) = (topic  is not null))
  and (('message' = any (kinds)) = (body   is not null))
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
grant insert (kinds, urgency, reason, amount, topic, body)
  on public.requests to authenticated;
grant update (status) on public.requests to authenticated;

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
