-- 0045: a layout per view — the Calendar's and the Lane view's (2026-10-27).
--
-- Yoonji, in the session: the Lane view draws posts with the Calendar's
-- pieces, and its layout values are its own — editing in one view never
-- changes the other. Home overrides and "Use pool layout" work per view.
--
-- Destructive DDL, approved by Yoonji in the session (as 0044; numbered 0045
-- when the hidden-photo and range change took 0044):
--   "Lane view layouts (0044): I approve recreating the two board_layouts
--   unique indexes to include view, and replacing set_board_layout with the
--   five-argument version that takes view, as you listed."
--
-- What changes:
--   board_layouts.view          added: 'calendar' or 'lane', default
--                               'calendar', so every existing row is the
--                               Calendar's (nothing is rewritten).
--   board_layouts_pool_once     recreated on (splash_id, pool_id, view).
--   board_layouts_home_once     recreated on (splash_id, user_id, view).
--   set_board_layout(4 args)    replaced by set_board_layout(…, p_view): a
--                               Home override in a view starts from the
--                               pool's layout in that same view.
-- Unchanged: the policies, the scope check, the validators, the stamp.
--
-- Works with the app in production and the app that follows it:
--   - production calls set_board_layout with four named arguments; p_view
--     defaults to 'calendar', so those calls reach the new function and keep
--     writing the Calendar's layouts;
--   - production reads board_layouts without a view; until the new app is
--     live there are only Calendar rows to read, since only the new app
--     writes view = 'lane', and the new app reads by view.

alter table public.board_layouts
  add column view text not null default 'calendar'
  constraint board_layouts_view check (view in ('calendar', 'lane'));

drop index public.board_layouts_pool_once;
create unique index board_layouts_pool_once
  on public.board_layouts (splash_id, pool_id, view) where scope = 'pool';
drop index public.board_layouts_home_once;
create unique index board_layouts_home_once
  on public.board_layouts (splash_id, user_id, view) where scope = 'home';

drop function public.set_board_layout(uuid, uuid, jsonb, text[]);

create function public.set_board_layout(
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
  if p_view is null or p_view not in ('calendar', 'lane') then
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

revoke execute on function public.set_board_layout(uuid, uuid, jsonb, text[], text) from public, anon;
grant execute on function public.set_board_layout(uuid, uuid, jsonb, text[], text) to authenticated;
