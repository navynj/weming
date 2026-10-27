-- 0033: Sharing model v2, expand (2026-10-26; _docs/SHARING-V2.md, H27).
--
-- Two places. A Home record is private by default and shared record by
-- record: Audience turns a pool on and picks one of its lanes, with no link
-- needed. A pool record is written in a pool with no lane of mine: today's
-- Just-mine row (own_pool_id and its placement), renamed in the app only.
-- Together makes a joint record whose "Add your side" slots are its
-- invitees. Links are advanced only (Pool settings → Advanced), many to
-- many once 0034 lands, with two optional defaults kept as markers:
--
--   is_default       the default pool lane for (my lane, pool); one per
--                    (my lane, pool) with links, kept by a deferred trigger
--   share_by_default on the default row only: a new Home record in that
--                    lane starts shared there. False when made
--   is_home          the home lane for (me, pool lane): its pool records
--                    and joint records show in that lane's column on Home
--                    instead of the pool's. Optional; display only
--
-- Backfill (Yoonji, in the session):
--   is_default       the sending link (out/both; one per (my lane, pool) by
--                    0019), else the oldest link
--   share_by_default false on every migrated default row, out and both
--                    included: production shows 0 records shared through a
--                    default, and Home is private by default
--   is_home          both and in; out sets none (it never brought records in)
--   Everyone         decision 4 (a), every current member, as Everyone on
--                    (joint_invite_all) for each existing joint record: it
--                    invites later joiners too, as "every current member"
--                    did. No invitee rows are written
--
-- Nothing a reader sees changes: every placement keeps its pool lane and
-- its switch, every joint record keeps its column (the home lane is exactly
-- the link _joint_lane_for read: both/in, one per pool lane by 0009).
--
-- Expand: additive. Columns, a table, indexes, a deferred trigger, new
-- functions; functions replaced so the old app and the new both work:
--   lane_is_mine_in   a placement may go on any lane of a pool I am a
--                     current member of, author only (decision 7)
--   _set_links        keeps markers, switches no placement off; takes the
--                     old direction-shaped links too
--   _place_on         needs no link
--   set_splash_lane   moves no placement: sharing is per record
--   splash_to_mine    keeps no placement: its lane and Audience are set anew
--   splash_to_joint, create_joint_splash  the old app's calls, kept until
--                     0034 as wrappers that make Everyone on
--   join_pool, create_pool  place nothing earlier (decision 5)
--   delete_pool       joint ripples go to the author's home lane
-- Added: joint_invitees, splashes.joint_invite_all ("Everyone"),
-- pools.invite_all_by_default, add_joint_invitees, joint_together,
-- set_pool_invite_all, create_together_splash and splash_to_together (the
-- new app's, Everyone said explicitly),
-- _home_lane_for, _settle_lane_default.
--
-- Until 0034 the old indexes hold: one link of mine per pool lane (0009)
-- and one out/both link per (my lane, pool) (0019). New links are written
-- as `in`, which nothing reads after the switch, so 0019 never refuses one.
-- Nothing is dropped here; 0034 contracts with Yoonji's quoted approval.

-- ---------------------------------------------------------------------------
-- links: the three markers, backfilled
-- ---------------------------------------------------------------------------

alter table public.lane_mappings
  add column is_default boolean not null default false,
  add column share_by_default boolean,
  add column is_home boolean not null default false;

comment on column public.lane_mappings.is_default is
  'The default pool lane for (my_category_id, pool_id): one per pair with links (0033).';
comment on column public.lane_mappings.share_by_default is
  'On the default row only: a new Home record in this lane starts shared to this pool. False when made (0033).';
comment on column public.lane_mappings.is_home is
  'The home lane for (user_id, pool_lane_id): pool and joint records on that pool lane show in this lane''s column on Home. Optional (0033).';
comment on column public.lane_mappings.direction is
  'Frozen by 0033 (written as in for new links, read by nothing after the switch); dropped in 0034.';

update public.lane_mappings m
   set is_default = true,
       share_by_default = false
 where m.id in (
   select distinct on (my_category_id, pool_id) id
     from public.lane_mappings
    order by my_category_id, pool_id, (direction in ('out', 'both')) desc, created_at, id
 );

update public.lane_mappings
   set is_home = true
 where direction in ('both', 'in');

alter table public.lane_mappings
  add constraint lane_mappings_share_on_default
    check ((share_by_default is null) = (not is_default));

create unique index lane_mappings_one_default
  on public.lane_mappings (my_category_id, pool_id) where is_default;

create unique index lane_mappings_one_home
  on public.lane_mappings (user_id, pool_lane_id) where is_home;

-- A (my lane, pool) with links always has a default: when that row goes or
-- loses the marker, the oldest remaining link takes it, sharing off.
create function public._settle_lane_default(cid uuid, pid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.lane_mappings
     where my_category_id = cid and pool_id = pid and is_default
  ) then
    update public.lane_mappings
       set is_default = true, share_by_default = false
     where id = (
       select id from public.lane_mappings
        where my_category_id = cid and pool_id = pid
        order by created_at, id
        limit 1
     );
  end if;
end;
$$;

create function public.keep_lane_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public._settle_lane_default(old.my_category_id, old.pool_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public._settle_lane_default(new.my_category_id, new.pool_id);
  end if;
  return null;
end;
$$;

create constraint trigger lane_mappings_keep_default
  after insert or update or delete on public.lane_mappings
  deferrable initially deferred
  for each row execute function public.keep_lane_default();

-- The home lane of mine for a joint or pool record's pool lane, or none:
-- the pool's own column. The database's copy of the app's homeLaneFor.
create function public._home_lane_for(sid uuid, uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.my_category_id
    from public.splashes s
    join public.lane_mappings m
      on m.pool_lane_id = coalesce(
           s.pool_lane_id,
           (select p.pool_lane_id from public.splash_placements p
             where p.splash_id = s.id and p.pool_id = s.own_pool_id)
         )
   where s.id = sid
     and m.user_id = uid
     and m.is_home;
$$;

-- ---------------------------------------------------------------------------
-- together: who "Add your side" waits for
-- ---------------------------------------------------------------------------

-- Two ways to be together on a joint record (Yoonji, in the session):
-- Everyone (joint_invite_all), dynamic — every current member, including
-- people who join later; and individual picks, fixed rows in
-- joint_invitees. A member who leaves drops out of the open slots; one who
-- already wrote keeps their side (their ripples stay, as ever).

alter table public.splashes
  add column joint_invite_all boolean not null default false,
  add constraint splashes_invite_all_joint check (owner_id is null or not joint_invite_all);

comment on column public.splashes.joint_invite_all is
  'Everyone (0033): a joint record together with every current member of its pool, later joiners included. Defaults on (the old app''s joint records); the new app says which. Only ever turned on; reset when it stops being joint.';

-- Decision 4 (a), as Everyone: every existing joint record stays together
-- with every current member, as it was.
update public.splashes set joint_invite_all = true where owner_id is null;

-- From here the default is Everyone (Yoonji, in the session): a joint
-- record the old app makes between this push and the deploy keeps inviting
-- every member, as the old app promised. The new app always says which
-- (create_together_splash, splash_to_together). A record of someone's own
-- is never together: on insert the default yields to that.
alter table public.splashes alter column joint_invite_all set default true;

create function public.settle_joint_invite_all()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is not null then
    new.joint_invite_all := false;
  end if;
  return new;
end;
$$;

create trigger splashes_settle_joint_invite_all
  before insert on public.splashes
  for each row execute function public.settle_joint_invite_all();

alter table public.pools
  add column invite_all_by_default boolean not null default false;

comment on column public.pools.invite_all_by_default is
  'Pool settings: "Invite everyone to new posts by default" (0033). Preselects Everyone in this pool''s compose. Off when a pool is made.';

create table public.joint_invitees (
  splash_id uuid not null references public.splashes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_at timestamptz not null default now(),
  primary key (splash_id, user_id)
);

comment on table public.joint_invitees is
  'Who a joint record is together with, picked one by one (0033): fixed rows beside Everyone (splashes.joint_invite_all). Written by the joint functions only.';

create index joint_invitees_user_idx on public.joint_invitees (user_id);

create function public._joint_pool(sid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pool_id from public.splashes where id = sid and owner_id is null;
$$;

alter table public.joint_invitees enable row level security;

create policy "invitees are readable by the pool's current members"
  on public.joint_invitees for select
  using (public.is_current_member(public._joint_pool(splash_id)));

-- Everyone stays on once on: nobody is taken off. A conversion out of joint
-- (reshape) resets it with the rest.
create function public.hold_joint_invite_all()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.joint_invite_all and not new.joint_invite_all
     and new.owner_id is null
     and coalesce(current_setting('weming.reshape', true), '') <> 'on' then
    raise exception 'Everyone stays together on this record.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger splashes_hold_joint_invite_all
  before update of joint_invite_all on public.splashes
  for each row execute function public.hold_joint_invite_all();

-- Any current member adds people to a joint record (decision 6), or turns
-- Everyone on; each person must be a current member of its pool. Adding is
-- all there is: nobody is taken off.
create function public.add_joint_invitees(p_splash uuid, p_users uuid[], p_everyone boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := public._joint_pool(p_splash);
begin
  if pid is null then
    raise exception 'only a joint record is together' using errcode = '42501';
  end if;
  perform public._require_member(pid);
  if exists (
    select 1 from unnest(coalesce(p_users, '{}'::uuid[])) u
     where not exists (
       select 1 from public.pool_members
        where pool_id = pid and user_id = u and left_at is null
     )
  ) then
    raise exception 'Only members of this Pool can be together here.' using errcode = '42501';
  end if;
  insert into public.joint_invitees (splash_id, user_id)
  select p_splash, u from unnest(coalesce(p_users, '{}'::uuid[])) u
  on conflict do nothing;
  if coalesce(p_everyone, false) then
    update public.splashes set joint_invite_all = true
     where id = p_splash and not joint_invite_all;
  end if;
end;
$$;

-- Who each joint record is together with now: its pool's current members
-- under Everyone, else its picked invitees still in the pool. Only for
-- records of pools I am in. What "Add your side" waits for is this, less
-- those who wrote.
create function public.joint_together(p_splashes uuid[])
returns table (splash_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, m.user_id
    from public.splashes s
    join public.pool_members m on m.pool_id = s.pool_id and m.left_at is null
   where s.id = any (p_splashes)
     and s.owner_id is null
     and public.is_current_member(s.pool_id)
     and (
       s.joint_invite_all
       or exists (
         select 1 from public.joint_invitees i
          where i.splash_id = s.id and i.user_id = m.user_id
       )
     );
$$;

-- Pool settings: any current member, as with its lanes (no roles yet).
create function public.set_pool_invite_all(p_pool uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_member(p_pool);
  update public.pools set invite_all_by_default = coalesce(p_on, false) where id = p_pool;
end;
$$;

-- ---------------------------------------------------------------------------
-- placements: any lane of a pool I am in, author only (decision 7)
-- ---------------------------------------------------------------------------

-- The placement policies already require the author and a current member of
-- the placement's pool; this keeps the name they call and drops the link.
create or replace function public.lane_is_mine_in(plid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.pool_lanes l
     where l.id = plid
       and public.is_current_member(l.pool_id)
  );
$$;

create or replace function public._place_on(sid uuid, uid uuid, cid uuid, plid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  -- `cid` is no longer read: a record is placed per record (0033).
  select pool_id into pid from public.pool_lanes where id = plid;
  if pid is null then
    raise exception 'no such pool lane' using errcode = '42501';
  end if;
  perform public._require_member(pid);
  insert into public.splash_placements (splash_id, pool_id, pool_lane_id, shared)
  values (sid, pid, plid, true)
  on conflict (splash_id, pool_id)
  do update set pool_lane_id = excluded.pool_lane_id, shared = true, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- links: markers kept, nothing switched off
-- ---------------------------------------------------------------------------

-- p_links: [{pool_lane_id, my_category_id, is_default?, share_by_default?,
-- is_home?}], the whole set for this pool. The old app's shape, with a
-- direction and no markers, still works until the switch: both/in mark the
-- home lane, out/both the default, and a default keeps its sharing.
-- Unlinking changes defaults and display only: no placement is switched
-- off or moved (0033).
create or replace function public._set_links(pid uuid, uid uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link jsonb;
  plid uuid;
  cid uuid;
  dir text;
  shared_before jsonb;
  mid uuid;
  wants_default boolean;
begin
  if p_links is not null and jsonb_typeof(p_links) <> 'array' then
    raise exception 'links must be an array' using errcode = '22023';
  end if;

  -- What each lane of mine shared by default here, for the old shape.
  select coalesce(jsonb_object_agg(my_category_id::text, share_by_default), '{}'::jsonb)
    into shared_before
    from public.lane_mappings
   where pool_id = pid and user_id = uid and is_default;

  -- Gone: every link not in the set ("Don't connect" is a null lane).
  delete from public.lane_mappings m
   where m.pool_id = pid and m.user_id = uid
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) e
        where (e ->> 'pool_lane_id')::uuid = m.pool_lane_id
          and nullif(e ->> 'my_category_id', '')::uuid = m.my_category_id
     );

  -- Markers cleared, then set row by row: the partial unique indexes check
  -- each row as it is written.
  update public.lane_mappings
     set is_default = false, share_by_default = null, is_home = false
   where pool_id = pid and user_id = uid
     and (is_default or is_home);

  for link in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    plid := (link ->> 'pool_lane_id')::uuid;
    cid := nullif(link ->> 'my_category_id', '')::uuid;
    if cid is null then
      continue;
    end if;
    dir := nullif(link ->> 'direction', '');
    if not exists (select 1 from public.pool_lanes where id = plid and pool_id = pid) then
      raise exception 'pool lane % is not in this pool', plid using errcode = '42501';
    end if;
    if not exists (select 1 from public.my_categories where id = cid and user_id = uid) then
      raise exception 'lane % is not yours', cid using errcode = '42501';
    end if;

    insert into public.lane_mappings (user_id, my_category_id, pool_lane_id, pool_id, direction)
    values (uid, cid, plid, pid, coalesce(dir, 'in')::public.lane_link_direction)
    on conflict (my_category_id, pool_lane_id) do update
      set direction = coalesce(dir::public.lane_link_direction, public.lane_mappings.direction)
    returning id into mid;

    if dir is not null then
      wants_default := dir in ('out', 'both');
      update public.lane_mappings
         set is_home = dir in ('both', 'in'),
             is_default = wants_default,
             share_by_default = case when wants_default
                                     then coalesce((shared_before ->> cid::text)::boolean, false)
                                end
       where id = mid;
    else
      wants_default := coalesce((link ->> 'is_default')::boolean, false);
      update public.lane_mappings
         set is_home = coalesce((link ->> 'is_home')::boolean, false),
             is_default = wants_default,
             share_by_default = case when wants_default
                                     then coalesce((link ->> 'share_by_default')::boolean, false)
                                end
       where id = mid;
    end if;
  end loop;
  -- A (my lane, pool) left with no default gets its oldest link, at commit.
end;
$$;

-- ---------------------------------------------------------------------------
-- records: a lane change moves no placement; conversions keep what is seen
-- ---------------------------------------------------------------------------

create or replace function public.set_splash_lane(p_splash uuid, p_my_lane uuid, p_place_on uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
begin
  if not exists (
    select 1 from public.splashes
     where id = p_splash and owner_id = uid and own_pool_id is null
  ) then
    raise exception 'only your own splash changes lane this way' using errcode = '42501';
  end if;
  if p_my_lane is not null
     and not exists (select 1 from public.my_categories where id = p_my_lane and user_id = uid) then
    raise exception 'that lane is not yours' using errcode = '42501';
  end if;

  -- Sharing is per record (0033): every placement stays where it is.
  update public.splashes set declared_lane_id = p_my_lane where id = p_splash;
  if p_place_on is not null then
    perform public._place_on(p_splash, uid, p_my_lane, p_place_on);
  end if;
end;
$$;

-- A joint record or my pool record becomes my Home record, in a lane of
-- mine ("Make it mine", "Move to Home…", from Home only; Yoonji, in the
-- session). Its lane and its Audience are set anew: it keeps no placement,
-- and the app shares it where Audience says (placed here only when
-- p_place_on names a pool lane).
create or replace function public.splash_to_mine(p_splash uuid, p_my_lane uuid, p_place_on uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  s record;
  pid uuid;
begin
  select id, owner_id, pool_id, pool_lane_id, own_pool_id into s
    from public.splashes where id = p_splash;
  if not found then
    raise exception 'that splash is gone' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.my_categories where id = p_my_lane and user_id = uid) then
    raise exception 'that lane is not yours' using errcode = '42501';
  end if;
  if s.owner_id is null then
    pid := s.pool_id;
    perform public._require_member(pid);
    perform public._require_only_mine(p_splash, uid);
  elsif s.own_pool_id is not null and s.owner_id = uid then
    pid := s.own_pool_id;
  else
    raise exception 'only a joint record or your pool record becomes yours this way'
      using errcode = '42501';
  end if;

  perform set_config('weming.reshape', 'on', true);
  delete from public.splash_placements where splash_id = p_splash;
  delete from public.joint_invitees where splash_id = p_splash;
  update public.splashes
     set owner_id = uid,
         pool_id = null,
         pool_lane_id = null,
         own_pool_id = null,
         declared_lane_id = p_my_lane,
         pinned_at = null,
         joint_invite_all = false
   where id = p_splash;
  if p_place_on is not null then
    perform public._place_on(p_splash, uid, p_my_lane, p_place_on);
  end if;
  perform set_config('weming.reshape', 'off', true);
end;
$$;

-- My Home record or my pool record becomes the pool's joint record ("Make
-- it joint…"), with Everyone or not (p_invite_all, said by the new app). A
-- Home record may go to any pool I am in; a pool record stays in its own.
-- Its maker is the first invitee; Together adds others.
create function public.splash_to_together(p_splash uuid, p_pool_lane uuid, p_invite_all boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  s record;
  pid uuid;
begin
  select id, owner_id, own_pool_id into s from public.splashes where id = p_splash;
  if not found then
    raise exception 'that splash is gone' using errcode = 'P0002';
  end if;
  if s.owner_id is distinct from uid then
    raise exception 'only its author makes a splash joint' using errcode = '42501';
  end if;
  select pool_id into pid from public.pool_lanes where id = p_pool_lane;
  if pid is null then
    raise exception 'no such pool lane' using errcode = '42501';
  end if;
  perform public._require_member(pid);
  if s.own_pool_id is not null and s.own_pool_id <> pid then
    raise exception 'a pool record stays in its pool' using errcode = '42501';
  end if;
  perform public._require_only_mine(p_splash, uid);

  perform set_config('weming.reshape', 'on', true);
  -- Every pool it was shared to lets go of it; a joint splash is the pool's own.
  delete from public.splash_placements where splash_id = p_splash;
  delete from public.splash_origins where splash_id = p_splash;
  update public.splashes
     set owner_id = null,
         own_pool_id = null,
         pool_id = pid,
         pool_lane_id = p_pool_lane,
         created_by = uid,
         declared_lane_id = null,
         session_id = null,
         pinned_at = null,
         joint_invite_all = coalesce(p_invite_all, false)
   where id = p_splash;
  insert into public.joint_invitees (splash_id, user_id) values (p_splash, uid)
  on conflict do nothing;
  perform set_config('weming.reshape', 'off', true);
end;
$$;

-- The old app's call, until 0034: as before the switch, together with
-- every member.
create or replace function public.splash_to_joint(p_splash uuid, p_pool_lane uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.splash_to_together(p_splash, p_pool_lane, true);
$$;

-- A joint record, with Everyone or not (p_invite_all, said by the new
-- app). Its maker is its first invitee; Together adds the rest
-- (add_joint_invitees).
create function public.create_together_splash(
  p_id uuid,
  p_pool uuid,
  p_pool_lane uuid,
  p_title text,
  p_icon text,
  p_declared_start date,
  p_invite_all boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_member(p_pool);
  sid uuid;
begin
  if not exists (select 1 from public.pool_lanes where id = p_pool_lane and pool_id = p_pool) then
    raise exception 'pool lane is not in this pool' using errcode = '42501';
  end if;

  insert into public.splashes
    (id, owner_id, pool_id, pool_lane_id, created_by, title, icon, declared_start, joint_invite_all)
  values (
    coalesce(p_id, gen_random_uuid()),
    null,
    p_pool,
    p_pool_lane,
    uid,
    coalesce(btrim(p_title), ''),
    nullif(btrim(coalesce(p_icon, '')), ''),
    p_declared_start,
    coalesce(p_invite_all, false)
  )
  returning id into sid;
  insert into public.joint_invitees (splash_id, user_id) values (sid, uid);
  return sid;
end;
$$;

-- The old app's call, until 0034: as before the switch, together with
-- every member.
create or replace function public.create_joint_splash(
  p_id uuid,
  p_pool uuid,
  p_pool_lane uuid,
  p_title text,
  p_icon text default null,
  p_declared_start date default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_together_splash(p_id, p_pool, p_pool_lane, p_title, p_icon, p_declared_start, true);
$$;

-- ---------------------------------------------------------------------------
-- pools: joining places nothing; deleting uses the home lane
-- ---------------------------------------------------------------------------

create or replace function public.join_pool(p_token text, p_links jsonb, p_include_history boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := public._require_uid();
  pid uuid := public._invite_pool(p_token);
begin
  if pid is null then
    raise exception 'This invite link is no longer valid.' using errcode = '42501';
  end if;

  -- Already here: joining again changes nothing (links live in settings).
  if exists (
    select 1 from public.pool_members
     where pool_id = pid and user_id = uid and left_at is null
  ) then
    return pid;
  end if;

  -- A former member comes back on their old row: rejoining is a new join, so
  -- they take the last column, and their kept-or-removed choice resets.
  insert into public.pool_members (pool_id, user_id, include_history)
  values (pid, uid, coalesce(p_include_history, false))
  on conflict (pool_id, user_id) do update
     set left_at = null,
         keep_on_leave = null,
         joined_at = now(),
         include_history = excluded.include_history;

  -- Joining asks nothing about lanes (2026-10-26) and places nothing:
  -- "include my earlier records" is retired with join-time matching (0033).
  perform public._set_links(pid, uid, p_links);

  return pid;
end;
$function$;

create or replace function public.create_pool(p_name text, p_kind pool_kind, p_lanes jsonb, p_include_history boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := public._require_uid();
  pid uuid;
  lane jsonb;
  ord bigint;
  plid uuid;
  links jsonb := '[]'::jsonb;
begin
  if p_lanes is null or jsonb_typeof(p_lanes) <> 'array'
     or jsonb_array_length(p_lanes) not between 1 and 12 then
    raise exception 'a pool needs between 1 and 12 lanes' using errcode = '22023';
  end if;

  insert into public.pools (name, kind, visibility, owner_id)
  values (btrim(p_name), p_kind, 'private', uid)
  returning id into pid;

  insert into public.pool_members (pool_id, user_id, include_history)
  values (pid, uid, coalesce(p_include_history, false));

  for lane, ord in select * from jsonb_array_elements(p_lanes) with ordinality loop
    insert into public.pool_lanes (pool_id, name, icon, description, position)
    values (
      pid,
      btrim(lane ->> 'name'),
      nullif(btrim(coalesce(lane ->> 'icon', '')), ''),
      nullif(btrim(coalesce(lane ->> 'description', '')), ''),
      ord - 1
    )
    returning id into plid;
    links := links || jsonb_build_array(jsonb_build_object(
      'pool_lane_id', plid,
      'my_category_id', lane ->> 'my_category_id',
      'direction', lane ->> 'direction'
    ));
  end loop;

  -- Links made here are advanced links like any other (0033); nothing
  -- earlier is placed.
  perform public._set_links(pid, uid, links);

  return pid;
end;
$function$;

create or replace function public.delete_pool(p_pool uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := public._require_uid();
  pool public.pools%rowtype;
  grp record;
  shell record;
  writer uuid;
  lane_name text;
  n integer;
  cid uuid;
  made jsonb := '{}'::jsonb;
  sid uuid;
begin
  select * into pool from public.pools where id = p_pool for update;
  if pool.id is null then
    raise exception 'no such pool' using errcode = 'P0002';
  end if;
  if pool.owner_id is null or pool.owner_id <> uid then
    raise exception 'Only the Pool''s creator can delete it.' using errcode = '42501';
  end if;
  perform public._require_member(p_pool);
  perform set_config('weming.pool_teardown', 'on', true);

  -- One lane per author per pool lane that holds anything of theirs with no
  -- lane of theirs to go to: pool records, and joint ripples whose pool lane
  -- has no home lane of theirs (0033).
  for grp in
    select x.author, l.id as pool_lane_id, l.name, l.icon
      from (
        select s.owner_id as author, sp.pool_lane_id
          from public.splashes s
          join public.splash_placements sp on sp.splash_id = s.id and sp.pool_id = p_pool
         where s.own_pool_id = p_pool
        union
        select r.author_id, s.pool_lane_id
          from public.ripples r
          join public.splashes s on s.id = r.splash_id
         where s.pool_id = p_pool and s.owner_id is null
           and public._home_lane_for(s.id, r.author_id) is null
      ) x
      join public.pool_lanes l on l.id = x.pool_lane_id
  loop
    lane_name := grp.name;
    if exists (select 1 from public.my_categories where user_id = grp.author and name = lane_name) then
      lane_name := grp.name || ' (' || pool.name || ')';
      n := 2;
      while exists (select 1 from public.my_categories where user_id = grp.author and name = lane_name) loop
        lane_name := grp.name || ' (' || pool.name || ' ' || n || ')';
        n := n + 1;
      end loop;
    end if;
    insert into public.my_categories (user_id, name, icon, position)
    values (
      grp.author,
      lane_name,
      grp.icon,
      coalesce((select max(position) + 1 from public.my_categories where user_id = grp.author), 0)
    )
    returning id into cid;
    made := made || jsonb_build_object(grp.author || ':' || grp.pool_lane_id, cid);
  end loop;

  -- Pool records (once Just mine): into that lane.
  for grp in
    select s.id, s.owner_id as author, sp.pool_lane_id, l.name, l.icon
      from public.splashes s
      join public.splash_placements sp on sp.splash_id = s.id and sp.pool_id = p_pool
      join public.pool_lanes l on l.id = sp.pool_lane_id
     where s.own_pool_id = p_pool
  loop
    cid := (made ->> (grp.author || ':' || grp.pool_lane_id))::uuid;
    update public.splashes set own_pool_id = null, declared_lane_id = cid where id = grp.id;
    insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon)
    values (grp.id, pool.name, grp.name, grp.icon);
  end loop;

  -- Joint splashes: each author's ripples become one post of theirs, with
  -- the joint splash's title, icon and range.
  for shell in
    select s.*, l.name as lane_name, l.icon as lane_icon
      from public.splashes s
      join public.pool_lanes l on l.id = s.pool_lane_id
     where s.pool_id = p_pool and s.owner_id is null
  loop
    for writer in
      select distinct author_id from public.ripples where splash_id = shell.id
    loop
      cid := coalesce(
        public._home_lane_for(shell.id, writer),
        (made ->> (writer || ':' || shell.pool_lane_id))::uuid
      );
      insert into public.splashes
        (owner_id, title, icon, declared_start, declared_end, declared_lane_id, created_at)
      values (
        writer,
        shell.title,
        shell.icon,
        shell.declared_start,
        shell.declared_end,
        cid,
        (select min(created_at) from public.ripples where splash_id = shell.id and author_id = writer)
      )
      returning id into sid;
      update public.ripples set splash_id = sid where splash_id = shell.id and author_id = writer;
      insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon)
      values (sid, pool.name, shell.lane_name, shell.lane_icon);
    end loop;
    delete from public.splashes where id = shell.id;
  end loop;

  -- Shared splashes: untouched, but for where they came from.
  insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon)
  select sp.splash_id,
         coalesce(sp.origin_pool_name, pool.name),
         coalesce(sp.origin_pool_lane_name, l.name),
         coalesce(sp.origin_pool_lane_icon, l.icon)
    from public.splash_placements sp
    join public.pool_lanes l on l.id = sp.pool_lane_id
   where sp.pool_id = p_pool
     and sp.shared
     and not exists (select 1 from public.splash_origins o where o.splash_id = sp.splash_id
                      and o.pool_name = pool.name and o.recorded_at = now());

  delete from public.pools where id = p_pool;
end;
$function$;


-- ---------------------------------------------------------------------------
-- grants: signed-out callers reach nothing (0026)
-- ---------------------------------------------------------------------------

revoke all on table public.joint_invitees from anon;
revoke insert, update, delete on table public.joint_invitees from authenticated;
revoke execute on function public._settle_lane_default(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.keep_lane_default() from public, anon, authenticated;
revoke execute on function public._home_lane_for(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._joint_pool(uuid) from public, anon;
revoke execute on function public.add_joint_invitees(uuid, uuid[], boolean) from public, anon;
grant execute on function public.add_joint_invitees(uuid, uuid[], boolean) to authenticated;
revoke execute on function public.joint_together(uuid[]) from public, anon;
grant execute on function public.joint_together(uuid[]) to authenticated;
revoke execute on function public.set_pool_invite_all(uuid, boolean) from public, anon;
grant execute on function public.set_pool_invite_all(uuid, boolean) to authenticated;
revoke execute on function public.hold_joint_invite_all() from public, anon, authenticated;
revoke execute on function public.settle_joint_invite_all() from public, anon, authenticated;
revoke execute on function public.create_together_splash(uuid, uuid, uuid, text, text, date, boolean) from public, anon;
grant execute on function public.create_together_splash(uuid, uuid, uuid, text, text, date, boolean) to authenticated;
revoke execute on function public.splash_to_together(uuid, uuid, boolean) from public, anon;
grant execute on function public.splash_to_together(uuid, uuid, boolean) to authenticated;
