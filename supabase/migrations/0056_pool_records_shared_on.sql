-- 0056: my pool records can be shared to my other pools (2026-10-27).
--
-- Planned and approved in the session (part 4): "Keep pool records as
-- they are (written in a pool, no lane of mine). Allow them additional
-- placements in other pools I'm in, through the same Audience chip as Home
-- records (turn on a pool, pick its lane). Their origin pool cannot be
-- turned off; deleting the record removes it everywhere." — "'Move to
-- Home…' stays as an optional way to give it a lane of mine; it keeps all
-- its pool placements." — "Migration: relax the rule that a pool record
-- has exactly one placement (keep: it always has its origin placement,
-- which can't be removed)." And: "leaving the origin pool follows the
-- existing keep or remove choice for that pool; placements in other pools
-- stay. Approved."
--
-- hold_own_pool_placement (0014, 0022) refused any placement but the
-- origin's, and any switch of any placement. Now only the origin placement
-- is held — never moved to another pool, switched off or removed — and
-- the deferred check that it exists (check_own_pool_placed) is unchanged.
-- The placement policies already admit any pool I am in (sharing v2).
--
-- splash_to_mine (0035) took a pool record Home by deleting every placement
-- (refused once members had written, their sides hanging off it). A pool
-- record now keeps every placement and its per-pool With, so members' sides
-- stay where they are and the refusal has nothing left to guard; only its
-- lane and its tie to its pool change. A joint record's path is 0035's.
--
-- Leaving is untouched: leave_pool only marks the membership, and what each
-- pool shows follows member_visible there, so the origin pool follows keep
-- or remove and the other pools are as they were.
--
-- Additive in effect: two functions replaced, same signatures, each
-- refusing less than before. No DDL beyond that.

create or replace function public.hold_own_pool_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  own uuid;
  splash_id uuid := coalesce(new.splash_id, old.splash_id);
begin
  select own_pool_id into own from public.splashes where id = splash_id;
  -- Not a pool record, or the splash itself is being deleted (the cascade
  -- runs after its row is gone), or the pool is torn down, or a conversion
  -- is reshaping it: no rule here.
  if own is null
     or coalesce(current_setting('weming.pool_teardown', true), '') = 'on'
     or coalesce(current_setting('weming.reshape', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  -- Its placements in other pools come and go as a Home record's do (0056);
  -- the origin's stays, shared, in its pool.
  if tg_op = 'UPDATE' and old.pool_id = own and (new.pool_id <> old.pool_id or not new.shared) then
    raise exception 'a pool record is always shared to its pool' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.pool_id <> own and new.pool_id = own then
    raise exception 'a pool record has one placement in its pool' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.pool_id = own then
    raise exception 'a pool record is always shared to its pool' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

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

  if s.owner_id is not null and s.own_pool_id is not null and s.owner_id = uid then
    -- My pool record (0056): it keeps every placement and its With there,
    -- so members' sides keep the placement they hang off (0035's refusal
    -- guarded the drop this no longer makes); it takes a lane of mine and
    -- stops being held to its pool.
    perform set_config('weming.reshape', 'on', true);
    update public.splashes
       set own_pool_id = null,
           declared_lane_id = p_my_lane,
           pinned_at = null
     where id = p_splash;
    perform set_config('weming.reshape', 'off', true);
    return;
  end if;

  -- A joint record: 0035's, unchanged.
  if s.owner_id is null then
    pid := s.pool_id;
    perform public._require_member(pid);
    perform public._require_only_mine(p_splash, uid);
  else
    raise exception 'only a joint record or your pool record becomes yours this way'
      using errcode = '42501';
  end if;

  perform set_config('weming.reshape', 'on', true);
  delete from public.splash_placements where splash_id = p_splash;
  delete from public.joint_invitees where splash_id = p_splash and pool_id is null;
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
