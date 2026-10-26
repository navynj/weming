-- 0025: the calendar's layouts, set by hand (2026-10-26).
--
-- A person can move a splash's pieces on the calendar: its icon, its
-- label, each photo, and a wave drawn under it. Only the fields they set
-- are stored; everything else stays the automatic recipe.
--
-- Two scopes. A pool layout belongs to a pool: any current member reads
-- and writes it for any splash in that pool, one shared layout per
-- (splash, pool), last write wins per field. A Home layout belongs to one
-- person: theirs alone. While a person has a Home layout for a splash,
-- their Home ignores the pool layout entirely (Yoonji, in the session,
-- "OK on both decisions"); it starts as a copy of the pool layout, and
-- "Use pool layout" deletes it. Both stay when a member leaves.
--
-- Units: X is a share of the column's width, Y is in line heights, so a
-- layout reads the same in Week, Month and on a phone.
--
-- Additive: one table, its policies, a trigger, and functions.

create table public.board_layouts (
  id uuid primary key default gen_random_uuid(),
  splash_id uuid not null references public.splashes (id) on delete cascade,
  scope text not null,
  pool_id uuid references public.pools (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint board_layouts_scope check (
    (scope = 'pool' and pool_id is not null and user_id is null)
    or (scope = 'home' and user_id is not null and pool_id is null)
  )
);

create unique index board_layouts_pool_once
  on public.board_layouts (splash_id, pool_id) where scope = 'pool';
create unique index board_layouts_home_once
  on public.board_layouts (splash_id, user_id) where scope = 'home';
create index board_layouts_pool on public.board_layouts (pool_id) where scope = 'pool';
create index board_layouts_user on public.board_layouts (user_id) where scope = 'home';

-- ---------------------------------------------------------------------------
-- The shape: only known keys, the right types, within range.
-- ---------------------------------------------------------------------------

create function public._layout_number(v jsonb, lo numeric, hi numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is not null
     and jsonb_typeof(v) = 'number'
     and (v #>> '{}')::numeric between lo and hi;
$$;

-- An object whose keys are all known, each passing its own check.
create function public._layout_group(g jsonb, kind text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if g is null or jsonb_typeof(g) <> 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each(g) loop
    if not (
      case
        when k = 'x' then public._layout_number(v, -0.6, 0.6)
        when k = 'y' then public._layout_number(v, -6, 6)
        when k = 'tilt' and kind in ('label', 'photo', 'wave') then public._layout_number(v, -15, 15)
        when k = 'inline' and kind = 'icon' then jsonb_typeof(v) = 'boolean'
        when k = 'size' and kind = 'icon' then public._layout_number(v, 0.8, 4)
        when k = 'size' and kind = 'photo' then public._layout_number(v, 0.3, 1)
        when k = 'fontSize' and kind = 'label' then
          public._layout_number(v, 10, 18) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        when k = 'on' and kind = 'wave' then jsonb_typeof(v) = 'boolean'
        when k = 'amp' and kind = 'wave' then public._layout_number(v, 1, 8)
        when k = 'length' and kind = 'wave' then public._layout_number(v, 8, 32)
        when k = 'weight' and kind = 'wave' then public._layout_number(v, 1, 4)
        when k = 'span' and kind = 'wave' then public._layout_number(v, 0.2, 2)
        else false
      end
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function public.board_layout_valid(l jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if l is null or jsonb_typeof(l) <> 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each(l) loop
    if k in ('icon', 'label', 'wave') then
      if not public._layout_group(v, k) then
        return false;
      end if;
    elsif k = 'photos' then
      if jsonb_typeof(v) <> 'object' or (select count(*) from jsonb_object_keys(v)) > 20 then
        return false;
      end if;
      if exists (select 1 from jsonb_each(v) p where not public._layout_group(p.value, 'photo')) then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.board_layouts
  add constraint board_layouts_layout_valid check (public.board_layout_valid(layout));

-- ---------------------------------------------------------------------------
-- A row stays where it was made; it says who touched it last.
-- ---------------------------------------------------------------------------

create function public.stamp_board_layout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.splash_id <> old.splash_id
    or new.scope <> old.scope
    or new.pool_id is distinct from old.pool_id
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'a layout stays with its splash and its owner' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger stamp_board_layout
  before insert or update on public.board_layouts
  for each row execute function public.stamp_board_layout();

-- ---------------------------------------------------------------------------
-- Who reads and writes.
-- ---------------------------------------------------------------------------

-- The splash belongs to this pool: its own joint splash, or a personal one
-- placed and shared there.
create function public.splash_in_pool(sid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.splashes s
     where s.id = sid and s.owner_id is null and s.pool_id = pid
  ) or exists (
    select 1 from public.splash_placements p
     where p.splash_id = sid and p.pool_id = pid and p.shared
  );
$$;

revoke execute on function public.splash_in_pool(uuid, uuid) from public, anon;
grant execute on function public.splash_in_pool(uuid, uuid) to authenticated;

alter table public.board_layouts enable row level security;

create policy "pool layouts are read by current members"
  on public.board_layouts for select
  using (scope = 'pool' and public.is_current_member(pool_id) and public.splash_in_pool(splash_id, pool_id));

create policy "pool layouts are written by current members"
  on public.board_layouts for insert
  with check (scope = 'pool' and public.is_current_member(pool_id) and public.splash_in_pool(splash_id, pool_id));

create policy "pool layouts are changed by current members"
  on public.board_layouts for update
  using (scope = 'pool' and public.is_current_member(pool_id) and public.splash_in_pool(splash_id, pool_id))
  with check (scope = 'pool' and public.is_current_member(pool_id) and public.splash_in_pool(splash_id, pool_id));

create policy "pool layouts are reset by current members"
  on public.board_layouts for delete
  using (scope = 'pool' and public.is_current_member(pool_id) and public.splash_in_pool(splash_id, pool_id));

-- A Home layout is its person's alone, for a splash they can see.
create policy "home layouts are read by their person"
  on public.board_layouts for select
  using (scope = 'home' and user_id = auth.uid());

create policy "home layouts are written by their person"
  on public.board_layouts for insert
  with check (
    scope = 'home'
    and user_id = auth.uid()
    and exists (select 1 from public.splashes s where s.id = splash_id)
  );

create policy "home layouts are changed by their person"
  on public.board_layouts for update
  using (scope = 'home' and user_id = auth.uid())
  with check (scope = 'home' and user_id = auth.uid());

create policy "home layouts are removed by their person"
  on public.board_layouts for delete
  using (scope = 'home' and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Writing: a deep merge, dotted clears, photos pruned to what exists.
-- ---------------------------------------------------------------------------

-- icon, label and wave merge field by field; photos per media path, then
-- per field. jsonb || alone would replace a whole group.
create function public._board_layout_merge(base jsonb, patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  out jsonb := coalesce(base, '{}'::jsonb);
  k text;
  v jsonb;
  p text;
  pv jsonb;
  photos jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(patch, '{}'::jsonb)) loop
    if k = 'photos' and jsonb_typeof(v) = 'object' then
      photos := coalesce(out -> 'photos', '{}'::jsonb);
      for p, pv in select * from jsonb_each(v) loop
        photos := jsonb_set(photos, array[p], coalesce(photos -> p, '{}'::jsonb) || pv, true);
      end loop;
      out := jsonb_set(out, '{photos}', photos, true);
    elsif jsonb_typeof(v) = 'object' then
      out := jsonb_set(out, array[k], coalesce(out -> k, '{}'::jsonb) || v, true);
    else
      out := jsonb_set(out, array[k], v, true);
    end if;
  end loop;
  return out;
end;
$$;

-- Dotted paths: "wave", "icon.size", "photos.<media path>",
-- "photos.<media path>.tilt". A media path holds dots of its own, so a
-- photo's field is read off the end, from the fields a photo has.
create function public._board_layout_clear(l jsonb, paths text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  out jsonb := coalesce(l, '{}'::jsonb);
  path text;
  m text[];
  k text;
begin
  foreach path in array coalesce(paths, '{}'::text[]) loop
    m := regexp_match(path, '^photos\.(.+)\.(size|x|y|tilt)$');
    if m is not null then
      out := out #- array['photos', m[1], m[2]];
    elsif path like 'photos.%' then
      out := out #- array['photos', substr(path, 8)];
    elsif position('.' in path) > 0 then
      out := out #- string_to_array(path, '.');
    else
      out := out - path;
    end if;
  end loop;
  -- A group left with nothing in it is gone, so only set fields remain.
  for k in select key from jsonb_each(out) loop
    if k = 'photos' then
      out := jsonb_set(
        out,
        '{photos}',
        coalesce(
          (select jsonb_object_agg(key, value) from jsonb_each(out -> 'photos') where value <> '{}'::jsonb),
          '{}'::jsonb
        )
      );
    end if;
    if out -> k = '{}'::jsonb then
      out := out - k;
    end if;
  end loop;
  return out;
end;
$$;

-- Photos keyed by a media path no ripple on the splash carries are dropped.
create function public._board_layout_prune(l jsonb, media text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when l ? 'photos' then
      case
        when exists (select 1 from jsonb_object_keys(l -> 'photos') k where k = any (media)) then
          jsonb_set(
            l,
            '{photos}',
            (select jsonb_object_agg(key, value) from jsonb_each(l -> 'photos') where key = any (media))
          )
        else l - 'photos'
      end
    else l
  end;
$$;

-- The one way a layout is written. p_pool set: the pool's layout; null: my
-- Home layout, which starts as a copy of the pool's for a joint splash.
-- Invoker: the policies above decide who may.
create function public.set_board_layout(
  p_splash uuid,
  p_pool uuid,
  p_patch jsonb,
  p_clear text[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- auth.uid() itself: _require_uid is the definer functions' alone (0011).
  uid uuid := auth.uid();
  start jsonb := '{}'::jsonb;
  cur jsonb;
  nxt jsonb;
  media text[];
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_pool is null then
    select bl.layout into start
      from public.board_layouts bl
      join public.splashes s on s.id = bl.splash_id
     where bl.splash_id = p_splash
       and bl.scope = 'pool'
       and s.owner_id is null
       and bl.pool_id = s.pool_id;
    insert into public.board_layouts (splash_id, scope, user_id, layout)
    values (p_splash, 'home', uid, coalesce(start, '{}'::jsonb))
    on conflict (splash_id, user_id) where scope = 'home' do nothing;
    select layout into cur from public.board_layouts
     where splash_id = p_splash and scope = 'home' and user_id = uid
       for update;
  else
    insert into public.board_layouts (splash_id, scope, pool_id, layout)
    values (p_splash, 'pool', p_pool, '{}'::jsonb)
    on conflict (splash_id, pool_id) where scope = 'pool' do nothing;
    select layout into cur from public.board_layouts
     where splash_id = p_splash and scope = 'pool' and pool_id = p_pool
       for update;
  end if;

  if cur is null then
    raise exception 'that layout is not yours to set' using errcode = '42501';
  end if;

  select coalesce(array_agg(m), '{}'::text[]) into media
    from public.ripples r, unnest(r.media) m
   where r.splash_id = p_splash;

  nxt := public._board_layout_prune(
    public._board_layout_clear(public._board_layout_merge(cur, p_patch), p_clear),
    media
  );

  if p_pool is null then
    update public.board_layouts set layout = nxt
     where splash_id = p_splash and scope = 'home' and user_id = uid;
  else
    update public.board_layouts set layout = nxt
     where splash_id = p_splash and scope = 'pool' and pool_id = p_pool;
  end if;
  return nxt;
end;
$$;

revoke execute on function public.set_board_layout(uuid, uuid, jsonb, text[]) from public, anon;
grant execute on function public.set_board_layout(uuid, uuid, jsonb, text[]) to authenticated;
