-- 0062: a colour and its mode are one choice (Yoonji, in the session, 2026-10-28)
--
-- 0059 kept the mode always mine, one for everywhere. A pool's colour and
-- my colour in a pool now each carry a mode: "colour + mode is one choice".
-- Both columns are nullable; a colour with no mode wears my Home mode, as
-- every row written before this does.
--
-- Expand only: two nullable columns and a new three-argument
-- set_pool_theme beside 0059's, which the app in production still calls and
-- which leaves the mode as it is. Nothing is dropped or narrowed.

alter table public.pools
  add column theme_mode text,
  add constraint pools_theme_mode
    check (theme_mode is null or theme_mode in ('dark', 'light', 'pastel'));

comment on column public.pools.theme_mode is
  'The mode worn with the pool''s colour (0062); null wears each member''s Home mode.';

alter table public.member_pool_settings
  add column theme_mode text,
  add constraint member_pool_settings_theme_mode
    check (theme_mode is null or theme_mode in ('dark', 'light', 'pastel'));

comment on column public.member_pool_settings.theme_mode is
  'The mode worn with my colour in this pool (0062); null wears my Home mode.';

-- The pool's colour with its mode, any current member's to set or clear;
-- cleared, the colour takes its mode with it.
create function public.set_pool_theme(p_pool uuid, p_theme text, p_mode text)
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
  if p_mode is not null and p_mode not in ('dark', 'light', 'pastel') then
    raise exception 'no such mode' using errcode = '22023';
  end if;
  update public.pools
    set theme = p_theme,
        theme_mode = case when p_theme is null then null else p_mode end
    where id = p_pool;
end;
$$;

revoke execute on function public.set_pool_theme(uuid, text, text) from public, anon;
grant execute on function public.set_pool_theme(uuid, text, text) to authenticated;
