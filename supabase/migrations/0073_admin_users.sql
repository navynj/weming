-- 0073: the admin dashboard's per-user view (H71, 2026-10-31).
--
-- Asked in the session: a users list and a user page, metadata only. The
-- answers given, quoted:
--   - "add app_opens.notification_permission and log it from now on";
--   - "exclude the welcome splash from record counts, but don't rely on the
--     photo path at query time ... add a boolean column (e.g.
--     splashes.is_welcome, default false), backfill it once using the
--     built-in photo path, and have the welcome-splash creation code set it
--     directly from now on. Ripples, replies and reactions that the user
--     writes on their welcome splash still count as their writes." The
--     welcome block planted under it is not written by the user, so it is
--     flagged the same way (ripples.is_welcome);
--   - "Locked ripples: count them in the per-user view ... with only time
--     and kind ... Keep them excluded from pool views, since those measure
--     what other members can see."
--
-- Additive: columns, one backfill of two new columns, views (pool_events
-- gains a column at its end), functions. log_app_open stays for the app in
-- production; record_app_open is the new app's, and log_app_open goes in a
-- later release once nothing calls it.

-- ---------------------------------------------------------------------------
-- the welcome splash, flagged
-- ---------------------------------------------------------------------------

alter table public.splashes add column is_welcome boolean not null default false;
alter table public.ripples add column is_welcome boolean not null default false;

comment on column public.splashes.is_welcome is
  'The welcome splash planted for a new account (H58), set by the app when it plants it (H71). Left out of the dashboard''s record counts.';
comment on column public.ripples.is_welcome is
  'The block planted under the welcome splash (H58, H71): not written by its author, so not counted as their write.';

-- Once, by the built-in photo the welcome block carries (features/auth/welcome-splash.ts).
update public.ripples set is_welcome = true where 'app:welcome/shell.png' = any (media);
update public.splashes s set is_welcome = true
 where exists (select 1 from public.ripples r where r.splash_id = s.id and r.is_welcome);

-- ---------------------------------------------------------------------------
-- notification permission, logged with each open
-- ---------------------------------------------------------------------------

alter table public.app_opens
  add column notification_permission text,
  add constraint app_opens_notification_permission check (
    notification_permission in ('granted', 'denied', 'default', 'unsupported')
  );

comment on column public.app_opens.notification_permission is
  'The browser''s Notification.permission at the open (H71). Null: logged before 0073. Says nothing of OS-level settings.';

-- log_app_open (0071) with the permission. A second name, not a second
-- signature: an overload with one more defaulted argument would make the
-- production app's calls ambiguous.
create function public.record_app_open(
  p_source text,
  p_platform text,
  p_notification uuid default null,
  p_permission text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  nid uuid;
begin
  if uid is null then
    return;
  end if;
  if p_source = 'notification' and p_notification is not null then
    update public.notifications
       set clicked_at = coalesce(clicked_at, now())
     where id = p_notification and recipient_id = uid
    returning id into nid;
  end if;
  insert into public.app_opens (user_id, source, notification_id, platform, notification_permission)
  values (
    uid,
    case when nid is not null then 'notification' else 'direct' end,
    nid,
    p_platform,
    p_permission
  );
end;
$$;

revoke execute on function public.record_app_open(text, text, uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- views
-- ---------------------------------------------------------------------------

-- pool_events (0072) with an item key at its end: the thing written, so a
-- record shown in several places counts once in the "unique" line. A
-- reaction is its ripple, its person and its time; its emoji is never read.
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
         ) as has_media,
         s.id::text as item_key
    from analytics.splash_pools sp
    join public.splashes s on s.id = sp.splash_id
   where coalesce(s.created_by, s.owner_id) is not null
  union all
  select rp.pool_id, r.author_id, 'ripple', r.created_at, r.splash_id, cardinality(r.media) > 0,
         r.id::text
    from analytics.ripple_pools rp
    join public.ripples r on r.id = rp.ripple_id
   where r.author_id is not null
     and (rp.entered_at is null or r.created_at >= rp.entered_at)
  union all
  select coalesce(x.thread_pool_id, rp.pool_id), x.author_id, 'reply', x.created_at, r.splash_id, false,
         x.id::text
    from public.ripple_replies x
    join public.ripples r on r.id = x.ripple_id
    left join analytics.ripple_pools rp on rp.ripple_id = x.ripple_id and x.thread_pool_id is null
   where x.thread_pool_id is not null
      or (rp.pool_id is not null and (rp.entered_at is null or x.created_at >= rp.entered_at))
  union all
  select coalesce(x.thread_pool_id, rp.pool_id), x.user_id, 'reaction', x.created_at, r.splash_id, false,
         x.ripple_id::text || ':' || x.user_id::text || ':' || x.created_at::text
    from public.ripple_reactions x
    join public.ripples r on r.id = x.ripple_id
    left join analytics.ripple_pools rp on rp.ripple_id = x.ripple_id and x.thread_pool_id is null
   where x.thread_pool_id is not null
      or (rp.pool_id is not null and (rp.entered_at is null or x.created_at >= rp.entered_at));

-- A record of my own on Home: mine, not a pool's (joint) and not one that
-- lives on a pool lane alone (own_pool_id).
create view analytics.home_splashes as
  select s.id as splash_id, s.owner_id as user_id, s.created_at, s.is_welcome
    from public.splashes s
   where s.owner_id is not null and s.own_pool_id is null;

-- Every write by a person, by place: Home (pool_id null) or a pool. Home
-- counts locked ripples, as time and kind: this is the person's own
-- writing. The pools are pool_events, which leave locked ripples out:
-- they measure what other members can see. The welcome splash and its
-- planted block are nobody's write; what they write on it is.
create view analytics.user_events as
  select h.user_id, null::uuid as pool_id, 'splash'::text as kind, h.created_at as at,
         h.splash_id,
         exists (
           select 1 from public.ripples r
            where r.splash_id = h.splash_id and r.author_id = h.user_id
              and cardinality(r.media) > 0 and not r.is_welcome
         ) as has_media,
         h.splash_id::text as item_key
    from analytics.home_splashes h
   where not h.is_welcome
  union all
  -- On my Home records (in no pool's thread), and blocks not under a record.
  select r.author_id, null, 'ripple', r.created_at, r.splash_id, cardinality(r.media) > 0, r.id::text
    from public.ripples r
   where r.author_id is not null
     and not r.is_welcome
     and r.thread_pool_id is null
     and (r.splash_id is null or r.splash_id in (select splash_id from analytics.home_splashes))
  union all
  select x.author_id, null, 'reply', x.created_at, r.splash_id, false, x.id::text
    from public.ripple_replies x
    join public.ripples r on r.id = x.ripple_id
   where x.thread_pool_id is null
     and r.thread_pool_id is null
     and (r.splash_id is null or r.splash_id in (select splash_id from analytics.home_splashes))
  union all
  select x.user_id, null, 'reaction', x.created_at, r.splash_id, false,
         x.ripple_id::text || ':' || x.user_id::text || ':' || x.created_at::text
    from public.ripple_reactions x
    join public.ripples r on r.id = x.ripple_id
   where x.thread_pool_id is null
     and r.thread_pool_id is null
     and (r.splash_id is null or r.splash_id in (select splash_id from analytics.home_splashes))
  union all
  select e.user_id, e.pool_id, e.kind, e.at, e.splash_id, e.has_media, e.item_key
    from analytics.pool_events e;

-- Every record a person made, but the welcome splash: whether it is on
-- their Home, and how many pools show it.
create view analytics.user_records as
  select coalesce(s.created_by, s.owner_id) as user_id,
         s.id as splash_id,
         s.created_at,
         (s.owner_id is not null and s.own_pool_id is null) as is_home,
         (select count(distinct sp.pool_id) from analytics.splash_pools sp where sp.splash_id = s.id)::int
           as pool_count,
         exists (
           select 1 from public.ripples r
            where r.splash_id = s.id and r.author_id = coalesce(s.created_by, s.owner_id)
              and cardinality(r.media) > 0 and not r.is_welcome
         ) as has_media
    from public.splashes s
   where coalesce(s.created_by, s.owner_id) is not null
     and not s.is_welcome;

-- Each browser subscription's owner and when it was last used: no endpoint, no keys.
create view analytics.push_status as
  select ps.user_id, count(*)::int as subscriptions, max(ps.last_used_at) as last_used_at
    from public.push_subscriptions ps
   group by ps.user_id;

-- Each person's latest browser permission, as their newest open logged it.
create view analytics.open_permissions as
  select distinct on (o.user_id) o.user_id, o.notification_permission as permission, o.started_at as at
    from public.app_opens o
   where o.notification_permission is not null
   order by o.user_id, o.started_at desc;

revoke all on all tables in schema analytics from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- the door: the service role only
-- ---------------------------------------------------------------------------

create function public.admin_users()
returns table (user_id uuid, display_name text, signed_up_at timestamptz)
language sql stable security definer set search_path = ''
as $$ select p.id, p.display_name, p.created_at from public.profiles p; $$;

create function public.admin_user_events(p_user uuid default null)
returns table (
  user_id uuid, pool_id uuid, kind text, at timestamptz, splash_id uuid, has_media boolean,
  item_key text
)
language sql stable security definer set search_path = ''
as $$
  select user_id, pool_id, kind, at, splash_id, has_media, item_key
    from analytics.user_events where p_user is null or user_id = p_user;
$$;

create function public.admin_user_records(p_user uuid default null)
returns table (
  user_id uuid, splash_id uuid, created_at timestamptz, is_home boolean, pool_count integer,
  has_media boolean
)
language sql stable security definer set search_path = ''
as $$
  select user_id, splash_id, created_at, is_home, pool_count, has_media
    from analytics.user_records where p_user is null or user_id = p_user;
$$;

create function public.admin_push_status()
returns table (user_id uuid, subscriptions integer, last_used_at timestamptz)
language sql stable security definer set search_path = ''
as $$ select user_id, subscriptions, last_used_at from analytics.push_status; $$;

create function public.admin_open_permissions()
returns table (user_id uuid, permission text, at timestamptz)
language sql stable security definer set search_path = ''
as $$ select user_id, permission, at from analytics.open_permissions; $$;

revoke execute on function public.admin_users() from public, anon, authenticated;
revoke execute on function public.admin_user_events(uuid) from public, anon, authenticated;
revoke execute on function public.admin_user_records(uuid) from public, anon, authenticated;
revoke execute on function public.admin_push_status() from public, anon, authenticated;
revoke execute on function public.admin_open_permissions() from public, anon, authenticated;
grant execute on function public.admin_users() to service_role;
grant execute on function public.admin_user_events(uuid) to service_role;
grant execute on function public.admin_user_records(uuid) to service_role;
grant execute on function public.admin_push_status() to service_role;
grant execute on function public.admin_open_permissions() to service_role;
