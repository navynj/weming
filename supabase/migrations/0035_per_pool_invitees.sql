-- 0035: per-pool invitees on my records (2026-10-26; _docs/SHARING-V2.md §7–8).
--
-- My Home record (or my pool record), shared to a pool, can be together
-- with that pool's members: With per pool — Everyone (invite_all on the
-- placement) or faces picked (joint_invitees rows with that pool_id). The
-- invited members of that pool add their side on my record there; each such
-- ripple carries the pool it was written in (ripples.thread_pool_id) and is
-- read only by that pool's current members and by me. My own ripples stay
-- readable in every pool the record is shared to.
--
-- Decided by Yoonji in the session:
--   - Switching a placement off hides that pool's members' ripples from the
--     pool, never deletes them; switching it on restores them. I, the
--     record's owner, still read them (a muted "<Pool> (off)" tab); each
--     author always reads their own.
--   - Deleting my record, or the pool, returns members' ripples to their
--     authors as a post of one per (record, author), titled like my record,
--     in a lane made from the pool lane (as detached joint ripples are).
--   - A member leaving: their ripples here follow keep_on_leave, like their
--     placements (member_visible).
--
-- Destructive, approved by Yoonji in the session, quoted:
--   "Approved: drop joint_invitees' primary key (splash_id, user_id) and use
--   a surrogate id with one unique key per use. Production has 0 rows."
-- Everything else is additive: columns, a foreign key, triggers, functions,
-- and two ripple policies and one invitee policy altered (none removed).
-- Written to apply over a local database still holding an earlier draft of
-- 0033's table shape too.

-- ---------------------------------------------------------------------------
-- joint_invitees: a surrogate key, one unique key per use (approved above)
-- ---------------------------------------------------------------------------

alter table public.joint_invitees
  add column if not exists id uuid not null default gen_random_uuid();
alter table public.joint_invitees drop constraint joint_invitees_pkey;
alter table public.joint_invitees add constraint joint_invitees_pkey primary key (id);
create unique index if not exists joint_invitees_joint_key
  on public.joint_invitees (splash_id, user_id) where pool_id is null;
-- joint_invitees_pool_key (splash_id, pool_id, user_id) where pool_id is
-- not null exists since 0034.

comment on column public.joint_invitees.pool_id is
  'Null for a joint record (its pool is its own); set for per-pool invitees on my record, tied to that placement (0035).';

-- A joint record's invitees: its pool's current members. Per-pool invitees
-- on my record: that pool's current members, and me, its author.
alter policy "invitees are readable by the pool's current members"
  on public.joint_invitees
  using (
    public.is_current_member(coalesce(pool_id, public._joint_pool(splash_id)))
    or (pool_id is not null and public.splash_owner(splash_id) = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Everyone, per pool; the pool a member's ripple was written in
-- ---------------------------------------------------------------------------

alter table public.splash_placements
  add column invite_all boolean not null default false;

comment on column public.splash_placements.invite_all is
  'Everyone (0035): my record, in this pool, together with every current member, later joiners included.';

alter table public.ripples
  add column thread_pool_id uuid;

comment on column public.ripples.thread_pool_id is
  'A member''s ripple on someone''s record: the pool it was written in, read only there and by the record''s owner (0035). Null for the owner''s own ripples and on joint records.';

-- A placement holding members' ripples is switched off, never deleted: the
-- database holds "never deletes" (pool and record deletion move the
-- ripples first).
alter table public.ripples
  add constraint ripples_thread_placement_fkey
  foreign key (splash_id, thread_pool_id)
  references public.splash_placements (splash_id, pool_id) on delete restrict;

create index ripples_thread_idx on public.ripples (thread_pool_id) where thread_pool_id is not null;

-- thread_pool_id is null exactly for the owner's own ripples and on joint
-- records, and stays the pool it was written in (moving to another splash
-- aside).
create function public.hold_ripple_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if tg_op = 'UPDATE'
     and new.thread_pool_id is distinct from old.thread_pool_id
     and new.splash_id is not distinct from old.splash_id then
    raise exception 'a ripple stays in the pool it was written in' using errcode = '23514';
  end if;
  if new.splash_id is null then
    return new;
  end if;
  select owner_id into owner from public.splashes where id = new.splash_id;
  if new.thread_pool_id is null then
    if owner is not null and owner <> new.author_id then
      raise exception 'a ripple on someone else''s record is written in one of its pools'
        using errcode = '23514';
    end if;
  elsif owner is null or owner = new.author_id then
    raise exception 'only someone else''s ripple on a record carries its pool'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ripples_hold_thread
  before insert or update of splash_id, thread_pool_id, author_id on public.ripples
  for each row execute function public.hold_ripple_thread();

-- ---------------------------------------------------------------------------
-- writing: an invited member of the pool, on my record, while it is shared
-- ---------------------------------------------------------------------------

create function public.ripple_writable(sid uuid, tp uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when tp is null then public.splash_writable(sid)
    else exists (
      select 1
        from public.splashes s
        join public.splash_placements p on p.splash_id = s.id and p.pool_id = tp
       where s.id = sid
         and s.owner_id is not null
         and s.owner_id <> auth.uid()
         and p.shared
         and public.is_current_member(tp)
         and (
           p.invite_all
           or exists (
             select 1 from public.joint_invitees i
              where i.splash_id = sid and i.pool_id = tp and i.user_id = auth.uid()
           )
         )
    )
  end;
$$;

alter policy "ripples are written only into writable splashes"
  on public.ripples
  with check ((splash_id is null) or public.ripple_writable(splash_id, thread_pool_id));

alter policy "ripples stay in writable splashes"
  on public.ripples
  with check ((splash_id is null) or public.ripple_writable(splash_id, thread_pool_id));

-- ---------------------------------------------------------------------------
-- reading: a member's ripple in its pool, and by the record's owner
-- ---------------------------------------------------------------------------

create or replace function public.ripple_in_my_pools(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.ripples r
      join public.splashes s on s.id = r.splash_id
     where r.id = rid
       and not public.ripple_is_locked(r.id)
       and (
         (s.owner_id is null
           and public.is_current_member(s.pool_id)
           and public.member_visible(s.pool_id, r.author_id))
         or (s.owner_id = r.author_id and public.splash_in_my_pools(s.id))
         -- A member's ripple on someone's record (0035): followed by
         -- keep_on_leave; read by the record's owner, on or off, and by
         -- the pool's current members while the record is shared there.
         or (r.thread_pool_id is not null
           and s.owner_id is not null
           and public.member_visible(r.thread_pool_id, r.author_id)
           and (
             s.owner_id = auth.uid()
             or (public.is_current_member(r.thread_pool_id)
               and public.member_visible(r.thread_pool_id, s.owner_id)
               and exists (
                 select 1 from public.splash_placements p
                  where p.splash_id = s.id and p.pool_id = r.thread_pool_id and p.shared
               ))
           ))
       )
  );
$$;

-- Reactions and replies (0030) on a member's ripple belong to its one pool.
create or replace function public._ripple_pools(rid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.pool_id
    from public.ripples r
    join public.splashes s on s.id = r.splash_id
   where r.id = rid and s.owner_id is null and s.pool_id is not null
  union
  select p.pool_id
    from public.ripples r
    join public.splash_placements p on p.splash_id = r.splash_id and p.shared
   where r.id = rid
     and (r.thread_pool_id is null or p.pool_id = r.thread_pool_id);
$$;

-- ---------------------------------------------------------------------------
-- With, per pool: who my record is together with there
-- ---------------------------------------------------------------------------

-- Each (record, pool): every current member under Everyone, else the picked
-- ones still in the pool; never the record's owner. Read by its owner, and
-- by that pool's current members while it is shared there.
create function public.placement_together(p_splashes uuid[])
returns table (splash_id uuid, pool_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.splash_id, p.pool_id, m.user_id
    from public.splash_placements p
    join public.splashes s on s.id = p.splash_id
    join public.pool_members m on m.pool_id = p.pool_id and m.left_at is null
   where p.splash_id = any (p_splashes)
     and s.owner_id is not null
     and m.user_id <> s.owner_id
     and (s.owner_id = auth.uid() or (p.shared and public.is_current_member(p.pool_id)))
     and (
       p.invite_all
       or exists (
         select 1 from public.joint_invitees i
          where i.splash_id = p.splash_id and i.pool_id = p.pool_id and i.user_id = m.user_id
       )
     );
$$;

-- The author sets With for one pool of their record: the picks as given
-- (unlike a joint record, people may be taken off; one who already wrote
-- keeps their side) and Everyone. Each pick a current member, not me.
create function public.set_placement_together(
  p_splash uuid,
  p_pool uuid,
  p_users uuid[],
  p_everyone boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  picks uuid[] := coalesce(p_users, '{}'::uuid[]);
begin
  if not exists (select 1 from public.splashes where id = p_splash and owner_id = uid) then
    raise exception 'only its author sets who it is with' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.splash_placements where splash_id = p_splash and pool_id = p_pool
  ) then
    raise exception 'it is not shared to that pool' using errcode = '42501';
  end if;
  perform public._require_member(p_pool);
  if exists (
    select 1 from unnest(picks) u
     where u = uid
        or not exists (
          select 1 from public.pool_members
           where pool_id = p_pool and user_id = u and left_at is null
        )
  ) then
    raise exception 'Only members of this Pool can be together here.' using errcode = '42501';
  end if;
  delete from public.joint_invitees
   where splash_id = p_splash and pool_id = p_pool and user_id <> all (picks);
  insert into public.joint_invitees (splash_id, pool_id, user_id)
  select p_splash, p_pool, u from unnest(picks) u
  on conflict do nothing;
  update public.splash_placements
     set invite_all = coalesce(p_everyone, false)
   where splash_id = p_splash and pool_id = p_pool;
end;
$$;

-- An author's own ripples on others' records, with what their Home needs to
-- show them under the record's title even once it is no longer shared there
-- (the record itself is then unreadable to them).
create function public.my_thread_ripples()
returns table (
  ripple_id uuid,
  splash_id uuid,
  owner_id uuid,
  title text,
  icon text,
  declared_start date,
  declared_end date,
  pool_id uuid,
  pool_name text,
  pool_lane_id uuid,
  pool_lane_name text,
  pool_lane_icon text,
  shared boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, s.id, s.owner_id, s.title, s.icon, s.declared_start, s.declared_end,
         p.pool_id, po.name, p.pool_lane_id, l.name, l.icon, p.shared
    from public.ripples r
    join public.splashes s on s.id = r.splash_id
    join public.splash_placements p on p.splash_id = r.splash_id and p.pool_id = r.thread_pool_id
    left join public.pools po on po.id = p.pool_id
    left join public.pool_lanes l on l.id = p.pool_lane_id
   where r.author_id = auth.uid()
     and r.thread_pool_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- returning members' ripples to their authors (record or pool deleted)
-- ---------------------------------------------------------------------------

-- Each author's ripples on record sid in pool pid become a post of one of
-- theirs, titled like the record, with its days: in the lane `made` names
-- (delete_pool's, from the pool lane), else their home lane for that pool
-- lane, else a lane of theirs named as the pool lane, else one made so.
create function public._detach_thread(sid uuid, pid uuid, made jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  pl record;
  pool_name text;
  writer uuid;
  cid uuid;
  nid uuid;
begin
  select title, icon, declared_start, declared_end into rec from public.splashes where id = sid;
  select sp.pool_lane_id, l.name, l.icon into pl
    from public.splash_placements sp
    join public.pool_lanes l on l.id = sp.pool_lane_id
   where sp.splash_id = sid and sp.pool_id = pid;
  select name into pool_name from public.pools where id = pid;
  for writer in
    select distinct author_id from public.ripples where splash_id = sid and thread_pool_id = pid
  loop
    cid := coalesce(
      (made ->> (writer || ':' || pl.pool_lane_id))::uuid,
      (select m.my_category_id from public.lane_mappings m
        where m.user_id = writer and m.pool_lane_id = pl.pool_lane_id and m.is_home),
      (select c.id from public.my_categories c
        where c.user_id = writer and lower(c.name) = lower(pl.name)
        order by c.position limit 1)
    );
    if cid is null then
      insert into public.my_categories (user_id, name, icon, position)
      values (
        writer,
        pl.name,
        pl.icon,
        coalesce((select max(position) + 1 from public.my_categories where user_id = writer), 0)
      )
      returning id into cid;
    end if;
    insert into public.splashes
      (owner_id, title, icon, declared_start, declared_end, declared_lane_id, created_at)
    values (
      writer,
      rec.title,
      rec.icon,
      rec.declared_start,
      rec.declared_end,
      cid,
      (select min(created_at) from public.ripples
        where splash_id = sid and thread_pool_id = pid and author_id = writer)
    )
    returning id into nid;
    update public.ripples
       set splash_id = nid, thread_pool_id = null
     where splash_id = sid and thread_pool_id = pid and author_id = writer;
    insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon)
    values (nid, coalesce(pool_name, 'A pool'), pl.name, pl.icon);
  end loop;
end;
$$;

-- Deleting my record returns members' ripples to their authors first
-- (Yoonji, in the session), whatever path deletes it.
create function public.detach_threads_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tp uuid;
begin
  if old.owner_id is not null then
    for tp in
      select distinct thread_pool_id from public.ripples
       where splash_id = old.id and thread_pool_id is not null
    loop
      perform public._detach_thread(old.id, tp);
    end loop;
  end if;
  return old;
end;
$$;

create trigger splashes_detach_threads
  before delete on public.splashes
  for each row execute function public.detach_threads_on_delete();

-- ---------------------------------------------------------------------------
-- pools: deleting one returns members' ripples on records shared there
-- ---------------------------------------------------------------------------

create or replace function public.delete_pool(p_pool uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := public._require_uid();
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
  if pool.owner_id is null or pool.owner_id <> uid then
    raise exception 'Only the Pool''s creator can delete it.' using errcode = '42501';
  end if;
  perform public._require_member(p_pool);
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
        union
        select r.author_id, s.pool_lane_id
          from public.ripples r
          join public.splashes s on s.id = r.splash_id
         where s.pool_id = p_pool and s.owner_id is null
           and public._home_lane_for(s.id, r.author_id) is null
        union
        select r.author_id, sp.pool_lane_id
          from public.ripples r
          join public.splash_placements sp
            on sp.splash_id = r.splash_id and sp.pool_id = r.thread_pool_id
         where r.thread_pool_id = p_pool
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
    cid := (made ->> (grp.author || ':' || grp.pool_lane_id))::uuid;
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
      select distinct author_id from public.ripples where splash_id = shell.id
    loop
      cid := coalesce(
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
$function$;


-- ---------------------------------------------------------------------------
-- Move to Home: refused while members have written on my pool record
-- ---------------------------------------------------------------------------

create or replace function public.splash_to_mine(p_splash uuid, p_my_lane uuid, p_place_on uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Members have written on it in its pool (0035): their side hangs off
    -- the placement this would drop.
    if exists (
      select 1 from public.ripples where splash_id = p_splash and thread_pool_id is not null
    ) then
      raise exception 'others have written here' using errcode = '42501';
    end if;
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
$function$;

-- ---------------------------------------------------------------------------
-- grants: signed-out callers reach nothing (0026)
-- ---------------------------------------------------------------------------

revoke execute on function public.hold_ripple_thread() from public, anon, authenticated;
revoke execute on function public.detach_threads_on_delete() from public, anon, authenticated;
revoke execute on function public._detach_thread(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ripple_writable(uuid, uuid) from public, anon;
revoke execute on function public.placement_together(uuid[]) from public, anon;
grant execute on function public.placement_together(uuid[]) to authenticated;
revoke execute on function public.set_placement_together(uuid, uuid, uuid[], boolean) from public, anon;
grant execute on function public.set_placement_together(uuid, uuid, uuid[], boolean) to authenticated;
revoke execute on function public.my_thread_ripples() from public, anon;
grant execute on function public.my_thread_ripples() to authenticated;
