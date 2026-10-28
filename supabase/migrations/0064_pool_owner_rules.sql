-- 0064: the owner's refusals (2026-10-28).
--
-- H52, the contract half of 0063, shipped once the app that stops offering
-- these is live (rule 5): the owner cannot leave ("Transfer ownership to
-- leave"), and a pool is deleted only by its owner as the one current
-- member left ("Remove everyone else or transfer ownership first").
--
-- Narrows two functions' checks; their signatures are unchanged and nothing
-- is dropped.
--
-- compat-expected-failures:
--   "leaving with remove > hands the one pool’s thread over; the other pool keeps the record as it was": the pool's creator leaves; the owner cannot leave now (H52)
--   "leaving with remove > hands each pool’s thread over separately when Ana leaves both": the pool's creator leaves; the owner cannot leave now (H52)
--   "leaving with remove > leaves a record no one else wrote on to today’s rule": the pool's creator leaves; the owner cannot leave now (H52)
--   "leaving with remove, my record written in that pool > hands its thread over, and the record stays mine and editable, its origin handed": the pool's creator leaves; the owner cannot leave now (H52)
--   "leaving with keep > hands nothing over: the record stays in the pool with every side": the pool's creator leaves; the owner cannot leave now (H52)
--   "deleting the record > deleting the pool afterwards returns Ben’s ripple to him; the placeholder goes with the pool": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "photos in the thread Ana handed over > still load for Ana up to when she left, and for Ben; not one written after": the pool's creator leaves; the owner cannot leave now (H52)
--   "what makes my record leave or end > deleting the pool returns members’ sides there to them too": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "deleting a pool (0015) > leaves nothing pool-side behind when the creator deletes it": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "deleting a pool (0015) > gives an author one post holding their three ripples from a joint shell, titled like it": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "deleting a pool (0015) > files an author’s post in a lane made from the pool lane when no link brings it in (H24)": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "deleting a pool (0015) > moves Just-mine splashes into a lane made from the pool lane, suffixed when the name is taken": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "deleting a pool (0015) > leaves a shared splash untouched but for where it came from": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "settling an owner (the 0063 backfill, per pool) > gives an owner who has left’s pool to the longest-standing current member": the owner leaves; the owner cannot leave now (H52)
--   "settling an owner (the 0063 backfill, per pool) > gives a pool with no owner to the longest-standing current member": the owner leaves; the owner cannot leave now (H52)
--   "settling an owner (the 0063 backfill, per pool) > tears down a pool with no current members, returning people’s words": the owner leaves; the owner cannot leave now (H52)
--   "a pool record shared to my other pools (0056) > stays in my other pools when I leave its origin": the pool's creator leaves; the owner cannot leave now (H52)
--   "leaving > hides a leaver’s placements when they remove them, and keeps them when they keep": the pool's creator leaves; the owner cannot leave now (H52)
--   "a deleted pool’s thread is closed, never deleted (0054) > keeps its replies and reactions, read by the owner and their writer only": the owner deletes a pool others are still in; delete is the one member left's now (H52)
--   "a deleted pool’s thread is closed, never deleted (0054) > cannot be reopened or closed by hand": the owner deletes a pool others are still in; delete is the one member left's now (H52)

create or replace function public.leave_pool(p_pool uuid, p_keep boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_member(p_pool);
begin
  if exists (select 1 from public.pools where id = p_pool and owner_id = uid) then
    raise exception 'The owner can''t leave. Make someone else the owner first.'
      using errcode = '42501';
  end if;
  perform public._leave_member(p_pool, uid, p_keep);
end;
$$;

create or replace function public.delete_pool(p_pool uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  owned_by uuid;
begin
  select owner_id into owned_by from public.pools where id = p_pool for update;
  if not found then
    raise exception 'no such pool' using errcode = 'P0002';
  end if;
  if owned_by is null or owned_by <> uid then
    raise exception 'Only the Pool''s owner can delete it.' using errcode = '42501';
  end if;
  perform public._require_member(p_pool);
  if exists (
    select 1 from public.pool_members
     where pool_id = p_pool and user_id <> uid and left_at is null
  ) then
    raise exception 'Remove everyone else or transfer ownership first.' using errcode = '42501';
  end if;
  perform public._teardown_pool(p_pool);
end;
$$;
