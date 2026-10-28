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
  ('00000000-0000-0000-0000-000000000000', '8d798ff1-3d4e-4316-86e0-dd883cae41a0',
   'authenticated', 'authenticated', 'yoonji@during.today', '', now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Yoonji"}', now() - interval '30 days', now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351',
   'authenticated', 'authenticated', 'mina@during.today', '', now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Mina"}', now() - interval '30 days', now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '46eb0b0a-17ec-41b7-be7a-156f24618590',
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
  ('8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'Yoonji', 'America/Vancouver', now()),
  ('a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'Mina', 'Asia/Seoul', now() - interval '20 minutes'),
  ('46eb0b0a-17ec-41b7-be7a-156f24618590', 'Jae', 'America/Vancouver', now() - interval '5 days');

-- Links are stored in canonical order; both of Yoonji's are mutual by nature.
insert into public.links (user_a, user_b)
values
  ('8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351'),
  ('46eb0b0a-17ec-41b7-be7a-156f24618590', '8d798ff1-3d4e-4316-86e0-dd883cae41a0');

-- ---------------------------------------------------------------------------
-- categories — the six-lane preset every new profile is seeded with (H20i)
-- ---------------------------------------------------------------------------

insert into public.my_categories (id, user_id, name, icon, default_mode, position)
values
  ('0914a3a9-d7f0-4d15-8767-f272961147d0', '8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'Place', '📍', 'drop', 0),
  ('00146831-6d40-4a40-a82e-bccab1e1d8d0', '8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'Mood',  '🌤️', 'drop', 1),
  ('823777dd-d682-40a9-ba74-2f4e06f6f597', '8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'Music', '🎧', 'drop', 2),
  ('0be9017e-c17d-49a2-9587-754f8c057f4d', '8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'Media', '🎬', 'drop', 3),
  ('710a0e19-e5d3-4c90-b1a1-2e30665b3b98', '8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'Food',  '🍜', 'drop', 4),
  ('56b500f6-c6ee-4309-a44b-18e872580932', '8d798ff1-3d4e-4316-86e0-dd883cae41a0', 'Day',   '🖋', 'drop', 5),
  ('6ef82000-2b58-4721-bc3f-3ce6c1e0c084', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'Place', '📍', 'drop', 0),
  ('7f23139f-ef14-431b-9718-9107a60fddf9', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'Music', '🎧', 'drop', 2),
  ('7890db62-a445-42d7-85d1-e6e0beb47800', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'Day',   '🖋', 'drop', 5),
  ('88e04fdf-5589-4252-ae79-e3ee51d68802', '46eb0b0a-17ec-41b7-be7a-156f24618590', 'Day',   '🖋', 'drop', 0);

-- ---------------------------------------------------------------------------
-- sessions — shelves (H21e): a titled month (its lazy row) and a custom one
-- ---------------------------------------------------------------------------

with day as (select (now() at time zone 'America/Vancouver')::date as d)
insert into public.sessions (id, owner_id, kind, title, month, declared_start, declared_end, lane_id, created_at)
select v.id, '8d798ff1-3d4e-4316-86e0-dd883cae41a0', v.kind::public.session_kind, v.title,
       v.month, v.from_date, v.to_date, v.lane, (day.d - 30) + time '09:00'
  from day,
       lateral (values
         -- Last month, titled: the one monthly row this account has. Every
         -- other month exists without one.
         ('f9e9b5dc-1a01-4e63-90ff-cef5c89621ed'::uuid, 'monthly', 'The month the form changed',
          (date_trunc('month', day.d) - interval '1 month')::date, null::date, null::date, null::uuid),
         -- A custom shelf with a declared lane: posts assigned to it group
         -- flat, because the shelf already says what they are about.
         ('17a0d045-2890-4499-a480-6664028eb317', 'custom', 'Trips',
          null, day.d - 60, null, '0914a3a9-d7f0-4d15-8767-f272961147d0'::uuid)
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
select v.id, '8d798ff1-3d4e-4316-86e0-dd883cae41a0', v.title,
       v.from_date, v.to_date, v.lane, v.session,
       case when v.pinned then (day.d - 1) + time '09:00' else null end,
       (day.d - v.made) + time '09:00'
  from day,
       lateral (values
         -- Two nights in Place, on the Trips shelf.
         ('9fe149ef-31eb-45e2-8b6e-91724c5ccdde'::uuid, 'Whistler, two nights',
          day.d - 40, day.d - 37, '0914a3a9-d7f0-4d15-8767-f272961147d0'::uuid,
          '17a0d045-2890-4499-a480-6664028eb317'::uuid, false, 41),
         -- Pinned: still being written, every block on the day it began.
         ('4199a2da-0858-4426-9177-7bd1b3891acc', 'During redesign',
          day.d - 26, null, '56b500f6-c6ee-4309-a44b-18e872580932', null, true, 26),
         -- A range across the month boundary: on both shelves (H21e).
         ('21b39c15-05a1-47a7-b03e-504f84771e16', 'The long weekend that ran over',
          (date_trunc('month', day.d) - interval '3 days')::date,
          (date_trunc('month', day.d) + interval '2 days')::date,
          '710a0e19-e5d3-4c90-b1a1-2e30665b3b98', '17a0d045-2890-4499-a480-6664028eb317', false, 3),
         -- Untitled: a one-line post. Its ghost title is its block's first words.
         ('955e1f86-885f-4710-be03-23e6082c4b64', '', day.d, null,
          '56b500f6-c6ee-4309-a44b-18e872580932', null, false, 0),
         -- Posts of one (0028): a block that stood alone, titled by its first line.
         ('91b783f0-4c4f-4153-88d4-40f8bd2ee51e', 'kitsilano beach', day.d, null,
          '0914a3a9-d7f0-4d15-8767-f272961147d0', null, false, 0),
         ('6d18ed8f-c273-4921-9bfb-2d6b4585e8f5', 'parannoul on repeat', day.d, null,
          '823777dd-d682-40a9-ba74-2f4e06f6f597', null, false, 0),
         -- Untitled on purpose: its one block is locked, and a title is not.
         ('17d76ad8-60c5-47bb-bf94-603088ba5012', '', day.d, null,
          '56b500f6-c6ee-4309-a44b-18e872580932', null, false, 0),
         ('e1294919-0e18-4326-9917-481115c1de2c', 'slept badly, worked anyway', day.d, null,
          '00146831-6d40-4a40-a82e-bccab1e1d8d0', null, false, 0),
         -- Two posts on one evening: overlapping things are both true (H20c).
         ('a0732cde-1f3f-46f6-9c5f-6c2ae6950f7d', 'dinner at the long table', day.d - 1, null,
          '710a0e19-e5d3-4c90-b1a1-2e30665b3b98', null, false, 1),
         ('e951064a-50c5-47d7-a5ad-8b105b894398', 'call from mom, halfway through', day.d - 1, null,
          '0914a3a9-d7f0-4d15-8767-f272961147d0', null, false, 1),
         ('03a27582-1d71-4f65-9178-19851f9c6ee9', 'that one song again', day.d - 1, null,
          '823777dd-d682-40a9-ba74-2f4e06f6f597', null, false, 1),
         -- Future-dated: a post on a day still to come.
         ('af394992-07ea-4e4b-9889-520309aad051', 'dinner with mina', day.d + 3, null,
          '710a0e19-e5d3-4c90-b1a1-2e30665b3b98', null, false, 0)
       ) as v(id, title, from_date, to_date, lane, session, pinned, made);

-- Mina, in Seoul, and Jae, who went quiet five days ago: a post each per block.
insert into public.splashes (id, owner_id, title, declared_start, declared_lane_id)
values
  ('759edb92-a404-487a-a730-7907ee0e2a76', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'seongsu, again',
   (now() at time zone 'Asia/Seoul')::date, '6ef82000-2b58-4721-bc3f-3ce6c1e0c084'),
  ('767b7019-a6b6-453f-bafd-5e8e2631823b', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'thesis playlist, again',
   (now() at time zone 'Asia/Seoul')::date, '7f23139f-ef14-431b-9718-9107a60fddf9'),
  ('4bc21686-cffa-4388-b8ec-f1e1a8cf4afb', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'rained all afternoon',
   (now() at time zone 'Asia/Seoul')::date, '7890db62-a445-42d7-85d1-e6e0beb47800'),
  ('b9b437b4-7942-4ac7-a19b-0465d6e82df0', '46eb0b0a-17ec-41b7-be7a-156f24618590', 'see you when I see you',
   ((now() - interval '5 days') at time zone 'America/Vancouver')::date,
   '88e04fdf-5589-4252-ae79-e3ee51d68802');

-- ---------------------------------------------------------------------------
-- ripples — a block is its words, photos, author and when it was written
-- (H24): its lane and date are its post's, so it carries neither.
-- ---------------------------------------------------------------------------

-- Every block of Yoonji's: its post, and when it was written (`made` days
-- back, at `wrote`). Blocks of one post read in the order they were written.
with day as (select (now() at time zone 'America/Vancouver')::date as d)
insert into public.ripples (id, author_id, note, splash_id, created_at)
select v.id, '8d798ff1-3d4e-4316-86e0-dd883cae41a0', v.note, v.splash,
       (day.d - v.made) at time zone 'America/Vancouver' + v.wrote
  from day,
       (values
         ('6031d6b1-79e0-4fb6-ba92-2e0a83393052'::uuid, '9fe149ef-31eb-45e2-8b6e-91724c5ccdde'::uuid,
          'sea to sky, fog the whole way up', 40, interval '11 hours 30 minutes'),
         ('c5e7ecff-ea24-4b25-9ddd-e427973156c0', '9fe149ef-31eb-45e2-8b6e-91724c5ccdde',
          'the village at night, empty', 40, interval '21 hours 15 minutes'),
         ('d0e290ca-a6a1-413c-8c08-7e55c195602a', '9fe149ef-31eb-45e2-8b6e-91724c5ccdde',
          'peak chair', 39, interval '10 hours 5 minutes'),
         ('cbe3334d-dcc8-48f5-8469-c08c7f82ff0c', '9fe149ef-31eb-45e2-8b6e-91724c5ccdde',
          'last coffee before the drive', 37, interval '8 hours 40 minutes'),
         ('a3cbe010-f73c-4c1f-a127-64014142a8e4', '4199a2da-0858-4426-9177-7bd1b3891acc',
          'watched the whole dogfood month back as one scroll', 25, interval '20 hours'),
         ('ad74adb6-61d8-4601-98ca-ed4f21f4b26c', '4199a2da-0858-4426-9177-7bd1b3891acc',
          'the record is a fragment, not a timesheet', 12, interval '9 hours 30 minutes'),
         ('b44fcc78-c934-4a08-812b-9e3188ae0648', '4199a2da-0858-4426-9177-7bd1b3891acc',
          'two modes, one scroll', 2, interval '14 hours'),
         ('97aee2ea-d4b9-4ecf-b7cf-fefd39d5715e', '4199a2da-0858-4426-9177-7bd1b3891acc',
          'the sketch that started it, found in a notebook', 0, interval '8 hours'),
         ('3d9724b7-9520-44dd-8ee1-20aa420279e5', '21b39c15-05a1-47a7-b03e-504f84771e16',
          'the drive down, nothing but radio', 3, interval '20 hours'),
         ('2c22f6c4-5aff-4748-b03e-414dfc56f215', '21b39c15-05a1-47a7-b03e-504f84771e16',
          'home a day late and glad of it', 0, interval '9 hours'),
         ('fea8bf04-0dc1-4e36-8f48-d7be744b5368', '955e1f86-885f-4710-be03-23e6082c4b64',
          'coffee went cold while I read the whole thing', 0, interval '8 hours 10 minutes'),
         ('bc3c7207-bd71-401a-a26d-7bde347f6285', '91b783f0-4c4f-4153-88d4-40f8bd2ee51e',
          'kitsilano beach', 0, interval '12 hours 15 minutes'),
         ('1b85aee1-c2c7-4abf-8ed8-99dd0bad45c0', '6d18ed8f-c273-4921-9bfb-2d6b4585e8f5',
          'parannoul on repeat', 0, interval '14 hours 40 minutes'),
         -- Locked: the audience row is added below.
         ('8a8046d5-5b9c-4598-9550-ffff4fd9cdd5', '17d76ad8-60c5-47bb-bf94-603088ba5012',
          'the thing I am not saying out loud yet', 0, interval '16 hours'),
         ('c4eb4f80-6555-42c6-a996-03a2693483b4', 'e1294919-0e18-4326-9917-481115c1de2c',
          'slept badly, worked anyway', 0, interval '7 hours'),
         ('1c77daad-2085-432a-b1cc-3f61087165f6', 'a0732cde-1f3f-46f6-9c5f-6c2ae6950f7d',
          'dinner at the long table', 1, interval '22 hours'),
         ('e7c4c99a-6867-400c-a79a-f3be0fba4d24', 'e951064a-50c5-47d7-a5ad-8b105b894398',
          'call from mom, halfway through', 1, interval '22 hours 5 minutes'),
         ('647ec10a-bf1b-4b15-b417-c650bd8b32d1', '03a27582-1d71-4f65-9178-19851f9c6ee9',
          'that one song again', 1, interval '20 hours 10 minutes'),
         ('f4917f47-f6c2-4380-9feb-775621baeaa3', 'af394992-07ea-4e4b-9889-520309aad051',
          'dinner with mina', 0, interval '15 hours')
       ) as v(id, splash, note, made, wrote);

insert into public.ripples (id, author_id, note, splash_id)
values
  ('a68f332b-956c-4510-a8ba-1fdcb2293eee', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'seongsu, again',
   '759edb92-a404-487a-a730-7907ee0e2a76'),
  ('62acbd60-4b88-4683-a777-9257d386cfaf', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'thesis playlist, again',
   '767b7019-a6b6-453f-bafd-5e8e2631823b'),
  ('0f0a45dd-0b9e-4b6f-b6a5-acd46aea3d0a', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351', 'rained all afternoon',
   '4bc21686-cffa-4388-b8ec-f1e1a8cf4afb'),
  -- A Ripple that persists (C7 — presence expires, records do not) behind a
  -- profile that is past its TTL.
  ('f3ad7f54-e879-420f-a44e-e5e2f22c8d55', '46eb0b0a-17ec-41b7-be7a-156f24618590', 'see you when I see you',
   'b9b437b4-7942-4ac7-a19b-0465d6e82df0');

-- ---------------------------------------------------------------------------
-- audience — one locked Ripple, the fixture the RLS test is written against
-- ---------------------------------------------------------------------------

insert into public.ripple_audience (ripple_id, target_type)
values ('8a8046d5-5b9c-4598-9550-ffff4fd9cdd5', 'lock');

-- ---------------------------------------------------------------------------
-- witness — Mina has seen one of Yoonji's drops
-- ---------------------------------------------------------------------------

insert into public.ripple_views (ripple_id, viewer_id)
values ('bc3c7207-bd71-401a-a26d-7bde347f6285', 'a9a48458-96df-4da7-8b9d-b3f7a0b35351');

-- The trigger on ripples moved every profile's last_active_at to now(); put
-- the seeded presence back so Jae stays past his TTL.
update public.profiles set last_active_at = now() - interval '20 minutes'
 where id = 'a9a48458-96df-4da7-8b9d-b3f7a0b35351';
update public.profiles set last_active_at = now() - interval '5 days'
 where id = '46eb0b0a-17ec-41b7-be7a-156f24618590';
