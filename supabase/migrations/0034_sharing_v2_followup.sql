-- 0034: Sharing model v2, the expand's follow-up (2026-10-26).
--
-- 0033 reached production as it stood at the push. Two changes made to it
-- afterwards in the session never did, because a pushed migration is not
-- applied again; the 0033 file is put back to what production ran, and
-- they land here instead (forward only):
--
--   joint_invitees.pool_id  one table for both invitee uses (Yoonji, in the
--                    session): null for a joint record's invitees, set for
--                    invitees on my record in one pool it is shared to
--                    (per-pool invitees, 0036). A per-pool row hangs off its
--                    placement. Nothing writes such a row yet.
--   splash_to_mine   "Make it mine" and Move to Home are on Home only, and
--                    set the record's lane and Audience anew (Yoonji, in the
--                    session): it keeps no placement; the app shares it where
--                    Audience says.
--   joint_together   reads a joint record's own rows alone.
--
-- Additive: a nullable column, a foreign key, a unique index, two functions
-- replaced. Nothing is dropped. Left, each needing Yoonji's quoted
-- approval: the table's key moving from (splash_id, user_id) to a surrogate
-- id with one partial key per use, which per-pool invitees need (0036); and
-- splash_to_pool_record, unused since this switch, on the contract's list
-- (0035). Written to apply cleanly over the 0033 draft a local database may
-- hold too.

-- ---------------------------------------------------------------------------
-- joint_invitees: room for a pool
-- ---------------------------------------------------------------------------

alter table public.joint_invitees
  add column if not exists pool_id uuid references public.pools (id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'joint_invitees_placement_fkey'
  ) then
    alter table public.joint_invitees
      add constraint joint_invitees_placement_fkey
      foreign key (splash_id, pool_id)
      references public.splash_placements (splash_id, pool_id) on delete cascade;
  end if;
end;
$$;

create unique index if not exists joint_invitees_pool_key
  on public.joint_invitees (splash_id, pool_id, user_id) where pool_id is not null;

comment on table public.joint_invitees is
  'Who a record is together with, picked one by one (0033, 0034). pool_id null: a joint record''s invitees, beside Everyone (splashes.joint_invite_all). pool_id set: invitees on my record in one pool it is shared to (0036). Written by functions only.';
comment on column public.joint_invitees.pool_id is
  'Null for a joint record (its pool is its own); set for per-pool invitees on my record, tied to that placement (0036).';

-- ---------------------------------------------------------------------------
-- who a joint record is together with: its own rows alone
-- ---------------------------------------------------------------------------

create or replace function public.joint_together(p_splashes uuid[])
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
          where i.splash_id = s.id and i.pool_id is null and i.user_id = m.user_id
       )
     );
$$;

-- ---------------------------------------------------------------------------
-- Make it mine, from Home: lane and Audience set anew
-- ---------------------------------------------------------------------------

-- A joint record or my pool record becomes my Home record, in a lane of
-- mine ("Make it mine", "Move to Home…", from Home only). It keeps no
-- placement; the app shares it where its new Audience says (placed here
-- only when p_place_on names a pool lane).
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
