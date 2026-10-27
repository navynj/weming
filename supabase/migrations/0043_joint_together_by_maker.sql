-- 0043: a joint record's maker sets who it is with, Everyone included
-- (2026-10-27). Additive.
--
-- Until now a joint record's With only added people (0033): add_joint_invitees
-- inserts, and hold_joint_invite_all refuses turning Everyone off. Yoonji, in
-- the session: with Everyone on, the invitees must be editable again, and only
-- by the record's maker; anyone may still add.
--
-- On a joint record the invitees are its slots, not a write gate: every
-- current member of the pool may write (splash_writable). So taking someone
-- off drops their "Add your side" slot and nothing else: what they wrote
-- stays, and their face stays among the record's writers (Yoonji: no lock).
--
-- The maker's own invitee row stays whatever the set says.
create function public.set_joint_together(p_splash uuid, p_users uuid[], p_everyone boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  pid uuid := public._joint_pool(p_splash);
  maker uuid;
  picks uuid[] := coalesce(p_users, '{}'::uuid[]);
begin
  if pid is null then
    raise exception 'only a joint record is together' using errcode = '42501';
  end if;
  perform public._require_member(pid);
  select created_by into maker from public.splashes where id = p_splash;
  if maker is distinct from uid then
    raise exception 'Only its maker can change who it is with.' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(picks) u
     where not exists (
       select 1 from public.pool_members
        where pool_id = pid and user_id = u and left_at is null
     )
  ) then
    raise exception 'Only members of this Pool can be together here.' using errcode = '42501';
  end if;

  delete from public.joint_invitees
   where splash_id = p_splash
     and pool_id is null
     and user_id <> maker
     and user_id <> all (picks);
  insert into public.joint_invitees (splash_id, user_id)
  select p_splash, u from unnest(picks) u
  on conflict do nothing;

  -- hold_joint_invite_all keeps Everyone on against any other write; the
  -- maker's set is the one path that may turn it off (0022's reshape flag).
  perform set_config('weming.reshape', 'on', true);
  update public.splashes
     set joint_invite_all = coalesce(p_everyone, false)
   where id = p_splash;
  perform set_config('weming.reshape', 'off', true);
end;
$$;

revoke execute on function public.set_joint_together(uuid, uuid[], boolean) from public, anon;
grant execute on function public.set_joint_together(uuid, uuid[], boolean) to authenticated;
