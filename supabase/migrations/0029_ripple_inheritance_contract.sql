-- 0029: ripples inherit lane and date from their splash — contract (2026-10-26).
--
-- The last step of expand, switch, contract (0028 is the expand). The app
-- deployed between them writes no ripple lane or date and derives where a
-- joint splash shows on Home, so from here on:
--   (1) the backfill runs once more, for what the old app wrote after 0028;
--   (2) the 9 joint ripples in production (and any since) drop their
--       stored lane;
--   (3) a ripple's own lane and date fields freeze: a new ripple carries
--       none and always names a splash; an existing ripple's values stay as
--       written, readable metadata never used for placement (Yoonji:
--       occurred_on, occurred_time, ended_at, started_at and
--       parent_ripple_id "stay frozen as metadata; existing values remain
--       readable and shown where they are today, no new ones are written");
--   (4) every splash has a date, and a personal one a lane;
--       splashes.declared_lane_id becomes ON DELETE RESTRICT;
--   (5) no function writes ripples.category_id any more.
-- A later release, separately approved, drops ripples.category_id.
--
-- Approved in the session by Yoonji (2026-10-26), given for 0028 and moved
-- here with the rollout ("The approval I gave for 0028 applies to these
-- steps in 0029; quote it there"), quoted:
--   "I approve, in release 1 (0028): replacing the splashes.declared_lane_id
--   foreign key from ON DELETE SET NULL to ON DELETE RESTRICT, and setting
--   ripples.category_id to null on the 9 joint ripples in production as part
--   of switching the Home column to the derived rule."

-- ---------------------------------------------------------------------------
-- (1) the backfill, again
-- ---------------------------------------------------------------------------

select public._inherit_backfill();

-- ---------------------------------------------------------------------------
-- (2) joint ripples: no stored lane
-- ---------------------------------------------------------------------------

-- Where a joint splash shows on my Home is derived from its pool lane and my
-- link (_joint_lane_for; the app's copy reads the same links).
update public.ripples r
   set category_id = null
  from public.splashes s
 where s.id = r.splash_id
   and s.owner_id is null
   and r.category_id is not null;

-- ---------------------------------------------------------------------------
-- (3) a ripple's own lane and date are frozen
-- ---------------------------------------------------------------------------

-- New ripples carry none of them and always name a splash; an update keeps
-- what was written. A trigger rather than a CHECK, so an old row's text
-- stays editable while its old values stay.
create function public.hold_ripple_inheritance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.splash_id is null then
    raise exception 'a ripple belongs to a splash' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.category_id is not null
       or new.occurred_on is not null
       or new.occurred_time is not null
       or new.ended_at is not null
       or new.parent_ripple_id is not null then
      raise exception 'a ripple takes its lane and date from its splash' using errcode = '23514';
    end if;
  elsif new.category_id is distinct from old.category_id
     or new.occurred_on is distinct from old.occurred_on
     or new.occurred_time is distinct from old.occurred_time
     or new.ended_at is distinct from old.ended_at
     or new.started_at is distinct from old.started_at
     or new.parent_ripple_id is distinct from old.parent_ripple_id then
    raise exception 'a ripple''s own lane and date are kept as written' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ripples_hold_inheritance
  before insert or update on public.ripples
  for each row execute function public.hold_ripple_inheritance();

-- Retired by the trigger above; kept until release 2 drops it with the
-- column it guarded.
create or replace function public.check_ripple_lane()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- (4) a splash always has a date; a personal one, a lane
-- ---------------------------------------------------------------------------

-- A splash made without a date rests on the day it was made. Fires after
-- splashes_set_written_on (triggers run in name order).
create function public.settle_splash_range()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.declared_start is null then
    new.declared_start := new.written_on;
  end if;
  return new;
end;
$$;

create trigger splashes_settle_range
  before insert or update of declared_start on public.splashes
  for each row execute function public.settle_splash_range();

-- The backfill above queued the deferred Just-mine placement check
-- (0014); it runs now, so the table can be altered in the same transaction.
set constraints all immediate;

alter table public.splashes
  add constraint splashes_dated check (declared_start is not null) not valid,
  add constraint splashes_personal_lane check (
    owner_id is null or own_pool_id is not null or declared_lane_id is not null
  ) not valid;
alter table public.splashes validate constraint splashes_dated;
alter table public.splashes validate constraint splashes_personal_lane;

-- Approved (quoted above): a lane a splash stands in cannot vanish.
alter table public.splashes drop constraint splashes_declared_lane_id_fkey;
alter table public.splashes
  add constraint splashes_declared_lane_id_fkey
  foreign key (declared_lane_id) references public.my_categories (id) on delete restrict;

comment on column public.splashes.declared_start is
  'The first day of the splash''s range, which every ripple on it inherits (H24). Never null.';
comment on column public.splashes.declared_lane_id is
  'The lane of a personal splash, which every ripple on it inherits (H24). Null for joint and Just mine, whose lane is their pool lane.';
comment on column public.ripples.category_id is
  'Frozen (H24): the lane this ripple took before inheritance, never written again, unread for placement. Dropped in release 2.';
comment on column public.ripples.occurred_on is
  'Frozen (H24): metadata of when it happened, kept as written; placement reads the splash''s range.';

-- ---------------------------------------------------------------------------
-- (5) functions
-- ---------------------------------------------------------------------------

-- The lane that stands for a personal splash: its own.
create or replace function public._splash_lane(sid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select declared_lane_id from public.splashes where id = sid;
$$;

-- _set_links: a link no longer moves anyone's joint ripples; where a joint
-- splash shows follows the link by itself (_joint_lane_for).
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
  dir public.lane_link_direction;
  before jsonb;
begin
  if p_links is not null and jsonb_typeof(p_links) <> 'array' then
    raise exception 'links must be an array' using errcode = '22023';
  end if;

  -- The links as they were, pool lane → direction, to compare against.
  select coalesce(jsonb_object_agg(pool_lane_id::text, direction), '{}'::jsonb)
    into before
    from public.lane_mappings
   where pool_id = pid and user_id = uid;

  delete from public.lane_mappings where pool_id = pid and user_id = uid;

  for link in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    plid := (link ->> 'pool_lane_id')::uuid;
    cid := (link ->> 'my_category_id')::uuid;
    if cid is null then
      continue; -- "Don't connect"
    end if;
    dir := coalesce(nullif(link ->> 'direction', ''), 'both')::public.lane_link_direction;
    if not exists (select 1 from public.pool_lanes where id = plid and pool_id = pid) then
      raise exception 'pool lane % is not in this pool', plid using errcode = '42501';
    end if;
    if not exists (select 1 from public.my_categories where id = cid and user_id = uid) then
      raise exception 'lane % is not yours', cid using errcode = '42501';
    end if;
    insert into public.lane_mappings (user_id, my_category_id, pool_lane_id, pool_id, direction)
    values (uid, cid, plid, pid, dir);
  end loop;

  -- Off: a placement on a pool lane with no link at all (C5), and one on a
  -- pool lane whose link just lost "out". A Just-mine splash is linked to no
  -- lane of mine and always shared (0014): never touched.
  update public.splash_placements p
     set shared = false, updated_at = now()
    from public.splashes s
   where p.splash_id = s.id
     and s.owner_id = uid
     and p.pool_id = pid
     and p.shared
     and s.own_pool_id is null
     and (
       not exists (
         select 1 from public.lane_mappings m
          where m.user_id = uid and m.pool_lane_id = p.pool_lane_id
       )
       or (
         before ->> p.pool_lane_id::text in ('out', 'both')
         and exists (
           select 1 from public.lane_mappings m
            where m.user_id = uid and m.pool_lane_id = p.pool_lane_id and m.direction = 'in'
         )
       )
     );
end;
$$;

revoke execute on function public._set_links(uuid, uuid, jsonb) from public, anon, authenticated;


-- move_pool_splash: a joint splash moves alone; its ripples inherit.
create or replace function public.move_pool_splash(p_splash uuid, p_pool_lane uuid)
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
  select id, owner_id, pool_id, own_pool_id into s
    from public.splashes where id = p_splash;
  if not found then
    raise exception 'that splash is gone' using errcode = 'P0002';
  end if;

  if s.owner_id is null then
    pid := s.pool_id;
  elsif s.own_pool_id is not null then
    if s.owner_id <> uid then
      raise exception 'only its author moves a Just-mine splash' using errcode = '42501';
    end if;
    pid := s.own_pool_id;
  else
    raise exception 'only a pool''s own splash moves among its lanes' using errcode = '42501';
  end if;
  perform public._require_member(pid);

  if not exists (select 1 from public.pool_lanes where id = p_pool_lane and pool_id = pid) then
    raise exception 'that lane is not in this pool' using errcode = '42501';
  end if;

  if s.owner_id is null then
    -- Its ripples follow by inheritance: nothing of theirs to re-file.
    update public.splashes set pool_lane_id = p_pool_lane where id = p_splash;
  else
    update public.splash_placements
       set pool_lane_id = p_pool_lane, updated_at = now()
     where splash_id = p_splash and pool_id = pid;
  end if;
end;
$$;

revoke execute on function public.move_pool_splash(uuid, uuid) from public, anon;
grant execute on function public.move_pool_splash(uuid, uuid) to authenticated;


-- The conversions change the splash only; its ripples inherit.

create or replace function public.splash_to_joint(p_splash uuid, p_pool_lane uuid)
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
  -- It must already be in that pool: Just mine there, or shared there.
  if s.own_pool_id is distinct from pid and not exists (
    select 1 from public.splash_placements
     where splash_id = p_splash and pool_id = pid and shared
  ) then
    raise exception 'this splash is not in that pool' using errcode = '42501';
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
         pinned_at = null
   where id = p_splash;
  perform set_config('weming.reshape', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- joint or Just mine → my personal splash
-- ---------------------------------------------------------------------------

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
  target uuid;
begin
  select id, owner_id, pool_id, own_pool_id into s from public.splashes where id = p_splash;
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
    raise exception 'only a joint or Just-mine splash becomes yours this way' using errcode = '42501';
  end if;

  perform set_config('weming.reshape', 'on', true);
  delete from public.splash_placements where splash_id = p_splash;
  update public.splashes
     set owner_id = uid,
         pool_id = null,
         pool_lane_id = null,
         own_pool_id = null,
         declared_lane_id = p_my_lane,
         pinned_at = null
   where id = p_splash;
  if p_place_on is not null then
    -- Chosen in the pool (the compose table): placed there.
    perform public._place_on(p_splash, uid, p_my_lane, p_place_on);
  else
    -- From Home: it stays in its pool only where its lane sends.
    target := public._sending_lane(pid, uid, p_my_lane);
    if target is not null and exists (
      select 1 from public.pool_members where pool_id = pid and user_id = uid and left_at is null
    ) then
      insert into public.splash_placements (splash_id, pool_id, pool_lane_id, shared)
      values (p_splash, pid, target, true);
    end if;
  end if;
  perform set_config('weming.reshape', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- personal in a pool, or joint with only my ripples → Just mine
-- ---------------------------------------------------------------------------

create or replace function public.splash_to_just_mine(p_splash uuid, p_pool_lane uuid)
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
  select id, owner_id, pool_id, own_pool_id into s from public.splashes where id = p_splash;
  if not found then
    raise exception 'that splash is gone' using errcode = 'P0002';
  end if;
  select pool_id into pid from public.pool_lanes where id = p_pool_lane;
  if pid is null then
    raise exception 'no such pool lane' using errcode = '42501';
  end if;
  perform public._require_member(pid);
  if s.owner_id is null then
    if s.pool_id <> pid then
      raise exception 'a joint splash stays in its pool' using errcode = '42501';
    end if;
    perform public._require_only_mine(p_splash, uid);
  elsif s.owner_id = uid and s.own_pool_id is null then
    if not exists (
      select 1 from public.splash_placements
       where splash_id = p_splash and pool_id = pid and shared
    ) then
      raise exception 'this splash is not in that pool' using errcode = '42501';
    end if;
    perform public._require_only_mine(p_splash, uid);
  else
    raise exception 'only your splash in this pool becomes Just mine' using errcode = '42501';
  end if;

  perform set_config('weming.reshape', 'on', true);
  -- Just mine lives in one pool: every other placement goes.
  delete from public.splash_placements where splash_id = p_splash;
  update public.splashes
     set owner_id = uid,
         pool_id = null,
         pool_lane_id = null,
         own_pool_id = pid,
         declared_lane_id = null,
         session_id = null,
         pinned_at = null
   where id = p_splash;
  insert into public.splash_placements (splash_id, pool_id, pool_lane_id, shared)
  values (p_splash, pid, p_pool_lane, true);
  perform set_config('weming.reshape', 'off', true);
end;
$$;

-- delete_pool: what was the pool's becomes each author's own, lanes on the
-- splash. A joint splash's share of each author becomes their post in the
-- lane their link brings it into, else in a lane made from the pool lane
-- (as a Just-mine splash always is). Ripples are not touched but to move.
create or replace function public.delete_pool(p_pool uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  -- lane of theirs to go to: Just-mine splashes, and joint ripples whose
  -- pool lane no link of theirs brings in.
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
           and public._joint_lane_for(s.id, r.author_id) is null
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

  -- Just mine: into that lane.
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
        public._joint_lane_for(shell.id, writer),
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
$$;
