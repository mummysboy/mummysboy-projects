-- ============================================================================
-- Dummy data for the /pundy/ dashboard — a year of made-up family requests so
-- the tiles, the chart and the list have something to show.
--
-- Run AFTER mummy.sql (it needs the decision columns). Idempotent: it deletes
-- its own rows first. Every row is backdated to before 2026-10-09, which is
-- what marks it as dummy — nothing real was filed before that day.
--
-- The email trigger is switched off for the inserts and the deliveries are
-- written by hand, already marked sent, so no email goes out.
--
-- To remove it all later:
--   delete from public.requests where created_at < '2026-10-09';
-- ============================================================================

delete from public.requests where created_at < '2026-10-09';

alter table public.requests disable trigger requests_explode;

-- One request with any mix of parts, filed by the mummy account at `at`
-- (Pacific). money_lines: [[amount, reason, decision, approved_amount], …]
create or replace function pg_temp.req(
  filed timestamp, status text,
  money_urgency text, money_lines jsonb,
  call_topic text, call_urgency text,
  message_body text, message_urgency text
) returns void language plpgsql as $$
declare
  tz constant text := 'America/Los_Angeles';
  created timestamptz := filed at time zone tz;
  uid uuid;
  mail text;
  rid uuid;
  kinds text[] := '{}';
  items jsonb := '[]';
  line jsonb;
begin
  select id, email into uid, mail from auth.users where email = 'mummy@mummysboy.com';
  if uid is null then
    raise exception 'create the mummy account first';
  end if;

  if money_lines is not null then
    kinds := array_append(kinds, 'money');
    select jsonb_agg(jsonb_build_object('amount', (l ->> 0)::numeric, 'reason', l ->> 1, 'urgency', money_urgency))
      into items from jsonb_array_elements(money_lines) l;
  end if;
  if call_topic is not null then kinds := array_append(kinds, 'call'); end if;
  if message_body is not null then kinds := array_append(kinds, 'message'); end if;

  insert into public.requests (user_id, sender_email, kinds, urgency, money_items, topic, body, message_urgency, status, created_at)
  values (uid, mail, kinds, coalesce(call_urgency, 'soon'),
          case when money_lines is null then null else items end,
          call_topic, message_body, message_urgency, status, created)
  returning id into rid;

  if money_lines is not null then
    for line in select * from jsonb_array_elements(money_lines) loop
      insert into public.deliveries (request_id, kind, urgency, item, due_at, claimed_at, sent_at, decision, approved_amount, decided_at, created_at)
      values (rid, 'money', money_urgency,
              jsonb_build_object('amount', (line ->> 0)::numeric, 'reason', line ->> 1),
              created, created, created + interval '40 seconds',
              coalesce(line ->> 2, 'pending'),
              case when line ->> 2 = 'approved' then coalesce((line ->> 3)::numeric, (line ->> 0)::numeric) end,
              case when line ->> 2 in ('approved', 'denied') then created + interval '3 hours' end,
              created);
    end loop;
  end if;
  if call_topic is not null then
    insert into public.deliveries (request_id, kind, urgency, item, due_at, claimed_at, sent_at, created_at)
    values (rid, 'call', call_urgency, jsonb_build_object('topic', call_topic), created, created, created + interval '40 seconds', created);
  end if;
  if message_body is not null then
    insert into public.deliveries (request_id, kind, urgency, item, due_at, claimed_at, sent_at, created_at)
    values (rid, 'message', message_urgency, jsonb_build_object('body', message_body), created, created, created + interval '40 seconds', created);
  end if;
end;
$$;

-- This week (Mon 6 Oct – )
select pg_temp.req('2026-10-08 10:15', 'done', 'soon',
  '[[40, "groceries", "approved"], [12.5, "bus fare", "approved"]]',
  'The dentist moved my appointment to the 20th, is that a day you could drive me?', 'soon',
  null, null);
select pg_temp.req('2026-10-07 16:40', 'open', 'soon',
  '[[35, "pharmacy", "pending"]]',
  null, null,
  'The light in the hall has gone again. Not urgent but it is very dark on the stairs at night.', 'soon');
select pg_temp.req('2026-10-06 09:05', 'done', 'urgent',
  '[[60, "cleaning supplies", "approved", 50]]',
  null, null,
  'Carol says Sunday lunch is at 1 not 2. Bring the dog.', 'urgent');

-- Earlier this month
select pg_temp.req('2026-10-02 14:20', 'done', 'soon',
  '[[25, "quarters", "approved"], [120, "new kettle", "denied"]]',
  null, null, null, null);

-- Earlier this year
select pg_temp.req('2026-09-21 11:00', 'done', 'urgent',
  '[[300, "car insurance", "approved"]]',
  'Insurance renewal is due Friday and the price has gone up again, can we go through it?', 'urgent',
  null, null);
select pg_temp.req('2026-09-10 19:30', 'done', null, null,
  'Just a catch up, nothing serious. Weekend if you are free.', 'soon',
  null, null);
select pg_temp.req('2026-08-15 12:10', 'done', 'soon',
  '[[45, "sleep gummies", "approved"], [80, "groceries", "approved"]]',
  null, null, null, null);
select pg_temp.req('2026-07-04 17:45', 'done', null, null,
  null, null,
  'Happy 4th. Your dad would have loved the fireworks this year. Call when you can.', 'soon');
select pg_temp.req('2026-06-03 08:30', 'done', 'soon',
  '[[150, "Carol birthday", "approved"]]',
  null, null, null, null);
select pg_temp.req('2026-03-12 07:50', 'done', 'urgent',
  '[[500, "boiler repair", "approved"]]',
  'Boiler man is here now and wants paying today, can you ring me?', 'urgent',
  null, null);
select pg_temp.req('2026-01-19 13:00', 'done', 'soon',
  '[[70, "groceries", "approved"], [30, "quarters", "denied"]]',
  null, null, null, null);

-- Last year
select pg_temp.req('2025-12-20 10:00', 'done', 'soon',
  '[[200, "christmas food", "approved"]]',
  null, null, null, null);
select pg_temp.req('2025-11-02 15:15', 'done', 'soon',
  '[[90, "winter coat", "approved"]]',
  null, null,
  'Found a nice coat in the charity shop, ninety dollars, shall I?', 'soon');

alter table public.requests enable trigger requests_explode;

select count(*) as dummy_requests from public.requests where created_at < '2026-10-09';
