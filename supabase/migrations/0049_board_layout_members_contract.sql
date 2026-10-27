-- 0049: the Swimmers view's layouts are stored as 'members' — contract
-- (2026-10-27). Ships in a release after 0048's app is live, never with it.
--
-- Destructive DDL and a data change, approved by Yoonji in the session:
--   "I approve renaming the Swimmers layout view to members: 0048 widening the
--   board_layouts_view check and set_board_layout to accept 'members', and
--   0049, in a later release, moving any 'swimmers' rows to 'members' and
--   narrowing both to drop 'swimmers'."
--
-- 1. A 'swimmers' row whose splash and scope already have a 'members' row is
--    dropped (the app has read the 'members' one since 0048); every other
--    'swimmers' row becomes 'members'.
-- 2. The check is dropped and added back without 'swimmers'; set_board_layout
--    refuses it.

delete from public.board_layouts s
 where s.view = 'swimmers'
   and exists (
     select 1 from public.board_layouts m
      where m.view = 'members'
        and m.splash_id = s.splash_id
        and m.scope = s.scope
        and m.pool_id is not distinct from s.pool_id
        and m.user_id is not distinct from s.user_id
   );
update public.board_layouts set view = 'members' where view = 'swimmers';

alter table public.board_layouts drop constraint board_layouts_view;
alter table public.board_layouts
  add constraint board_layouts_view check (view in ('calendar', 'lane', 'members'));

create or replace function public.set_board_layout(
  p_splash uuid,
  p_pool uuid,
  p_patch jsonb,
  p_clear text[] default '{}'::text[],
  p_view text default 'calendar'
)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
  if p_view is null or p_view not in ('calendar', 'lane', 'members') then
    raise exception 'no such view' using errcode = '22023';
  end if;
  if p_pool is null then
    select bl.layout into start
      from public.board_layouts bl
      join public.splashes s on s.id = bl.splash_id
     where bl.splash_id = p_splash
       and bl.scope = 'pool'
       and bl.view = p_view
       and s.owner_id is null
       and bl.pool_id = s.pool_id;
    insert into public.board_layouts (splash_id, scope, user_id, layout, view)
    values (p_splash, 'home', uid, coalesce(start, '{}'::jsonb), p_view)
    on conflict (splash_id, user_id, view) where scope = 'home' do nothing;
    select layout into cur from public.board_layouts
     where splash_id = p_splash and scope = 'home' and user_id = uid and view = p_view
       for update;
  else
    insert into public.board_layouts (splash_id, scope, pool_id, layout, view)
    values (p_splash, 'pool', p_pool, '{}'::jsonb, p_view)
    on conflict (splash_id, pool_id, view) where scope = 'pool' do nothing;
    select layout into cur from public.board_layouts
     where splash_id = p_splash and scope = 'pool' and pool_id = p_pool and view = p_view
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
     where splash_id = p_splash and scope = 'home' and user_id = uid and view = p_view;
  else
    update public.board_layouts set layout = nxt
     where splash_id = p_splash and scope = 'pool' and pool_id = p_pool and view = p_view;
  end if;
  return nxt;
end;
$function$;
