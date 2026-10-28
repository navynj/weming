-- 0058: a label's style is always mine to choose (2026-10-28).
--
-- Yoonji, in the session: "New layout field label.style: none, white, ink
-- or glass (glass = white at 20 percent fill with white text and a 1px
-- white outline at 30 percent, like range bands). Unset means the
-- automatic rule (joint records white or ink, others none). Any style can
-- be chosen for any record, joint or not. ... Migration (additive): widen
-- board_layout_valid for label.style."
--
-- label.style took white or ink (0027), on records with someone invited;
-- now any record takes none, white, ink or glass. The check lives in
-- _layout_group, which board_layout_valid calls for each group; replaced
-- here with only that value list widened (0055's otherwise), so every
-- stored layout stays valid and nothing is rewritten.

create or replace function public._layout_group(g jsonb, kind text)
 returns boolean
 language plpgsql
 immutable
 set search_path to ''
as $function$
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
        when k = 'x' then public._layout_number(v, -3, 3)
        when k = 'y' then public._layout_number(v, -20, 20)
        when k = 'tilt' and kind in ('icon', 'label', 'photo', 'video', 'wave') then public._layout_number(v, -45, 45)
        when k = 'inline' and kind = 'icon' then jsonb_typeof(v) = 'boolean'
        when k = 'size' and kind = 'icon' then public._layout_number(v, 0.5, 8)
        when k = 'size' and kind in ('photo', 'video') then public._layout_number(v, 0.2, 2)
        when k = 'hidden' and kind in ('photo', 'video', 'icon', 'label') then jsonb_typeof(v) = 'boolean'
        when k = 'fontSize' and kind = 'label' then
          public._layout_number(v, 10, 18) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        when k = 'width' and kind = 'label' then public._layout_number(v, 0.3, 4)
        when k = 'style' and kind = 'label' then
          jsonb_typeof(v) = 'string' and v #>> '{}' in ('none', 'white', 'ink', 'glass')
        when k = 'layer' and kind = 'piece' then
          public._layout_number(v, -20, 20) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        when k = 'on' and kind = 'wave' then jsonb_typeof(v) = 'boolean'
        when k = 'amp' and kind = 'wave' then public._layout_number(v, 1, 8)
        when k = 'length' and kind = 'wave' then public._layout_number(v, 8, 32)
        when k = 'weight' and kind = 'wave' then public._layout_number(v, 1, 4)
        when k = 'span' and kind = 'wave' then public._layout_number(v, 0.2, 4)
        else false
      end
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$function$;
