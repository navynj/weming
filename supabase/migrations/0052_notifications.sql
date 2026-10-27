-- 0052: notifications, per pool (H32, 2026-10-27).
--
-- Additive only: five tables, their policies, functions and triggers. No
-- existing object changes, so the app in production keeps working against
-- it; its writes start leaving notification rows, which nothing reads until
-- the new app ships.
--
-- The database writes every notification (triggers below), so each path that
-- makes a record visible in a pool, invites, replies or reacts is covered,
-- whichever function or policy it went through. The app only reads them and
-- pushes the unsent ones after its action responds (lib/notifications).
--
-- A trigger here never fails the write it follows: a notification is worth
-- less than the record, so an error is raised as a warning and swallowed.

-- ---------------------------------------------------------------------------
-- settings: the pool's defaults, each member's own, and the global two
-- ---------------------------------------------------------------------------

create table public.pool_notification_defaults (
  pool_id uuid not null references public.pools (id) on delete cascade,
  type text not null,
  value text not null,
  primary key (pool_id, type),
  constraint pool_notification_defaults_value check (
    (type = 'new_post' and value in ('all', 'invited', 'off'))
    or (type in ('reply', 'reaction') and value in ('on', 'off'))
  )
);

comment on table public.pool_notification_defaults is
  'The pool creator''s default per notification type (H32). No row: the app default.';

create table public.member_notification_prefs (
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  value text not null,
  primary key (pool_id, user_id, type),
  constraint member_notification_prefs_value check (
    (type = 'new_post' and value in ('all', 'invited', 'off'))
    or (type in ('reply', 'reaction') and value in ('on', 'off'))
  )
);

comment on table public.member_notification_prefs is
  'A member''s own value per notification type in a pool (H32). No row: Use pool default.';

-- Not columns on profiles: pool companions read profiles, and whether
-- someone has paused is theirs.
create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  paused boolean not null default false,
  show_titles boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.notification_settings is
  'Pause all notifications, and Show titles in notifications (H32). No row: neither.';

-- Is the pool's creator me (pools.owner_id; null once they deleted their account).
create function public.pool_creator_is_me(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.pools p where p.id = pid and p.owner_id = auth.uid());
$$;

alter table public.pool_notification_defaults enable row level security;
alter table public.member_notification_prefs enable row level security;
alter table public.notification_settings enable row level security;

create policy "pool defaults are read by current members"
  on public.pool_notification_defaults for select
  using (public.is_current_member(pool_id));

create policy "pool defaults are set by the pool's creator"
  on public.pool_notification_defaults for insert
  with check (public.is_current_member(pool_id) and public.pool_creator_is_me(pool_id));

create policy "pool defaults are changed by the pool's creator"
  on public.pool_notification_defaults for update
  using (public.is_current_member(pool_id) and public.pool_creator_is_me(pool_id))
  with check (public.is_current_member(pool_id) and public.pool_creator_is_me(pool_id));

create policy "pool defaults are cleared by the pool's creator"
  on public.pool_notification_defaults for delete
  using (public.is_current_member(pool_id) and public.pool_creator_is_me(pool_id));

create policy "my notification prefs are mine to read"
  on public.member_notification_prefs for select
  using (user_id = auth.uid());

create policy "my notification prefs are set in a pool I am in"
  on public.member_notification_prefs for insert
  with check (user_id = auth.uid() and public.is_current_member(pool_id));

create policy "my notification prefs are changed in a pool I am in"
  on public.member_notification_prefs for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_current_member(pool_id));

create policy "my notification prefs are cleared by me"
  on public.member_notification_prefs for delete
  using (user_id = auth.uid());

create policy "my notification settings are mine"
  on public.notification_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications and push subscriptions
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  -- The one pool it is about: its settings decided it, and the text names it.
  pool_id uuid not null references public.pools (id) on delete cascade,
  splash_id uuid not null references public.splashes (id) on delete cascade,
  ripple_id uuid references public.ripples (id) on delete cascade,
  reply_id uuid references public.ripple_replies (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  -- A new post I am picked in (With) or that has Everyone on: an invite.
  invited boolean not null default false,
  -- Reactions folded into this one within its hour.
  count integer not null default 1,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Handled by the dispatcher: pushed, or never to be (no subscription, or
  -- found too late). Cleared when an invite upgrades a new post.
  pushed_at timestamptz,
  constraint notifications_type check (type in ('new_post', 'reply', 'reaction')),
  constraint notifications_shape check (
    (type = 'new_post') = (ripple_id is null)
    and (type = 'reply') = (reply_id is not null)
    and (not invited or type = 'new_post')
    and count >= 1
  )
);

-- One new post per person and record: an invite later upgrades it.
create unique index notifications_one_new_post
  on public.notifications (recipient_id, splash_id) where type = 'new_post';
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unpushed_idx on public.notifications (actor_id) where pushed_at is null;
create index notifications_reaction_fold_idx
  on public.notifications (recipient_id, pool_id, created_at desc) where type = 'reaction';
create index notifications_reply_idx on public.notifications (reply_id) where reply_id is not null;

comment on table public.notifications is
  'What happened to me in a pool (H32). Written by triggers only; read and marked read by the recipient.';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'A browser''s Web Push subscription (H32). Saved through save_push_subscription; a 404 or 410 deletes it.';

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- Read only; written by triggers, marked read through mark_notifications_read.
create policy "notifications are read by their recipient"
  on public.notifications for select
  using (recipient_id = auth.uid());

create policy "push subscriptions are read by their owner"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "push subscriptions are removed by their owner"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- resolution
-- ---------------------------------------------------------------------------

-- paused ? off : personal ?? pool default ?? app default (H32).
create function public._notification_value(uid uuid, pid uuid, p_type text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((select s.paused from public.notification_settings s where s.user_id = uid), false)
      then 'off'
    else coalesce(
      (select m.value from public.member_notification_prefs m
        where m.pool_id = pid and m.user_id = uid and m.type = p_type),
      (select d.value from public.pool_notification_defaults d
        where d.pool_id = pid and d.type = p_type),
      case p_type when 'new_post' then 'invited' when 'reply' then 'on' else 'off' end
    )
  end;
$$;

-- Mine, for the settings screen and the tests.
create function public.my_notification_value(p_pool uuid, p_type text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null
              else public._notification_value(auth.uid(), p_pool, p_type) end;
$$;

-- The one pool a response notifies in (H32, Yoonji): the ripple's thread
-- pool (a joint record's own pool counts); otherwise the pool the actor and
-- the recipient share where the record is placed, the one the recipient
-- joined first. Null when the recipient cannot read it there.
create function public._notification_pool(rid uuid, actor uuid, recipient uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.ripples%rowtype;
  s public.splashes%rowtype;
  pid uuid;
begin
  select * into r from public.ripples where id = rid;
  if r.id is null or r.splash_id is null then
    return null;
  end if;
  select * into s from public.splashes where id = r.splash_id;
  if r.thread_pool_id is not null then
    pid := r.thread_pool_id;
    if not exists (
      select 1 from public.splash_placements p
       where p.splash_id = s.id and p.pool_id = pid and p.shared
    ) then
      return null;
    end if;
  elsif s.owner_id is null then
    pid := s.pool_id;
  else
    select p.pool_id into pid
      from public.splash_placements p
      join public.pool_members mr
        on mr.pool_id = p.pool_id and mr.user_id = recipient and mr.left_at is null
     where p.splash_id = s.id
       and p.shared
       and exists (
         select 1 from public.pool_members ma
          where ma.pool_id = p.pool_id and ma.user_id = actor and ma.left_at is null
       )
     order by mr.joined_at, p.pool_id
     limit 1;
    return pid;
  end if;
  if pid is null or not exists (
    select 1 from public.pool_members m
     where m.pool_id = pid and m.user_id = recipient and m.left_at is null
  ) then
    return null;
  end if;
  return pid;
end;
$$;

-- ---------------------------------------------------------------------------
-- new posts
-- ---------------------------------------------------------------------------

-- A record visible in a pool: every current member but its maker, by their
-- value there — All, or Only when invited and they are. Idempotent: run
-- once per row that could change the answer, at commit; an invite upgrades
-- an earlier plain notification and is pushed again.
create function public._notify_new_post(p_splash uuid, p_pool uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.splashes%rowtype;
  everyone boolean;
  invite_pool uuid;
  actor uuid;
begin
  select * into s from public.splashes where id = p_splash;
  if s.id is null or p_pool is null then
    return;
  end if;
  if s.owner_id is null then
    if s.pool_id is distinct from p_pool then
      return;
    end if;
    everyone := s.joint_invite_all;
    invite_pool := null;
  else
    select p.invite_all into everyone
      from public.splash_placements p
     where p.splash_id = p_splash and p.pool_id = p_pool and p.shared;
    if not found then
      return;
    end if;
    invite_pool := p_pool;
  end if;
  actor := coalesce(auth.uid(), s.owner_id, s.created_by);
  if actor is null then
    return;
  end if;

  insert into public.notifications as n
    (recipient_id, type, pool_id, splash_id, actor_id, invited)
  select m.user_id, 'new_post', p_pool, p_splash, actor, x.invited
    from public.pool_members m
    cross join lateral (
      select everyone or exists (
        select 1 from public.joint_invitees i
         where i.splash_id = p_splash
           and i.user_id = m.user_id
           and i.pool_id is not distinct from invite_pool
      ) as invited
    ) x
   where m.pool_id = p_pool
     and m.left_at is null
     and m.user_id <> actor
     and m.user_id is distinct from s.owner_id
     and case public._notification_value(m.user_id, p_pool, 'new_post')
           when 'all' then true
           when 'invited' then x.invited
           else false
         end
  on conflict (recipient_id, splash_id) where type = 'new_post'
  do update set invited = true,
                pool_id = excluded.pool_id,
                actor_id = excluded.actor_id,
                created_at = now(),
                read_at = null,
                pushed_at = null
          where excluded.invited and not n.invited;
end;
$$;

create function public.notify_new_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_table_name = 'splashes' then
      if new.owner_id is null then
        perform public._notify_new_post(new.id, new.pool_id);
      end if;
    elsif tg_table_name = 'splash_placements' then
      if new.shared then
        perform public._notify_new_post(new.splash_id, new.pool_id);
      end if;
    elsif tg_table_name = 'joint_invitees' then
      perform public._notify_new_post(
        new.splash_id,
        coalesce(new.pool_id, (select s.pool_id from public.splashes s where s.id = new.splash_id))
      );
    end if;
  exception when others then
    raise warning 'notify_new_post: %', sqlerrm;
  end;
  return null;
end;
$$;

-- At commit, so a record's invitees (written after it) are there to read.
create constraint trigger splashes_notify_new_post
  after insert or update of joint_invite_all on public.splashes
  deferrable initially deferred
  for each row execute function public.notify_new_post();

create constraint trigger splash_placements_notify_new_post
  after insert or update of shared, invite_all on public.splash_placements
  deferrable initially deferred
  for each row execute function public.notify_new_post();

create constraint trigger joint_invitees_notify_new_post
  after insert on public.joint_invitees
  deferrable initially deferred
  for each row execute function public.notify_new_post();

-- A record switched off in a pool takes its unread new posts there with it.
create function public.unnotify_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   where n.type = 'new_post' and n.read_at is null
     and n.splash_id = old.splash_id and n.pool_id = old.pool_id;
  return null;
end;
$$;

create trigger splash_placements_unnotify
  after delete or update of shared on public.splash_placements
  for each row
  when (old.shared)
  execute function public.unnotify_placement();

-- ---------------------------------------------------------------------------
-- replies and reactions
-- ---------------------------------------------------------------------------

-- The thread's people: the ripple's author, the record's owner (a joint
-- record's: everyone who wrote a side), and whoever replied there before.
create function public.notify_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ripples%rowtype;
  s public.splashes%rowtype;
  who uuid;
  pid uuid;
begin
  begin
    select * into r from public.ripples where id = new.ripple_id;
    select * into s from public.splashes where id = r.splash_id;
    for who in
      select distinct t.uid from (
        select r.author_id as uid
        union select s.owner_id
        union select x.author_id from public.ripples x
               where s.owner_id is null and x.splash_id = s.id
        union select y.author_id from public.ripple_replies y
               where y.ripple_id = new.ripple_id and y.id <> new.id
      ) t
       where t.uid is not null and t.uid <> new.author_id
    loop
      pid := public._notification_pool(new.ripple_id, new.author_id, who);
      continue when pid is null;
      continue when public._notification_value(who, pid, 'reply') <> 'on';
      insert into public.notifications
        (recipient_id, type, pool_id, splash_id, ripple_id, reply_id, actor_id)
      values (who, 'reply', pid, s.id, new.ripple_id, new.id, new.author_id);
    end loop;
  exception when others then
    raise warning 'notify_reply: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger ripple_replies_notify
  after insert on public.ripple_replies
  for each row execute function public.notify_reply();

-- A hidden reply's unread notifications go with its text.
create function public.unnotify_hidden_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n where n.reply_id = new.id and n.read_at is null;
  return null;
end;
$$;

create trigger ripple_replies_unnotify_hidden
  after update of hidden_at on public.ripple_replies
  for each row
  when (old.hidden_at is null and new.hidden_at is not null)
  execute function public.unnotify_hidden_reply();

-- To the ripple's author; the first in an hour per pool notifies, the rest
-- of that hour fold into it with no second push (H32).
create function public.notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ripples%rowtype;
  pid uuid;
  held uuid;
begin
  begin
    select * into r from public.ripples where id = new.ripple_id;
    if r.id is null or r.splash_id is null or r.author_id = new.user_id then
      return null;
    end if;
    pid := public._notification_pool(new.ripple_id, new.user_id, r.author_id);
    if pid is null or public._notification_value(r.author_id, pid, 'reaction') <> 'on' then
      return null;
    end if;
    select n.id into held
      from public.notifications n
     where n.recipient_id = r.author_id and n.pool_id = pid and n.type = 'reaction'
       and n.created_at > now() - interval '1 hour'
     order by n.created_at desc
     limit 1
     for update;
    if held is not null then
      update public.notifications
         set count = count + 1,
             actor_id = new.user_id,
             splash_id = r.splash_id,
             ripple_id = new.ripple_id,
             read_at = null
       where id = held;
    else
      insert into public.notifications
        (recipient_id, type, pool_id, splash_id, ripple_id, actor_id)
      values (r.author_id, 'reaction', pid, r.splash_id, new.ripple_id, new.user_id);
    end if;
  exception when others then
    raise warning 'notify_reaction: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger ripple_reactions_notify
  after insert on public.ripple_reactions
  for each row execute function public.notify_reaction();

-- ---------------------------------------------------------------------------
-- leaving
-- ---------------------------------------------------------------------------

create function public.unnotify_left_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   where n.recipient_id = new.user_id and n.pool_id = new.pool_id;
  return null;
end;
$$;

create trigger pool_members_unnotify_left
  after update of left_at on public.pool_members
  for each row
  when (old.left_at is null and new.left_at is not null)
  execute function public.unnotify_left_member();

-- ---------------------------------------------------------------------------
-- calls
-- ---------------------------------------------------------------------------

-- Mark these read, or every unread one with null.
create function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = now()
   where recipient_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any (p_ids));
$$;

-- This browser's subscription, for whoever is signed in on it now.
create function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
begin
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'That is not a push subscription.' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = uid,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

revoke execute on function public.pool_creator_is_me(uuid) from public, anon;
revoke execute on function public._notification_value(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._notification_pool(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public._notify_new_post(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notify_new_post() from public, anon, authenticated;
revoke execute on function public.unnotify_placement() from public, anon, authenticated;
revoke execute on function public.notify_reply() from public, anon, authenticated;
revoke execute on function public.unnotify_hidden_reply() from public, anon, authenticated;
revoke execute on function public.notify_reaction() from public, anon, authenticated;
revoke execute on function public.unnotify_left_member() from public, anon, authenticated;
revoke execute on function public.my_notification_value(uuid, text) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;

grant execute on function public.pool_creator_is_me(uuid) to authenticated;
grant execute on function public.my_notification_value(uuid, text) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
