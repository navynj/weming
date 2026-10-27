-- 0041: where my ripples on a joint splash I can no longer read came from
-- (2026-10-26). Additive.
--
-- Leaving a pool (0015) keeps my ripples on its joint splashes, but the
-- splash and my own past membership are then unreadable to me, so Home
-- cannot tell which pool such a ripple belongs to. Until now it fell back
-- to the ripple's own category_id; H24 release 2 (0042) drops that column.
-- Home places these in that pool's "A pool you left" column instead, never
-- laneless or hidden (Yoonji's condition for 0042).
--
-- Only the pool's id, of a pool I was in; never its name or anything of
-- anyone else's. My ripples on a friend's record come from
-- my_thread_ripples (0035) and are not repeated here.
create function public.my_left_pool_ripples()
returns table (ripple_id uuid, pool_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, s.pool_id
    from public.ripples r
    join public.splashes s on s.id = r.splash_id
   where r.author_id = auth.uid()
     and r.thread_pool_id is null
     and s.owner_id is null
     and s.pool_id is not null
     and not public.splash_in_my_pools(s.id);
$$;

revoke execute on function public.my_left_pool_ripples() from public, anon;
grant execute on function public.my_left_pool_ripples() to authenticated;
