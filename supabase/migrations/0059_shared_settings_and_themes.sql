-- 0059: a pool's name, photo and colour are its members'; my theme is mine
-- alone (2026-10-28).
--
-- Planned and approved in the session (the unified header and settings):
--   - "Name and photo: any current member can edit (this changes the
--     earlier creator-only rule)."
--   - "pools.theme (nullable) writable by current members;
--     member_pool_settings (pool, user, theme nullable ...) owner-only;
--     ... a settings table for my Home color and the apply-everywhere flag
--     (keep it out of fields pool companions can read)."
--   - "Show on my Home" stays pool_members.on_home (0039): "OK on all three
--     decisions."
--
-- Effective theme in a pool (lib/theme.ts, resolveTheme): my colour here ??
-- my Home colour if I apply it everywhere ?? the pool's colour ?? my Home
-- colour ?? the app's. Mode stays one personal choice.
--
-- My theme moves out of profiles, which pool companions can read (0010):
-- my_theme_settings is mine alone, backfilled from profiles. The app reads
-- it from here on; profiles.theme_color and theme_mode stay, unread, until a
-- later contract migration drops them (that DROP will ask for approval).
--
-- Additive: two tables, one column, functions replaced with the creator
-- check taken out (rename_pool, set_pool_photo), new functions, and storage
-- policies added beside the creator's (permissive, so they only widen).
-- Delete and the members' notification defaults stay the creator's.

-- ---------------------------------------------------------------------------
-- the colours, once
-- ---------------------------------------------------------------------------

create function public._theme_color_ok(c text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select c in (
    'red', 'orange', 'yellow', 'green', 'lime', 'sky', 'mint',
    'blue', 'purple', 'pink', 'brown', 'black'
  );
$$;

-- ---------------------------------------------------------------------------
-- a pool's colour: any current member sets or clears it
-- ---------------------------------------------------------------------------

alter table public.pools
  add column theme text,
  add constraint pools_theme check (theme is null or public._theme_color_ok(theme));

comment on column public.pools.theme is
  'The pool''s colour (0059): its members'' shared default, any current member''s to set or clear.';

create function public.set_pool_theme(p_pool uuid, p_theme text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_member(p_pool);
  if p_theme is not null and not public._theme_color_ok(p_theme) then
    raise exception 'no such colour' using errcode = '22023';
  end if;
  update public.pools set theme = p_theme where id = p_pool;
end;
$$;

-- ---------------------------------------------------------------------------
-- my colour in one pool: mine alone
-- ---------------------------------------------------------------------------

create table public.member_pool_settings (
  pool_id uuid not null references public.pools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  theme text,
  primary key (pool_id, user_id),
  constraint member_pool_settings_theme check (theme is null or public._theme_color_ok(theme))
);

comment on table public.member_pool_settings is
  'What I set for myself in one pool (0059): my colour there, over every other source. Mine alone.';

alter table public.member_pool_settings enable row level security;

create policy "my pool settings are mine"
  on public.member_pool_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_current_member(pool_id));

-- ---------------------------------------------------------------------------
-- my theme: mine alone, out of profiles
-- ---------------------------------------------------------------------------

create table public.my_theme_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  home_color text not null default 'blue',
  mode text not null default 'dark',
  -- My Home colour over every pool's, unless I chose one for that pool.
  apply_everywhere boolean not null default false,
  constraint my_theme_settings_color check (public._theme_color_ok(home_color)),
  constraint my_theme_settings_mode check (mode in ('dark', 'light', 'pastel'))
);

comment on table public.my_theme_settings is
  'My Home colour, my mode, and whether my colour applies in every pool (0059). Read by me alone, never by pool companions.';

alter table public.my_theme_settings enable row level security;

create policy "my theme is mine"
  on public.my_theme_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

insert into public.my_theme_settings (user_id, home_color, mode)
select id, theme_color, theme_mode from public.profiles
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- a pool's name and photo: any current member
-- ---------------------------------------------------------------------------

create or replace function public.rename_pool(p_pool uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_member(p_pool);
  update public.pools set name = btrim(p_name) where id = p_pool;
end;
$$;

create or replace function public.set_pool_photo(p_pool uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_member(p_pool);
  if p_on then
    if not exists (
      select 1 from storage.objects where bucket_id = 'pool-photos' and name = p_pool::text
    ) then
      raise exception 'no photo was uploaded for this pool' using errcode = 'P0002';
    end if;
    update public.pools
       set photo_path = p_pool::text, photo_version = coalesce(photo_version, 0) + 1
     where id = p_pool;
  else
    update public.pools set photo_path = null, photo_version = null where id = p_pool;
  end if;
end;
$$;

-- Whether I am in this pool now: the photo's storage test for members.
create function public.is_pool_member_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pool_members m
     where m.pool_id::text = object_name
       and m.user_id = auth.uid()
       and m.left_at is null
  );
$$;

create policy "a pool photo is written by a current member"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pool-photos' and public.is_pool_member_object(name));

create policy "a pool photo is replaced by a current member"
  on storage.objects for update to authenticated
  using (bucket_id = 'pool-photos' and public.is_pool_member_object(name))
  with check (bucket_id = 'pool-photos' and public.is_pool_member_object(name));

create policy "a pool photo is removed by a current member"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pool-photos' and public.is_pool_member_object(name));

create policy "a pool photo is seen by a current member"
  on storage.objects for select to authenticated
  using (bucket_id = 'pool-photos' and public.is_pool_member_object(name));

-- ---------------------------------------------------------------------------
-- grants (the 0026 pattern)
-- ---------------------------------------------------------------------------

revoke execute on function public._theme_color_ok(text) from public, anon;
revoke execute on function public.set_pool_theme(uuid, text) from public, anon;
revoke execute on function public.is_pool_member_object(text) from public, anon;
grant execute on function public._theme_color_ok(text) to authenticated;
grant execute on function public.set_pool_theme(uuid, text) to authenticated;
grant execute on function public.is_pool_member_object(text) to authenticated;
revoke all on table public.member_pool_settings from anon;
revoke all on table public.my_theme_settings from anon;
grant select, insert, update, delete on table public.member_pool_settings to authenticated;
grant select, insert, update, delete on table public.my_theme_settings to authenticated;
