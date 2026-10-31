-- 0072: a pool's activity starts when a record enters it (H71, 2026-10-31).
--
-- Found reading the pool page's chart: a Home record shared into a pool
-- brought every ripple written on it before, so its owner's ripples there
-- counted writes from August in a pool made in October. They inflated the
-- member table's totals and last write, and fell before the chart's first
-- day. A record's splash event already counts from its entry into the pool
-- (0071's splash_pools.at); now its ripples, and the replies and reactions
-- on them, count only from then too. A ripple written into a pool's thread
-- (ripples.thread_pool_id) was written there and always counts.
--
-- Additive: ripple_pools gains a column at its end, pool_events keeps its
-- columns and changes which rows it returns. Both views are read only by
-- the admin_* functions, whose signatures do not change.

create or replace view analytics.ripple_pools as
  select r.id as ripple_id,
         coalesce(r.thread_pool_id, sp.pool_id) as pool_id,
         -- When the record entered this pool; null for a thread ripple, in it from the start.
         case when r.thread_pool_id is null then sp.at end as entered_at
    from public.ripples r
    left join analytics.splash_pools sp
      on sp.splash_id = r.splash_id and r.thread_pool_id is null
   where (r.thread_pool_id is not null or sp.pool_id is not null)
     and r.id not in (select ripple_id from analytics.locked_ripples);

create or replace view analytics.pool_events as
  select sp.pool_id,
         coalesce(s.created_by, s.owner_id) as user_id,
         'splash'::text as kind,
         sp.at,
         s.id as splash_id,
         exists (
           select 1 from public.ripples r
            where r.splash_id = s.id
              and r.author_id = coalesce(s.created_by, s.owner_id)
              and cardinality(r.media) > 0
         ) as has_media
    from analytics.splash_pools sp
    join public.splashes s on s.id = sp.splash_id
   where coalesce(s.created_by, s.owner_id) is not null
  union all
  select rp.pool_id, r.author_id, 'ripple', r.created_at, r.splash_id, cardinality(r.media) > 0
    from analytics.ripple_pools rp
    join public.ripples r on r.id = rp.ripple_id
   where r.author_id is not null
     and (rp.entered_at is null or r.created_at >= rp.entered_at)
  union all
  select coalesce(x.thread_pool_id, rp.pool_id), x.author_id, 'reply', x.created_at, r.splash_id, false
    from public.ripple_replies x
    join public.ripples r on r.id = x.ripple_id
    left join analytics.ripple_pools rp on rp.ripple_id = x.ripple_id and x.thread_pool_id is null
   where x.thread_pool_id is not null
      or (rp.pool_id is not null and (rp.entered_at is null or x.created_at >= rp.entered_at))
  union all
  select coalesce(x.thread_pool_id, rp.pool_id), x.user_id, 'reaction', x.created_at, r.splash_id, false
    from public.ripple_reactions x
    join public.ripples r on r.id = x.ripple_id
    left join analytics.ripple_pools rp on rp.ripple_id = x.ripple_id and x.thread_pool_id is null
   where x.thread_pool_id is not null
      or (rp.pool_id is not null and (rp.entered_at is null or x.created_at >= rp.entered_at));

-- create or replace keeps the views' grants; restated so the schema's line reads in one place.
revoke all on all tables in schema analytics from public, anon, authenticated;
