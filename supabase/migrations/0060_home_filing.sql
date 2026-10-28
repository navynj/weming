-- 0060: Home filing, per record and mine alone; a pool record's origin can
-- be switched off (2026-10-28).
--
-- Planned and approved in the session (H45): "New owner-only table, e.g.
-- home_filing(user_id, splash_id, my_lane_id): where a record that isn't in
-- one of my lanes appears on my Home. No row = its pool's column (as now)."
-- "Backfill home_filing from every existing link whose home lane currently
-- places a joint or pool record in one of my lanes, so every Home column
-- stays exactly where it is." And, retiring "Move to Home…": "In a pool
-- record's Audience, the origin pool is no longer locked on ... If turning
-- it off would leave the record in no pool, ask once in the Audience sheet:
-- 'Keep it in which of your lanes?' ... Saving gives the record that lane
-- and it becomes an ordinary Home record."
--
-- Expand, switch, contract: lane_mappings and its functions stay, read by
-- the old app, until a later contract migration drops them (with approval
-- quoted there). Until then the two functions that still choose a lane for
-- someone's ripples (_detach_thread, delete_pool) read the filing first and
-- the home link after it.
--
-- A pool record's rule is now: placed in its own pool (the deferred check),
-- and shared to at least one pool while its owner keeps it so (the
-- placement hold). Switching off the last one goes through keep_in_lane,
-- which gives it a lane of mine in the same act.
--
-- Additive: one table with its policies, a backfill, functions replaced
-- with the same signatures, one new function. No DDL beyond that.

-- ---------------------------------------------------------------------------
-- home_filing
-- ---------------------------------------------------------------------------

create table public.home_filing (
  user_id uuid not null references public.profiles (id) on delete cascade,
  splash_id uuid not null references public.splashes (id) on delete cascade,
  my_lane_id uuid not null references public.my_categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, splash_id)
);

create index home_filing_lane on public.home_filing (my_lane_id);

comment on table public.home_filing is
  'Where a record that is not in one of my lanes shows on my Home (H45): display only, mine alone. No row: its pool''s column.';

alter table public.home_filing enable row level security;

create policy "filings are mine"
  on public.home_filing for select
  using (user_id = auth.uid());

-- Filed into a lane of mine, and only a record I can read.
create policy "filings are made into my lanes"
  on public.home_filing for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.my_categories c
                 where c.id = my_lane_id and c.user_id = auth.uid())
    and exists (select 1 from public.splashes s where s.id = splash_id)
  );

create policy "filings move among my lanes"
  on public.home_filing for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.my_categories c
                 where c.id = my_lane_id and c.user_id = auth.uid())
  );

create policy "filings are taken back"
  on public.home_filing for delete
  using (user_id = auth.uid());

revoke update on public.home_filing from authenticated, anon;
grant update (my_lane_id) on public.home_filing to authenticated;

-- ---------------------------------------------------------------------------
-- backfill: every record a home link places in one of my lanes today
-- ---------------------------------------------------------------------------

do $$
declare
  n_joint integer;
  n_own integer;
  n_theirs integer;
begin
  -- Joint records I made or wrote in, on a pool lane with a home lane of mine.
  insert into public.home_filing (user_id, splash_id, my_lane_id)
  select distinct w.user_id, s.id, m.my_category_id
    from public.splashes s
    join (
      select r.splash_id, r.author_id as user_id from public.ripples r
      union
      select s2.id, s2.created_by from public.splashes s2
       where s2.owner_id is null and s2.created_by is not null
    ) w on w.splash_id = s.id
    join public.lane_mappings m
      on m.user_id = w.user_id and m.pool_lane_id = s.pool_lane_id and m.is_home
   where s.owner_id is null
  on conflict do nothing;
  get diagnostics n_joint = row_count;

  -- My pool records, by their placement in their own pool.
  insert into public.home_filing (user_id, splash_id, my_lane_id)
  select s.owner_id, s.id, m.my_category_id
    from public.splashes s
    join public.splash_placements sp on sp.splash_id = s.id and sp.pool_id = s.own_pool_id
    join public.lane_mappings m
      on m.user_id = s.owner_id and m.pool_lane_id = sp.pool_lane_id and m.is_home
  on conflict do nothing;
  get diagnostics n_own = row_count;

  -- Someone's record I wrote on in a pool: the pool my Home places it by
  -- (my_thread_ripples' first), so one row per record.
  insert into public.home_filing (user_id, splash_id, my_lane_id)
  select distinct on (r.author_id, r.splash_id) r.author_id, r.splash_id, m.my_category_id
    from public.ripples r
    join public.splash_placements sp
      on sp.splash_id = r.splash_id and sp.pool_id = r.thread_pool_id
    join public.lane_mappings m
      on m.user_id = r.author_id and m.pool_lane_id = sp.pool_lane_id and m.is_home
   where r.thread_pool_id is not null
   order by r.author_id, r.splash_id, r.created_at
  on conflict do nothing;
  get diagnostics n_theirs = row_count;

  raise notice 'home_filing backfill: % joint, % pool records, % others'' records',
    n_joint, n_own, n_theirs;
end;
$$;

-- Every record a home link places on someone's Home today has its filing,
-- in that lane: no Home column moves at the switch. Refused otherwise.
do $$
declare
  missing integer;
begin
  select count(*) into missing
    from (
      select r.author_id as user_id, s.id as splash_id, m.my_category_id
        from public.splashes s
        join public.ripples r on r.splash_id = s.id
        join public.lane_mappings m
          on m.user_id = r.author_id and m.pool_lane_id = s.pool_lane_id and m.is_home
       where s.owner_id is null
      union
      select s.owner_id, s.id, m.my_category_id
        from public.splashes s
        join public.splash_placements sp on sp.splash_id = s.id and sp.pool_id = s.own_pool_id
        join public.lane_mappings m
          on m.user_id = s.owner_id and m.pool_lane_id = sp.pool_lane_id and m.is_home
    ) placed
   where not exists (
     select 1 from public.home_filing f
      where f.user_id = placed.user_id and f.splash_id = placed.splash_id
        and f.my_lane_id = placed.my_category_id
   );
  if missing > 0 then
    raise exception 'home_filing backfill missed % records a home lane places', missing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- a pool record: placed in its pool, shared to at least one
-- ---------------------------------------------------------------------------

-- Placed in its own pool, on or off (was: shared there). Being shared
-- somewhere is the placement hold's to keep.
create or replace function public.check_own_pool_placed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.own_pool_id is not null and not exists (
    select 1 from public.splash_placements p
     where p.splash_id = new.id and p.pool_id = new.own_pool_id
  ) then
    raise exception 'a pool record must be placed in its pool' using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function public.hold_own_pool_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  own uuid;
  sid uuid := coalesce(new.splash_id, old.splash_id);
begin
  select own_pool_id into own from public.splashes where id = sid;
  -- Not a pool record, or the splash itself is being deleted (the cascade
  -- runs after its row is gone), or the pool is torn down, or a reshape
  -- (keep_in_lane, a hand-over) is at work: no rule here.
  if own is null
     or coalesce(current_setting('weming.pool_teardown', true), '') = 'on'
     or coalesce(current_setting('weming.reshape', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and old.pool_id = own and new.pool_id <> old.pool_id then
    raise exception 'a pool record stays placed in its pool' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.pool_id <> own and new.pool_id = own then
    raise exception 'a pool record has one placement in its pool' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.pool_id = own then
    raise exception 'a pool record stays placed in its pool' using errcode = '42501';
  end if;
  -- Its origin can be switched off like any pool (H45), but not the last
  -- one on: that asks for a lane of mine (keep_in_lane).
  if (tg_op = 'DELETE' and old.shared or tg_op = 'UPDATE' and old.shared and not new.shared)
     and not exists (
       select 1 from public.splash_placements p
        where p.splash_id = sid and p.pool_id <> old.pool_id and p.shared
     ) then
    raise exception 'Keep it in one of your lanes first.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- "Keep it in which of your lanes?" (H45): my pool record leaves its last
-- pool and becomes a record of my lane. Every placement is switched off,
-- never removed, so members' ripples there are hidden, not deleted, and come
-- back if it is shared there again (0035).
create function public.keep_in_lane(p_splash uuid, p_my_lane uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
begin
  if not exists (
    select 1 from public.splashes
     where id = p_splash and owner_id = uid and own_pool_id is not null
  ) then
    raise exception 'only your pool record is kept in your lane this way' using errcode = '42501';
  end if;
  if not exists (select 1 from public.my_categories where id = p_my_lane and user_id = uid) then
    raise exception 'that lane is not yours' using errcode = '42501';
  end if;
  perform set_config('weming.reshape', 'on', true);
  update public.splash_placements
     set shared = false, updated_at = now()
   where splash_id = p_splash and shared;
  update public.splashes
     set own_pool_id = null, declared_lane_id = p_my_lane
   where id = p_splash;
  delete from public.home_filing where user_id = uid and splash_id = p_splash;
  perform set_config('weming.reshape', 'off', true);
end;
$$;

revoke execute on function public.keep_in_lane(uuid, uuid) from public, anon;
grant execute on function public.keep_in_lane(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- where someone's ripples land when a record or a pool goes: their filing
-- first, then the home link (until the contract), then as before
-- ---------------------------------------------------------------------------

create or replace function public._detach_thread(sid uuid, pid uuid, made jsonb default '{}'::jsonb)
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
      (select f.my_lane_id from public.home_filing f
        where f.user_id = writer and f.splash_id = sid),
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
           and not exists (select 1 from public.home_filing f
                            where f.user_id = s.owner_id and f.splash_id = s.id)
        union
        select r.author_id, s.pool_lane_id
          from public.ripples r
          join public.splashes s on s.id = r.splash_id
         where s.pool_id = p_pool and s.owner_id is null
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
      select distinct author_id from public.ripples where splash_id = shell.id
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
$function$;
