-- 0028: ripples inherit lane and date from their splash — expand (2026-10-26).
--
-- The target model (H24): a splash owns its lane — my lane, or its pool
-- lane for joint and Just mine — and its date range. A ripple owns only its
-- content, media, author, lock state and timestamps. Placement everywhere
-- reads the splash alone. Every ripple belongs to a splash.
--
-- Rolled out expand, switch, contract, so the live app never breaks
-- (Yoonji, 2026-10-26):
--   0028 (this) — the data moves, and the old ripple lane check relaxes so a
--                 ripple on a splash may carry no lane. The current app and
--                 the new one both work against it.
--   the new app — writes no ripple lane or date; derives where a joint
--                 splash shows on Home.
--   0029        — the contract: the freeze, the required date and lane, the
--                 RESTRICT foreign key, the joint ripples' lanes cleared.
--
-- The data moves (the rules agreed in the session):
--   a. a personal splash with no declared lane takes its majority lane;
--   b. lane mismatch on a personal splash: split by lane — each other lane's
--      ripples become a post of their own (same title, icon, session,
--      range), shared only where that lane sends;
--   c. a lone ripple becomes a post of one: title from its first line (40
--      characters at a word boundary; photo-only "<lane> · <Mon D>"), icon
--      and lane from its lane, its own created_at and written_on, the
--      bypass flag scoped to this transaction;
--   d. dates: block days cluster with a new cluster after any gap over 7
--      days; the cluster holding the declared range (or, undated, the
--      largest) keeps the splash and its range widens to it; every other
--      cluster becomes a post of its own. A splash with no blocks and no
--      date takes its written_on.
-- They live in one function, _inherit_backfill(), because 0029 runs it again
-- for what the current app writes between the two. It is idempotent.
--
-- Additive: functions, one relaxed trigger function, data moves. Nothing
-- dropped, no column or constraint changed, no ripple's words, photos,
-- author or dates changed — only which splash it sits on.

-- ---------------------------------------------------------------------------
-- written_on: kept as copied while the backfill makes posts
-- ---------------------------------------------------------------------------

-- A post made from a ripple keeps that ripple's written day; the trigger
-- would otherwise stamp it from today's timezone. The flag is
-- transaction-local and only _inherit_backfill sets it.
create or replace function public.set_written_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  zone text;
begin
  if tg_op = 'UPDATE' then
    new.written_on := old.written_on;
    return new;
  end if;

  if new.written_on is not null
     and current_setting('weming.inherit_backfill', true) = 'on' then
    return new;
  end if;

  if tg_table_name = 'ripples' then
    author := new.author_id;
  else
    author := coalesce(new.owner_id, new.created_by);
  end if;
  select timezone into zone from public.profiles where id = author;
  new.written_on := (timezone(coalesce(zone, 'UTC'), coalesce(new.created_at, now())))::date;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- a ripple on a splash may carry no lane
-- ---------------------------------------------------------------------------

-- Relaxed from 0016: only a lone ripple still needs a lane of mine (the
-- current app's lone path), and a Just-mine one still has none.
create or replace function public.check_ripple_lane()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  own uuid;
begin
  if new.splash_id is not null then
    select own_pool_id into own from public.splashes where id = new.splash_id;
  end if;
  if new.category_id is null and new.splash_id is null then
    raise exception 'a ripple needs one of your lanes' using errcode = '23514';
  end if;
  if new.category_id is not null and own is not null then
    raise exception 'a ripple on a Just-mine splash has no lane of yours' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- where a joint splash shows on my Home, derived
-- ---------------------------------------------------------------------------

-- My lane linked to its pool lane when the link brings in (both, in), else
-- null — the pool's own column. Several links may bring in one pool lane;
-- both wins, then the oldest. The app derives the same from the links it
-- reads; this is the server's copy, for delete_pool (0029).
create function public._joint_lane_for(sid uuid, uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.my_category_id
    from public.splashes s
    join public.lane_mappings m
      on m.pool_id = s.pool_id and m.pool_lane_id = s.pool_lane_id
   where s.id = sid
     and s.owner_id is null
     and m.user_id = uid
     and m.direction in ('both', 'in')
   order by (m.direction = 'both') desc, m.created_at, m.id
   limit 1;
$$;

revoke execute on function public._joint_lane_for(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- the backfill
-- ---------------------------------------------------------------------------

-- A post of one's title: the first line with words in it, at most 40
-- characters, cut at the last word boundary that fits (a single long word
-- is cut at 40).
create function public._inherit_post_title(note text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(line) <= 40 then line
    when strpos(left(line, 41), ' ') = 0 then left(line, 40)
    else rtrim(left(line, 41 - strpos(reverse(left(line, 41)), ' ')))
  end
  from (select btrim(split_part(btrim(coalesce(note, ''), E' \t\r\n'), E'\n', 1)) as line) l;
$$;

-- A copy of a splash for ripples split away from it: everything but its id,
-- pin, range and hand-set layouts. Its placements and origins come along;
-- under a different lane (p_lane), a placement only where that lane sends.
create function public._inherit_split_from(src uuid, p_lane uuid, p_created timestamptz)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  s public.splashes%rowtype;
  sid uuid;
begin
  select * into s from public.splashes where id = src;
  insert into public.splashes
    (owner_id, pool_id, pool_lane_id, created_by, own_pool_id, type, prompt, ends_at,
     title, icon, declared_lane_id, declared_start, declared_end, session_id,
     created_at, written_on)
  values
    (s.owner_id, s.pool_id, s.pool_lane_id, s.created_by, s.own_pool_id, s.type, s.prompt, s.ends_at,
     s.title, s.icon, coalesce(p_lane, s.declared_lane_id), s.declared_start, s.declared_end, s.session_id,
     coalesce(p_created, s.created_at), s.written_on)
  returning id into sid;

  if p_lane is null or p_lane is not distinct from s.declared_lane_id then
    insert into public.splash_placements (splash_id, pool_id, pool_lane_id, shared)
    select sid, pool_id, pool_lane_id, shared
      from public.splash_placements where splash_id = src;
  else
    -- C5: a different lane leaks only where it sends.
    insert into public.splash_placements (splash_id, pool_id, pool_lane_id, shared)
    select sid, p.pool_id, public._sending_lane(p.pool_id, s.owner_id, p_lane), true
      from public.splash_placements p
     where p.splash_id = src
       and p.shared
       and public._sending_lane(p.pool_id, s.owner_id, p_lane) is not null;
  end if;

  insert into public.splash_origins (splash_id, pool_name, pool_lane_name, pool_lane_icon, recorded_at)
  select sid, pool_name, pool_lane_name, pool_lane_icon, recorded_at
    from public.splash_origins where splash_id = src;
  return sid;
end;
$$;

create function public._inherit_backfill()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
  g record;
  s record;
  c record;
  keep integer;
  sid uuid;
begin
  perform set_config('weming.inherit_backfill', 'on', true);

  -- (a) A personal splash with no declared lane takes the lane its ripples
  -- took most, the most recently written on a tie (lanesByFrequency)…
  update public.splashes x
     set declared_lane_id = (
       select r2.category_id
         from public.ripples r2
        where r2.splash_id = x.id and r2.category_id is not null
        group by r2.category_id
        order by count(*) desc, max(r2.created_at) desc
        limit 1)
   where x.owner_id is not null
     and x.own_pool_id is null
     and x.declared_lane_id is null;

  -- …and one whose ripples took none, its owner's residual lane, as a new
  -- drop does (residualLane: "Day", else the first).
  update public.splashes x
     set declared_lane_id = (
       select cat.id from public.my_categories cat
        where cat.user_id = x.owner_id
        order by (cat.name = 'Day') desc, cat.position, cat.created_at
        limit 1)
   where x.owner_id is not null
     and x.own_pool_id is null
     and x.declared_lane_id is null;

  -- (c) Lone ripples: a post of one each. An inner ripple goes where its
  -- parent goes (below), so only top-level ones make posts.
  for r in
    select x.*, cat.name as lane_name, cat.icon as lane_icon
      from public.ripples x
      join public.my_categories cat on cat.id = x.category_id
     where x.splash_id is null and x.parent_ripple_id is null
     order by x.created_at, x.id
  loop
    insert into public.splashes (owner_id, title, icon, declared_lane_id, created_at, written_on)
    values (
      r.author_id,
      case
        when public._inherit_post_title(r.note) <> '' then public._inherit_post_title(r.note)
        else r.lane_name || ' · ' || to_char(coalesce(r.occurred_on, r.written_on), 'Mon FMDD')
      end,
      r.lane_icon,
      r.category_id,
      r.created_at,
      r.written_on
    )
    returning id into sid;
    update public.ripples set splash_id = sid where id = r.id;
  end loop;

  update public.ripples ch
     set splash_id = p.splash_id
    from public.ripples p
   where ch.parent_ripple_id = p.id
     and ch.splash_id is distinct from p.splash_id
     and p.splash_id is not null;

  if exists (select 1 from public.ripples where splash_id is null) then
    raise exception 'a ripple is still lone after the backfill';
  end if;

  -- (b) Lane mismatch on a personal splash: each lane other than the
  -- declared one moves, with its ripples, to a post of its own. An inner
  -- ripple goes with its parent. A ripple with no lane of its own (the new
  -- app writes none) already inherits, and stays.
  for g in
    select x.splash_id, coalesce(p.category_id, x.category_id) as lane,
           min(x.created_at) as first_at
      from public.ripples x
      left join public.ripples p on p.id = x.parent_ripple_id
      join public.splashes sp on sp.id = x.splash_id
     where sp.owner_id is not null
       and sp.own_pool_id is null
       and coalesce(p.category_id, x.category_id) is not null
       and coalesce(p.category_id, x.category_id) <> sp.declared_lane_id
     group by 1, 2
     order by 1, 3
  loop
    sid := public._inherit_split_from(g.splash_id, g.lane, g.first_at);
    update public.ripples x
       set splash_id = sid
     where x.splash_id = g.splash_id
       and coalesce((select p.category_id from public.ripples p where p.id = x.parent_ripple_id),
                    x.category_id) = g.lane;
  end loop;

  -- (d) Dates. A block's day is where it is drawn today:
  -- coalesce(occurred_on, the splash's declared_start, written_on); its end
  -- is its span's end in the author's zone (summary.ts spanEndDay). Blocks
  -- cluster with a new cluster after any gap over 7 days; a declared range
  -- is an anchor in the clustering.
  -- One scratch table per transaction (0029 calls this again in its own).
  create temp table if not exists inherit_clusters (
    splash_id uuid, ripple_id uuid, created_at timestamptz,
    d_start date, d_end date, anchor boolean, reach date, brk integer, cl bigint
  ) on commit drop;
  delete from inherit_clusters;
  insert into inherit_clusters (splash_id, ripple_id, created_at, d_start, d_end, anchor, reach, brk, cl)
  with days as (
    select x.id as ripple_id, x.splash_id, x.created_at,
           coalesce(x.occurred_on, sp.declared_start, x.written_on) as d_start,
           greatest(
             coalesce(x.occurred_on, sp.declared_start, x.written_on),
             case when x.ended_at is not null and x.occurred_on is not null
                  then (timezone(coalesce(pr.timezone, 'UTC'), x.ended_at))::date end
           ) as d_end
      from public.ripples x
      join public.splashes sp on sp.id = x.splash_id
      left join public.profiles pr on pr.id = x.author_id
     where x.parent_ripple_id is null
  ),
  pieces as (
    select splash_id, ripple_id, created_at, d_start, d_end, false as anchor from days
    union all
    select id, null, null, declared_start, coalesce(declared_end, declared_start), true
      from public.splashes where declared_start is not null
  ),
  ordered as (
    select *,
           max(d_end) over (partition by splash_id order by d_start, d_end, ripple_id nulls first
                            rows between unbounded preceding and 1 preceding) as reach
      from pieces
  ),
  breaks as (
    select *, case when reach is not null and d_start - reach > 7 then 1 else 0 end as brk
      from ordered
  )
  select splash_id, ripple_id, created_at, d_start, d_end, anchor, reach, brk,
         sum(brk) over (partition by splash_id order by d_start, d_end, ripple_id nulls first
                        rows unbounded preceding) as cl
    from breaks;

  for s in select distinct splash_id from inherit_clusters where ripple_id is not null loop
    -- The cluster that keeps the splash: the declared range's when blocks
    -- sit in it, else the one with the most blocks, the earliest on a tie.
    -- A declared range with no block near it gives way to its blocks: an
    -- empty post would be no post at all.
    select cl into keep
      from inherit_clusters
     where splash_id = s.splash_id
     group by cl
     having count(ripple_id) > 0
     order by bool_or(anchor) desc, count(ripple_id) desc, min(d_start)
     limit 1;

    for c in
      select cl, min(d_start) as lo, max(d_end) as hi, min(created_at) as first_at
        from inherit_clusters
       where splash_id = s.splash_id
       group by cl
      having count(ripple_id) > 0
       order by cl
    loop
      if c.cl = keep then
        sid := s.splash_id;
      else
        sid := public._inherit_split_from(s.splash_id, null, c.first_at);
        update public.ripples x
           set splash_id = sid
          from inherit_clusters k
         where k.splash_id = s.splash_id and k.cl = c.cl and k.ripple_id is not null
           and (x.id = k.ripple_id or x.parent_ripple_id = k.ripple_id);
      end if;
      update public.splashes
         set declared_start = c.lo,
             declared_end = case when c.hi > c.lo then c.hi end
       where id = sid
         and (declared_start is distinct from c.lo
              or coalesce(declared_end, declared_start) is distinct from c.hi);
    end loop;
  end loop;

  -- A splash with no blocks and no date rests on the day it was made.
  update public.splashes set declared_start = written_on where declared_start is null;

  perform set_config('weming.inherit_backfill', 'off', true);
end;
$$;

revoke execute on function public._inherit_post_title(text) from public, anon, authenticated;
revoke execute on function public._inherit_split_from(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public._inherit_backfill() from public, anon, authenticated;

select public._inherit_backfill();
