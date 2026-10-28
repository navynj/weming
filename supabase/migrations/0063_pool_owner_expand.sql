-- 0063: a pool has one owner (2026-10-28).
--
-- Planned and approved in the session (H50). Roles: one owner (the creator
-- by default) and members; everything members can do stays open to all of
-- them. Owner-only: transfer ownership, remove members, delete the pool,
-- members' notification defaults (already the creator's, 0052, and the same
-- column: a transfer carries them).
--
-- - transfer_pool_owner: to a current member, at once; the new owner gets an
--   in-app notification (type 'owner', no record, never pushed).
-- - remove_pool_member: exactly leaving with Remove for them (Yoonji: "Yes:
--   removing a member is exactly leaving with Remove, including the H46
--   hand-over"), with no notification, and a row in pool_removed_members so
--   no link lets them back ("Removal must stop the person from re-joining
--   through any link"); join_pool refuses them with "You can't join this
--   Pool." until the owner allows them back, which deletes the row.
-- - leave_pool and delete_pool keep their checks here; 0064 adds the new
--   refusals (the owner cannot leave; delete only as the one member left)
--   once the app that stops offering them is live (rule 5).
-- - Backfill: a pool with no owner, or whose owner has left (Yoonji: "Yes,
--   treat an owner who has left as empty"), gets its longest-standing
--   current member as owner; a pool with no current members is torn down as
--   delete_pool would, people's words going back to them. Counts are printed.
--
-- Destructive DDL and data, approved by Yoonji in the session:
--   "I approve, in 0063: making notifications.splash_id nullable and
--   replacing the notifications_type and notifications_shape checks to allow
--   the 'owner' type; and, in the ownership backfill, tearing down pools with
--   no current members through _teardown_pool, which deletes those pool rows
--   while returning people's words to them."
--
-- Additive otherwise: a table, functions, function bodies replaced with
-- their signatures unchanged.

-- ---------------------------------------------------------------------------
-- notifications: "made you the owner", about a pool and no record
-- ---------------------------------------------------------------------------

alter table public.notifications alter column splash_id drop not null;
alter table public.notifications drop constraint notifications_type;
alter table public.notifications
  add constraint notifications_type
    check (type in ('new_post', 'reply', 'reaction', 'owner'));
alter table public.notifications drop constraint notifications_shape;
alter table public.notifications
  add constraint notifications_shape check (
    ((type in ('new_post', 'owner')) = (ripple_id is null))
    and ((type = 'reply') = (reply_id is not null))
    and ((not invited) or type = 'new_post')
    and ((type = 'owner') = (splash_id is null))
    and count >= 1
  );

comment on column public.notifications.splash_id is
  'The record it is about; null only on an ''owner'' notification, which is about the pool (0063).';

-- ---------------------------------------------------------------------------
-- removed members: no link lets them back
-- ---------------------------------------------------------------------------

create table public.pool_removed_members (
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Kept when the owner's account goes: the person stays removed.
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

comment on table public.pool_removed_members is
  'Who the pool''s owner removed (0063): join_pool refuses them until the owner allows them back, which deletes the row. Read and cleared by the owner only; written by remove_pool_member only.';

alter table public.pool_removed_members enable row level security;

create policy "removed members are read by the pool's owner"
  on public.pool_removed_members for select
  using (public.is_current_member(pool_id) and public.pool_creator_is_me(pool_id));

-- "Allow back".
create policy "removed members are allowed back by the pool's owner"
  on public.pool_removed_members for delete
  using (public.is_current_member(pool_id) and public.pool_creator_is_me(pool_id));

-- ---------------------------------------------------------------------------
-- leaving, for oneself or removed: one body
-- ---------------------------------------------------------------------------

-- Removed, their records would go from the pool and take members' words
-- with them: those threads become the pool's joint records first (0061).
create function public._leave_member(pid uuid, uid uuid, keep boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
begin
  if keep is null then
    raise exception 'keep or remove must be chosen' using errcode = '22023';
  end if;
  if not keep then
    for sid in
      select distinct r.splash_id
        from public.ripples r
        join public.splashes s on s.id = r.splash_id
       where r.thread_pool_id = pid and s.owner_id = uid
    loop
      perform public._hand_over_thread(sid, pid);
    end loop;
  end if;
  update public.pool_members
     set left_at = now(), keep_on_leave = keep
   where pool_id = pid and user_id = uid;
end;
$$;

create or replace function public.leave_pool(p_pool uuid, p_keep boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._leave_member(p_pool, public._require_member(p_pool), p_keep);
end;
$$;

-- ---------------------------------------------------------------------------
-- the owner's acts
-- ---------------------------------------------------------------------------

-- The caller, as the owner and a current member; the pool row locked.
create function public._require_owner(pid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_member(pid);
begin
  perform 1 from public.pools where id = pid and owner_id = uid for update;
  if not found then
    raise exception 'Only the Pool''s owner can do that.' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create function public.transfer_pool_owner(p_pool uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_owner(p_pool);
begin
  if p_to is null or p_to = uid or not exists (
    select 1 from public.pool_members
     where pool_id = p_pool and user_id = p_to and left_at is null
  ) then
    raise exception 'Pick someone who is in this Pool.' using errcode = '22023';
  end if;
  update public.pools set owner_id = p_to where id = p_pool;
  -- In-app only: written as already pushed, so the dispatcher never claims it.
  insert into public.notifications (recipient_id, type, pool_id, actor_id, pushed_at)
  values (p_to, 'owner', p_pool, uid, now());
end;
$$;

create function public.remove_pool_member(p_pool uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_owner(p_pool);
begin
  if p_user = uid then
    raise exception 'You can''t remove yourself.' using errcode = '22023';
  end if;
  if p_user is null or not exists (
    select 1 from public.pool_members
     where pool_id = p_pool and user_id = p_user and left_at is null
  ) then
    raise exception 'They aren''t in this Pool.' using errcode = '22023';
  end if;
  perform public._leave_member(p_pool, p_user, false);
  insert into public.pool_removed_members (pool_id, user_id, removed_by)
  values (p_pool, p_user, uid)
  on conflict (pool_id, user_id) do update
     set removed_by = excluded.removed_by, removed_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- joining refuses the removed
-- ---------------------------------------------------------------------------

create or replace function public.join_pool(p_token text, p_links jsonb, p_include_history boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  pid uuid := public._invite_pool(p_token);
begin
  if pid is null then
    raise exception 'This invite link is no longer valid.' using errcode = '42501';
  end if;

  if exists (select 1 from public.pool_removed_members where pool_id = pid and user_id = uid) then
    raise exception 'You can''t join this Pool.' using errcode = '42501';
  end if;

  -- Already here: joining again changes nothing (links live in settings).
  if exists (
    select 1 from public.pool_members
     where pool_id = pid and user_id = uid and left_at is null
  ) then
    return pid;
  end if;

  -- A former member comes back on their old row: rejoining is a new join, so
  -- they take the last column, and their kept-or-removed choice resets.
  insert into public.pool_members (pool_id, user_id, include_history)
  values (pid, uid, coalesce(p_include_history, false))
  on conflict (pool_id, user_id) do update
     set left_at = null,
         keep_on_leave = null,
         joined_at = now(),
         include_history = excluded.include_history;

  -- Joining asks nothing about lanes (2026-10-26) and places nothing:
  -- "include my earlier records" is retired with join-time matching (0033).
  perform public._set_links(pid, uid, p_links);

  return pid;
end;
$$;

-- ---------------------------------------------------------------------------
-- deleting: the teardown apart from who may ask for it
-- ---------------------------------------------------------------------------

-- delete_pool's body (0035, 0060), with no caller: the backfill below and
-- account deletion (0065) tear pools down with nobody signed in as owner.
create function public._teardown_pool(p_pool uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pool public.pools%rowtype;
  grp record;
  shell record;
  writer uuid;
  lane_name text;
  n integer;
  cid uuid;
  made jsonb := '{}'::jsonb;
  sid uuid;
  rec_id uuid;
begin
  select * into pool from public.pools where id = p_pool for update;
  if pool.id is null then
    raise exception 'no such pool' using errcode = 'P0002';
  end if;
  perform set_config('weming.pool_teardown', 'on', true);

  -- One lane per author per pool lane that holds anything of theirs with no
  -- lane of theirs to go to: pool records, joint ripples whose pool lane has
  -- no home lane of theirs (0033), and members' ripples on someone's record
  -- shared here, likewise (0035).
  for grp in
    select x.author, l.id as pool_lane_id, l.name, l.icon
      from (
        select s.owner_id as author, sp.pool_lane_id
          from public.splashes s
          join public.splash_placements sp on sp.splash_id = s.id and sp.pool_id = p_pool
         where s.own_pool_id = p_pool
           and not exists (select 1 from public.home_filing f
                            where f.user_id = s.owner_id and f.splash_id = s.id)
        union
        select r.author_id, s.pool_lane_id
          from public.ripples r
          join public.splashes s on s.id = r.splash_id
         where s.pool_id = p_pool and s.owner_id is null
           and r.author_id is not null
           and public._home_lane_for(s.id, r.author_id) is null
           and not exists (select 1 from public.home_filing f
                            where f.user_id = r.author_id and f.splash_id = s.id)
        union
        select r.author_id, sp.pool_lane_id
          from public.ripples r
          join public.splash_placements sp
            on sp.splash_id = r.splash_id and sp.pool_id = r.thread_pool_id
         where r.thread_pool_id = p_pool
           and not exists (select 1 from public.home_filing f
                            where f.user_id = r.author_id and f.splash_id = r.splash_id)
           and not exists (
             select 1 from public.lane_mappings m
              where m.user_id = r.author_id and m.pool_lane_id = sp.pool_lane_id and m.is_home
           )
      ) x
      join public.pool_lanes l on l.id = x.pool_lane_id
  loop
    lane_name := grp.name;
    if exists (select 1 from public.my_categories where user_id = grp.author and name = lane_name) then
      lane_name := grp.name || ' (' || pool.name || ')';
      n := 2;
      while exists (select 1 from public.my_categories where user_id = grp.author and name = lane_name) loop
        lane_name := grp.name || ' (' || pool.name || ' ' || n || ')';
        n := n + 1;
      end loop;
    end if;
    insert into public.my_categories (user_id, name, icon, position)
    values (
      grp.author,
      lane_name,
      grp.icon,
      coalesce((select max(position) + 1 from public.my_categories where user_id = grp.author), 0)
    )
    returning id into cid;
    made := made || jsonb_build_object(grp.author || ':' || grp.pool_lane_id, cid);
  end loop;

  -- Pool records (once Just mine): into that lane.
  for grp in
    select s.id, s.owner_id as author, sp.pool_lane_id, l.name, l.icon
      from public.splashes s
      join public.splash_placements sp on sp.splash_id = s.id and sp.pool_id = p_pool
      join public.pool_lanes l on l.id = sp.pool_lane_id
     where s.own_pool_id = p_pool
  loop
    cid := coalesce(
      (select f.my_lane_id from public.home_filing f
        where f.user_id = grp.author and f.splash_id = grp.id),
      (made ->> (grp.author || ':' || grp.pool_lane_id))::uuid
    );
    update public.splashes set own_pool_id = null, declared_lane_id = cid where id = grp.id;
    insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon)
    values (grp.id, pool.name, grp.name, grp.icon);
  end loop;

  -- Joint splashes: each author's ripples become one post of theirs, with
  -- the joint splash's title, icon and range.
  for shell in
    select s.*, l.name as lane_name, l.icon as lane_icon
      from public.splashes s
      join public.pool_lanes l on l.id = s.pool_lane_id
     where s.pool_id = p_pool and s.owner_id is null
  loop
    for writer in
      select distinct author_id from public.ripples
       where splash_id = shell.id and author_id is not null
    loop
      cid := coalesce(
        (select f.my_lane_id from public.home_filing f
          where f.user_id = writer and f.splash_id = shell.id),
        public._home_lane_for(shell.id, writer),
        (made ->> (writer || ':' || shell.pool_lane_id))::uuid
      );
      insert into public.splashes
        (owner_id, title, icon, declared_start, declared_end, declared_lane_id, created_at)
      values (
        writer,
        shell.title,
        shell.icon,
        shell.declared_start,
        shell.declared_end,
        cid,
        (select min(created_at) from public.ripples where splash_id = shell.id and author_id = writer)
      )
      returning id into sid;
      update public.ripples set splash_id = sid where splash_id = shell.id and author_id = writer;
      insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon)
      values (sid, pool.name, shell.lane_name, shell.lane_icon);
    end loop;
    delete from public.splashes where id = shell.id;
  end loop;

  -- Members' ripples on records shared here (0035, Yoonji, in the session):
  -- back to each author as a post of one per (record, author), titled like
  -- the record, in the lane made above (or their home lane). The record
  -- loses this placement with the pool, as any shared record does.
  for rec_id in
    select distinct splash_id from public.ripples where thread_pool_id = p_pool
  loop
    perform public._detach_thread(rec_id, p_pool, made);
  end loop;

  -- Shared splashes: untouched, but for where they came from.
  insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon)
  select sp.splash_id,
         coalesce(sp.origin_pool_name, pool.name),
         coalesce(sp.origin_pool_lane_name, l.name),
         coalesce(sp.origin_pool_lane_icon, l.icon)
    from public.splash_placements sp
    join public.pool_lanes l on l.id = sp.pool_lane_id
   where sp.pool_id = p_pool
     and sp.shared
     and not exists (select 1 from public.splash_origins o where o.splash_id = sp.splash_id
                      and o.pool_name = pool.name and o.recorded_at = now());

  delete from public.pools where id = p_pool;
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
  perform public._teardown_pool(p_pool);
end;
$$;

-- ---------------------------------------------------------------------------
-- grants (the 0026 pattern)
-- ---------------------------------------------------------------------------

revoke execute on function public._leave_member(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public._require_owner(uuid) from public, anon, authenticated;
revoke execute on function public._teardown_pool(uuid) from public, anon, authenticated;
revoke execute on function public.transfer_pool_owner(uuid, uuid) from public, anon;
revoke execute on function public.remove_pool_member(uuid, uuid) from public, anon;
grant execute on function public.transfer_pool_owner(uuid, uuid) to authenticated;
grant execute on function public.remove_pool_member(uuid, uuid) to authenticated;
revoke all on table public.pool_removed_members from anon;
grant select, delete on table public.pool_removed_members to authenticated;

-- ---------------------------------------------------------------------------
-- backfill: every pool has an owner who is in it
-- ---------------------------------------------------------------------------

-- One pool's owner settled: kept while they are a current member, else the
-- longest-standing current member, else (no one is in it) torn down as
-- delete_pool would. Says which, for the counts.
create function public._settle_pool_owner(pid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  heir uuid;
begin
  if exists (
    select 1 from public.pools pl
      join public.pool_members m on m.pool_id = pl.id and m.user_id = pl.owner_id
     where pl.id = pid and m.left_at is null
  ) then
    return 'kept';
  end if;
  select m.user_id into heir
    from public.pool_members m
   where m.pool_id = pid and m.left_at is null
   order by m.joined_at, m.user_id
   limit 1;
  if heir is not null then
    update public.pools set owner_id = heir where id = pid;
    return 'given';
  end if;
  perform public._teardown_pool(pid);
  return 'torn';
end;
$$;

revoke execute on function public._settle_pool_owner(uuid) from public, anon, authenticated;
-- Fixtures only: the tests settle their own pools, never anyone else's.
grant execute on function public._settle_pool_owner(uuid) to service_role;

do $$
declare
  pid uuid;
  said text;
  given integer := 0;
  torn integer := 0;
begin
  for pid in
    select pl.id
      from public.pools pl
     where pl.owner_id is null
        or not exists (select 1 from public.pool_members m
                        where m.pool_id = pl.id and m.user_id = pl.owner_id and m.left_at is null)
     order by pl.created_at
  loop
    said := public._settle_pool_owner(pid);
    if said = 'given' then given := given + 1; end if;
    if said = 'torn' then torn := torn + 1; end if;
  end loop;
  raise notice '0063 backfill: % pools given an owner, % pools with no current members torn down',
    given, torn;
end;
$$;
