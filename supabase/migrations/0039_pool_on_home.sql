-- 0039: a pool's records kept off my Home (2026-10-27).
--
-- Yoonji, in the session: a member may keep what was written in one pool
-- off their own Home — their pool records there, joint records there, their
-- side on someone's record there. Display only, and only for them: nothing
-- moves, nobody else's view changes, and a Home record of theirs shared to
-- that pool stays on their Home (it was written there). On by default.
--
-- Members cannot write their membership rows directly; set_pool_on_home
-- changes the caller's own row alone.
--
-- Additive: one column with a default, one function.

alter table public.pool_members
  add column on_home boolean not null default true;

comment on column public.pool_members.on_home is
  'Whether what this member wrote in this pool shows on their own Home (0039). Display only; on by default.';

create function public.set_pool_on_home(p_pool uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_member(p_pool);
begin
  update public.pool_members
     set on_home = coalesce(p_on, true)
   where pool_id = p_pool and user_id = uid;
end;
$$;

revoke execute on function public.set_pool_on_home(uuid, boolean) from public, anon;
grant execute on function public.set_pool_on_home(uuid, boolean) to authenticated;
