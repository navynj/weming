-- 0047: a pool's Swimmers view keeps a layout of its own (2026-10-27).
--
-- Yoonji, in the session: Swimmers is decorated too, with the same panel; its
-- values are its own, apart from the Calendar's and the Lane view's (0045).
--
-- Destructive DDL, approved by Yoonji in the session:
--   "I approve migration 0047: dropping and re-adding the board_layouts_view
--   check constraint to allow 'swimmers', and replacing set_board_layout's
--   view check to accept it."
--
-- A check cannot be edited in place, so it is dropped and added back wider,
-- in this one transaction: every existing row ('calendar' or 'lane') passes
-- the new check. No row, column, index or policy changes. Works with the app
-- in production, which never writes 'swimmers'.

alter table public.board_layouts drop constraint board_layouts_view;
alter table public.board_layouts
  add constraint board_layouts_view check (view in ('calendar', 'lane', 'swimmers'));

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
  if p_view is null or p_view not in ('calendar', 'lane', 'swimmers') then
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
