-- Demo fixture. Two linked accounts in the two timezones During is actually
-- used in, plus a third linked account that has gone quiet. Yoonji's day is
-- the Splash pivot's fixture (H20): two boards and loose fragments across
-- two months.
--
-- Dates are relative to each author's own today, so the seed stays meaningful
-- whenever it is run and Home has something to render on first sign-in.

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

-- The empty-string token columns are not decoration: GoTrue scans them into
-- non-nullable Go strings and fails to find the user if they are null, which
-- breaks every admin auth call against a seeded account.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'yoonji@during.today', '', now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Yoonji"}', now() - interval '30 days', now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'mina@during.today', '', now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Mina"}', now() - interval '30 days', now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'jae@during.today', '', now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Jae"}', now() - interval '30 days', now(), '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id, id, id::text,
       jsonb_build_object('sub', id::text, 'email', email),
       'google', now(), now(), now()
  from auth.users
 where email like '%@during.today';

-- last_active_at drives presence (C7). Jae is past the hardcoded 3-day TTL and
-- must therefore be absent from friends strips entirely — no badge, no row.
insert into public.profiles (id, display_name, timezone, last_active_at)
values
  ('11111111-1111-1111-1111-111111111111', 'Yoonji', 'America/Vancouver', now()),
  ('22222222-2222-2222-2222-222222222222', 'Mina', 'Asia/Seoul', now() - interval '20 minutes'),
  ('33333333-3333-3333-3333-333333333333', 'Jae', 'America/Vancouver', now() - interval '5 days');

-- Links are stored in canonical order; both of Yoonji's are mutual by nature.
insert into public.links (user_a, user_b)
values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');

-- ---------------------------------------------------------------------------
-- categories — the six-lane preset every new profile is seeded with (H20i)
-- ---------------------------------------------------------------------------

insert into public.my_categories (id, user_id, name, icon, default_mode, position)
values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Place', '📍', 'drop', 0),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Mood',  '🌤️', 'drop', 1),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Music', '🎧', 'drop', 2),
  ('a1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Media', '🎬', 'drop', 3),
  ('a1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Food',  '🍜', 'drop', 4),
  ('a1000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Day',   '🖋', 'drop', 5),
  ('a2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Place', '📍', 'drop', 0),
  ('a2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Music', '🎧', 'drop', 2),
  ('a2000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Day',   '🖋', 'drop', 5),
  ('a3000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'Day',   '🖋', 'drop', 0);

-- ---------------------------------------------------------------------------
-- sessions — shelves (H21e): a titled month (its lazy row) and a custom one
-- ---------------------------------------------------------------------------

with day as (select (now() at time zone 'America/Vancouver')::date as d)
insert into public.sessions (id, owner_id, kind, title, month, declared_start, declared_end, lane_id, created_at)
select v.id, '11111111-1111-1111-1111-111111111111', v.kind::public.session_kind, v.title,
       v.month, v.from_date, v.to_date, v.lane, (day.d - 30) + time '09:00'
  from day,
       lateral (values
         -- Last month, titled: the one monthly row this account has. Every
         -- other month exists without one.
         ('d1000000-0000-0000-0000-000000000001'::uuid, 'monthly', 'The month the form changed',
          (date_trunc('month', day.d) - interval '1 month')::date, null::date, null::date, null::uuid),
         -- A custom shelf with a declared lane: posts assigned to it group
         -- flat, because the shelf already says what they are about.
         ('d1000000-0000-0000-0000-000000000002', 'custom', 'Trips',
          null, day.d - 60, null, 'a1000000-0000-0000-0000-000000000001'::uuid)
       ) as v(id, kind, title, month, from_date, to_date, lane);

-- ---------------------------------------------------------------------------
-- splashes — posts (H21a, H24): each owns its lane and its range, and every
-- block on it takes both. A spanning one, a pinned one, an untitled one, a
-- future-dated one, and posts of one where a block stands alone.
-- ---------------------------------------------------------------------------

-- Dates are relative to today so the ground, the shelves and the board are
-- visible whenever this is run.
with day as (select (now() at time zone 'America/Vancouver')::date as d)
insert into public.splashes (id, owner_id, title, declared_start, declared_end, declared_lane_id, session_id, pinned_at, created_at)
select v.id, '11111111-1111-1111-1111-111111111111', v.title,
       v.from_date, v.to_date, v.lane, v.session,
       case when v.pinned then (day.d - 1) + time '09:00' else null end,
       (day.d - v.made) + time '09:00'
  from day,
       lateral (values
         -- Two nights in Place, on the Trips shelf.
         ('c1000000-0000-0000-0000-000000000001'::uuid, 'Whistler, two nights',
          day.d - 40, day.d - 37, 'a1000000-0000-0000-0000-000000000001'::uuid,
          'd1000000-0000-0000-0000-000000000002'::uuid, false, 41),
         -- Pinned: still being written, every block on the day it began.
         ('c1000000-0000-0000-0000-000000000002', 'During redesign',
          day.d - 26, null, 'a1000000-0000-0000-0000-000000000006', null, true, 26),
         -- A range across the month boundary: on both shelves (H21e).
         ('c1000000-0000-0000-0000-000000000003', 'The long weekend that ran over',
          (date_trunc('month', day.d) - interval '3 days')::date,
          (date_trunc('month', day.d) + interval '2 days')::date,
          'a1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000002', false, 3),
         -- Untitled: a one-line post. Its ghost title is its block's first words.
         ('c1000000-0000-0000-0000-000000000004', '', day.d, null,
          'a1000000-0000-0000-0000-000000000006', null, false, 0),
         -- Posts of one (0028): a block that stood alone, titled by its first line.
         ('c1000000-0000-0000-0000-000000000011', 'kitsilano beach', day.d, null,
          'a1000000-0000-0000-0000-000000000001', null, false, 0),
         ('c1000000-0000-0000-0000-000000000012', 'parannoul on repeat', day.d, null,
          'a1000000-0000-0000-0000-000000000003', null, false, 0),
         -- Untitled on purpose: its one block is locked, and a title is not.
         ('c1000000-0000-0000-0000-000000000013', '', day.d, null,
          'a1000000-0000-0000-0000-000000000006', null, false, 0),
         ('c1000000-0000-0000-0000-000000000014', 'slept badly, worked anyway', day.d, null,
          'a1000000-0000-0000-0000-000000000002', null, false, 0),
         -- Two posts on one evening: overlapping things are both true (H20c).
         ('c1000000-0000-0000-0000-000000000015', 'dinner at the long table', day.d - 1, null,
          'a1000000-0000-0000-0000-000000000005', null, false, 1),
         ('c1000000-0000-0000-0000-000000000016', 'call from mom, halfway through', day.d - 1, null,
          'a1000000-0000-0000-0000-000000000001', null, false, 1),
         ('c1000000-0000-0000-0000-000000000017', 'that one song again', day.d - 1, null,
          'a1000000-0000-0000-0000-000000000003', null, false, 1),
         -- Future-dated: a post on a day still to come.
         ('c1000000-0000-0000-0000-000000000018', 'dinner with mina', day.d + 3, null,
          'a1000000-0000-0000-0000-000000000005', null, false, 0)
       ) as v(id, title, from_date, to_date, lane, session, pinned, made);

-- Mina, in Seoul, and Jae, who went quiet five days ago: a post each per block.
insert into public.splashes (id, owner_id, title, declared_start, declared_lane_id)
values
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'seongsu, again',
   (now() at time zone 'Asia/Seoul')::date, 'a2000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'thesis playlist, again',
   (now() at time zone 'Asia/Seoul')::date, 'a2000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'rained all afternoon',
   (now() at time zone 'Asia/Seoul')::date, 'a2000000-0000-0000-0000-000000000006'),
  ('c3000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'see you when I see you',
   ((now() - interval '5 days') at time zone 'America/Vancouver')::date,
   'a3000000-0000-0000-0000-000000000006');

-- ---------------------------------------------------------------------------
-- ripples — a block is its words, photos, author and when it was written
-- (H24): its lane and date are its post's, so it carries neither.
-- ---------------------------------------------------------------------------

-- Every block of Yoonji's: its post, and when it was written (`made` days
-- back, at `wrote`). Blocks of one post read in the order they were written.
with day as (select (now() at time zone 'America/Vancouver')::date as d)
insert into public.ripples (id, author_id, note, splash_id, created_at)
select v.id, '11111111-1111-1111-1111-111111111111', v.note, v.splash,
       (day.d - v.made) at time zone 'America/Vancouver' + v.wrote
  from day,
       (values
         ('b1000000-0000-0000-0000-000000000021'::uuid, 'c1000000-0000-0000-0000-000000000001'::uuid,
          'sea to sky, fog the whole way up', 40, interval '11 hours 30 minutes'),
         ('b1000000-0000-0000-0000-000000000022', 'c1000000-0000-0000-0000-000000000001',
          'the village at night, empty', 40, interval '21 hours 15 minutes'),
         ('b1000000-0000-0000-0000-000000000023', 'c1000000-0000-0000-0000-000000000001',
          'peak chair', 39, interval '10 hours 5 minutes'),
         ('b1000000-0000-0000-0000-000000000024', 'c1000000-0000-0000-0000-000000000001',
          'last coffee before the drive', 37, interval '8 hours 40 minutes'),
         ('b1000000-0000-0000-0000-000000000031', 'c1000000-0000-0000-0000-000000000002',
          'watched the whole dogfood month back as one scroll', 25, interval '20 hours'),
         ('b1000000-0000-0000-0000-000000000032', 'c1000000-0000-0000-0000-000000000002',
          'the record is a fragment, not a timesheet', 12, interval '9 hours 30 minutes'),
         ('b1000000-0000-0000-0000-000000000033', 'c1000000-0000-0000-0000-000000000002',
          'two modes, one scroll', 2, interval '14 hours'),
         ('b1000000-0000-0000-0000-000000000034', 'c1000000-0000-0000-0000-000000000002',
          'the sketch that started it, found in a notebook', 0, interval '8 hours'),
         ('b1000000-0000-0000-0000-000000000041', 'c1000000-0000-0000-0000-000000000003',
          'the drive down, nothing but radio', 3, interval '20 hours'),
         ('b1000000-0000-0000-0000-000000000042', 'c1000000-0000-0000-0000-000000000003',
          'home a day late and glad of it', 0, interval '9 hours'),
         ('b1000000-0000-0000-0000-000000000051', 'c1000000-0000-0000-0000-000000000004',
          'coffee went cold while I read the whole thing', 0, interval '8 hours 10 minutes'),
         ('b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000011',
          'kitsilano beach', 0, interval '12 hours 15 minutes'),
         ('b1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000012',
          'parannoul on repeat', 0, interval '14 hours 40 minutes'),
         -- Locked: the audience row is added below.
         ('b1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000013',
          'the thing I am not saying out loud yet', 0, interval '16 hours'),
         ('b1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000014',
          'slept badly, worked anyway', 0, interval '7 hours'),
         ('b1000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000015',
          'dinner at the long table', 1, interval '22 hours'),
         ('b1000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000016',
          'call from mom, halfway through', 1, interval '22 hours 5 minutes'),
         ('b1000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000017',
          'that one song again', 1, interval '20 hours 10 minutes'),
         ('b1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000018',
          'dinner with mina', 0, interval '15 hours')
       ) as v(id, splash, note, made, wrote);

insert into public.ripples (id, author_id, note, splash_id)
values
  ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'seongsu, again',
   'c2000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'thesis playlist, again',
   'c2000000-0000-0000-0000-000000000002'),
  ('b2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'rained all afternoon',
   'c2000000-0000-0000-0000-000000000003'),
  -- A Ripple that persists (C7 — presence expires, records do not) behind a
  -- profile that is past its TTL.
  ('b3000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'see you when I see you',
   'c3000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- audience — one locked Ripple, the fixture the RLS test is written against
-- ---------------------------------------------------------------------------

insert into public.ripple_audience (ripple_id, target_type)
values ('b1000000-0000-0000-0000-000000000004', 'lock');

-- ---------------------------------------------------------------------------
-- witness — Mina has seen one of Yoonji's drops
-- ---------------------------------------------------------------------------

insert into public.ripple_views (ripple_id, viewer_id)
values ('b1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');

-- The trigger on ripples moved every profile's last_active_at to now(); put
-- the seeded presence back so Jae stays past his TTL.
update public.profiles set last_active_at = now() - interval '20 minutes'
 where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set last_active_at = now() - interval '5 days'
 where id = '33333333-3333-3333-3333-333333333333';
