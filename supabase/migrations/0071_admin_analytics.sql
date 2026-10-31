-- 0071: opens, notification taps and invite opens, for an admin dashboard (H71, 2026-10-30).
--
-- Asked in the session: an admin-only dashboard of how pools are used during
-- user testing, pools the admin is not in included. "Metadata only. The
-- dashboard must never show or query post content ... Only counts, types,
-- timestamps, and IDs." And: "New event logging must not store any content
-- either. Event rows hold only IDs, type, source, and timestamps."
--
-- So:
--   - three event tables, written by the app from now on: app_opens (an app
--     open, and where it came from), invite_opens (a signed-in person opened
--     a pool's invite link; first time only) and invite_link_opens (every
--     visit to a link, signed out included: the invite and a time, nothing
--     about the visitor);
--   - two columns on notifications: delivered_at (a push service accepted
--     it; pushed_at only means the dispatcher claimed it) and clicked_at;
--   - an `analytics` schema of views over the record tables that select no
--     content column: no title, description, note, body, emoji or media
--     path. A photo is a boolean. The schema is not exposed to the API and
--     no role but its owner reads it;
--   - admin_* functions, the dashboard's only door, executable by the
--     service role alone; the app calls them after its own admin check.
--
-- Last seen is not a column on profiles: pool companions read profiles. It
-- is the newest app_opens row, read only here.
--
-- Additive: tables, columns, a schema, views and functions. Nothing changes
-- for the app in production; its pushes leave delivered_at null until the
-- new dispatcher ships.

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.app_opens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  source text not null,
  notification_id uuid references public.notifications (id) on delete set null,
  platform text not null,
  constraint app_opens_source check (source in ('notification', 'direct')),
  constraint app_opens_platform check (
    platform in ('ios-pwa', 'ios-web', 'android-pwa', 'android-web', 'desktop-pwa', 'desktop-web')
  ),
  constraint app_opens_notification check (notification_id is null or source = 'notification')
);

comment on table public.app_opens is
  'An app open (H71): a load, or a return to the front after 30+ minutes away. Written through log_app_open; read only by analytics.';

create index app_opens_user_started on public.app_opens (user_id, started_at);

create table public.invite_opens (
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

comment on table public.invite_opens is
  'A signed-in person first opened an invite link to this pool (H71). Written through record_invite_open.';

-- No visitor column, on purpose: a count per link, signed out included.
create table public.invite_link_opens (
  id bigint generated always as identity primary key,
  invite_id uuid not null references public.pool_invites (id) on delete cascade,
  opened_at timestamptz not null default now()
);

comment on table public.invite_link_opens is
  'One visit to an invite link (H71), signed in or not. Holds the invite and a time, nothing about the visitor.';

create index invite_link_opens_invite on public.invite_link_opens (invite_id);

-- Read by analytics alone: RLS on, no policy, and no grant to the API roles.
alter table public.app_opens enable row level security;
alter table public.invite_opens enable row level security;
alter table public.invite_link_opens enable row level security;
revoke all on public.app_opens, public.invite_opens, public.invite_link_opens
  from anon, authenticated;

alter table public.notifications
  add column delivered_at timestamptz,
  add column clicked_at timestamptz;

comment on column public.notifications.delivered_at is
  'When a push service last accepted this notification for at least one of the recipient''s browsers (H71). Null: never pushed.';
comment on column public.notifications.clicked_at is
  'When its recipient first opened the app by tapping its push (H71).';

-- When the dashboard's opens and taps start: this migration's moment.
create schema analytics;
revoke all on schema analytics from public, anon, authenticated;

create table analytics.tracking_start (
  only_row boolean primary key default true check (only_row),
  started_at timestamptz not null default now()
);
insert into analytics.tracking_start default values;

-- ---------------------------------------------------------------------------
-- writes
-- ---------------------------------------------------------------------------

-- An open by me. A notification id that is not mine is dropped, and the
-- open counts as direct; one that is mine is marked tapped, once.
create function public.log_app_open(
  p_source text,
  p_platform text,
  p_notification uuid default null
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
  insert into public.app_opens (user_id, source, notification_id, platform)
  values (
    uid,
    case when nid is not null then 'notification' else 'direct' end,
    nid,
    p_platform
  );
end;
$$;

-- I opened a live invite link to a pool I am not in: the first time only.
create function public.record_invite_open(p_token text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.invite_opens (pool_id, user_id)
  select i.pool_id, auth.uid()
    from public.pool_invites i
   where auth.uid() is not null
     and i.token = p_token
     and i.revoked_at is null
     and i.expires_at > now()
     and not exists (
       select 1 from public.pool_members m
        where m.pool_id = i.pool_id and m.user_id = auth.uid() and m.left_at is null
     )
  on conflict do nothing;
$$;

-- A visit to a link, from the proxy with the service role. An unknown token
-- counts nothing.
create function public.count_invite_link_open(p_token text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.invite_link_opens (invite_id)
  select i.id from public.pool_invites i where i.token = p_token;
$$;

revoke execute on function public.log_app_open(text, text, uuid) from public, anon;
revoke execute on function public.record_invite_open(text) from public, anon;
revoke execute on function public.count_invite_link_open(text) from public, anon, authenticated;
grant execute on function public.count_invite_link_open(text) to service_role;

-- ---------------------------------------------------------------------------
-- views: no content column is selected anywhere below
-- ---------------------------------------------------------------------------

-- Locked ripples, as private.locked_ripples (0068) reads them: never pool activity.
create view analytics.locked_ripples as
  select a.ripple_id from public.ripple_audience a where a.target_type = 'lock'
  union
  select r.id from public.ripples r
    join public.ripple_audience a on a.ripple_id = r.parent_ripple_id and a.target_type = 'lock';

-- Each pool a record shows in, and since when: a joint record's own pool,
-- and every pool it is placed in and shared to.
create view analytics.splash_pools as
  select s.id as splash_id, s.pool_id, s.created_at as at
    from public.splashes s
   where s.owner_id is null and s.pool_id is not null
  union all
  select p.splash_id, p.pool_id, greatest(s.created_at, p.created_at)
    from public.splash_placements p
    join public.splashes s on s.id = p.splash_id
   where p.shared;

-- Each pool a ripple shows in: its thread's, or its record's.
create view analytics.ripple_pools as
  select r.id as ripple_id, coalesce(r.thread_pool_id, sp.pool_id) as pool_id
    from public.ripples r
    left join analytics.splash_pools sp
      on sp.splash_id = r.splash_id and r.thread_pool_id is null
   where (r.thread_pool_id is not null or sp.pool_id is not null)
     and r.id not in (select ripple_id from analytics.locked_ripples);

-- Every write in a pool: who, what kind, when, on which record, and whether
-- it carries a photo (a splash: any of its maker's ripples does).
create view analytics.pool_events as
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
  union all
  select coalesce(x.thread_pool_id, rp.pool_id), x.author_id, 'reply', x.created_at, r.splash_id, false
    from public.ripple_replies x
    join public.ripples r on r.id = x.ripple_id
    left join analytics.ripple_pools rp on rp.ripple_id = x.ripple_id and x.thread_pool_id is null
   where x.thread_pool_id is not null or rp.pool_id is not null
  union all
  select coalesce(x.thread_pool_id, rp.pool_id), x.user_id, 'reaction', x.created_at, r.splash_id, false
    from public.ripple_reactions x
    join public.ripples r on r.id = x.ripple_id
    left join analytics.ripple_pools rp on rp.ripple_id = x.ripple_id and x.thread_pool_id is null
   where x.thread_pool_id is not null or rp.pool_id is not null;

-- Everyone a pool reached: its members, current or not, and whoever opened
-- an invite to it signed in. A member who opened no link was invited when
-- they joined (the backfill's rule).
create view analytics.pool_people as
  with people as (
    select pool_id, user_id from public.pool_members
    union
    select pool_id, user_id from public.invite_opens
  )
  select p.pool_id,
         p.user_id,
         pr.display_name,
         least(io.opened_at, m.joined_at) as invited_at,
         m.joined_at,
         m.left_at,
         coalesce(pl.owner_id = p.user_id, false) as is_owner
    from people p
    join public.pools pl on pl.id = p.pool_id
    join public.profiles pr on pr.id = p.user_id
    left join public.pool_members m on m.pool_id = p.pool_id and m.user_id = p.user_id
    left join public.invite_opens io on io.pool_id = p.pool_id and io.user_id = p.user_id;

-- A delivered push and what followed: a tap, or a direct open by its
-- recipient within 30 minutes (influenced), never stored.
create view analytics.notification_outcomes as
  select n.id as notification_id,
         n.recipient_id as user_id,
         n.pool_id,
         n.type,
         n.delivered_at,
         n.clicked_at,
         inf.started_at as influenced_open_at
    from public.notifications n
    left join lateral (
      select o.started_at
        from public.app_opens o
       where n.clicked_at is null
         and o.user_id = n.recipient_id
         and o.source = 'direct'
         and o.started_at > n.delivered_at
         and o.started_at <= n.delivered_at + interval '30 minutes'
       order by o.started_at
       limit 1
    ) inf on true
   where n.delivered_at is not null;

-- Each open, and how it came: tapped, influenced (a direct open within 30
-- minutes after a push its person did not tap), or direct.
create view analytics.app_open_kinds as
  select o.id,
         o.user_id,
         o.started_at,
         o.platform,
         case
           when o.source = 'notification' then 'notification'
           when exists (
             select 1 from public.notifications n
              where n.recipient_id = o.user_id
                and n.delivered_at is not null
                and n.clicked_at is null
                and o.started_at > n.delivered_at
                and o.started_at <= n.delivered_at + interval '30 minutes'
           ) then 'influenced'
           else 'direct'
         end as kind,
         n.pool_id as notification_pool_id
    from public.app_opens o
    left join public.notifications n on n.id = o.notification_id;

-- Visits to each pool's links, signed out included.
create view analytics.invite_link_visits as
  select i.pool_id, v.opened_at
    from public.invite_link_opens v
    join public.pool_invites i on i.id = v.invite_id;

revoke all on all tables in schema analytics from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- the dashboard's door: the service role only
-- ---------------------------------------------------------------------------

create function public.admin_tracking_start()
returns timestamptz
language sql stable security definer set search_path = ''
as $$ select started_at from analytics.tracking_start; $$;

create function public.admin_pools()
returns table (pool_id uuid, name text, created_at timestamptz, owner_id uuid)
language sql stable security definer set search_path = ''
as $$ select p.id, p.name, p.created_at, p.owner_id from public.pools p; $$;

create function public.admin_pool_people(p_pool uuid default null)
returns table (
  pool_id uuid, user_id uuid, display_name text, invited_at timestamptz,
  joined_at timestamptz, left_at timestamptz, is_owner boolean
)
language sql stable security definer set search_path = ''
as $$ select pool_id, user_id, display_name, invited_at, joined_at, left_at, is_owner
        from analytics.pool_people where p_pool is null or pool_id = p_pool; $$;

create function public.admin_pool_events(p_pool uuid default null)
returns table (
  pool_id uuid, user_id uuid, kind text, at timestamptz, splash_id uuid, has_media boolean
)
language sql stable security definer set search_path = ''
as $$ select pool_id, user_id, kind, at, splash_id, has_media from analytics.pool_events where p_pool is null or pool_id = p_pool; $$;

create function public.admin_app_opens(p_users uuid[] default null)
returns table (
  id uuid, user_id uuid, started_at timestamptz, platform text, kind text,
  notification_pool_id uuid
)
language sql stable security definer set search_path = ''
as $$ select id, user_id, started_at, platform, kind, notification_pool_id
        from analytics.app_open_kinds where p_users is null or user_id = any (p_users); $$;

create function public.admin_notifications()
returns table (
  notification_id uuid, user_id uuid, pool_id uuid, type text, delivered_at timestamptz,
  clicked_at timestamptz, influenced_open_at timestamptz
)
language sql stable security definer set search_path = ''
as $$ select notification_id, user_id, pool_id, type, delivered_at, clicked_at, influenced_open_at
        from analytics.notification_outcomes; $$;

create function public.admin_invite_link_visits()
returns table (pool_id uuid, opened_at timestamptz)
language sql stable security definer set search_path = ''
as $$ select pool_id, opened_at from analytics.invite_link_visits; $$;

revoke execute on function public.admin_tracking_start() from public, anon, authenticated;
revoke execute on function public.admin_pools() from public, anon, authenticated;
revoke execute on function public.admin_pool_people(uuid) from public, anon, authenticated;
revoke execute on function public.admin_pool_events(uuid) from public, anon, authenticated;
revoke execute on function public.admin_app_opens(uuid[]) from public, anon, authenticated;
revoke execute on function public.admin_notifications() from public, anon, authenticated;
revoke execute on function public.admin_invite_link_visits() from public, anon, authenticated;
grant execute on function public.admin_tracking_start() to service_role;
grant execute on function public.admin_pools() to service_role;
grant execute on function public.admin_pool_people(uuid) to service_role;
grant execute on function public.admin_pool_events(uuid) to service_role;
grant execute on function public.admin_app_opens(uuid[]) to service_role;
grant execute on function public.admin_notifications() to service_role;
grant execute on function public.admin_invite_link_visits() to service_role;
