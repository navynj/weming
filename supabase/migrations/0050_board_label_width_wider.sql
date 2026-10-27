-- 0050: a label's width reaches four column widths (2026-10-27).
-- Additive: _layout_group only accepts more than before (a label's width
-- 0.3-2 becomes 0.3-4), so every stored layout stays valid and nothing is
-- rewritten. Every other range is 0044's, unchanged.
--
-- Yoonji, in the session: labels get a width handle on the board (H31),
-- dragged to rewrap the title; it writes the existing label.width, the
-- panel's Width slider, rather than a second width field.

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
        when k = 'tilt' and kind in ('icon', 'label', 'photo', 'wave') then public._layout_number(v, -45, 45)
        when k = 'inline' and kind = 'icon' then jsonb_typeof(v) = 'boolean'
        when k = 'size' and kind = 'icon' then public._layout_number(v, 0.5, 8)
        when k = 'size' and kind = 'photo' then public._layout_number(v, 0.2, 2)
        when k = 'hidden' and kind = 'photo' then jsonb_typeof(v) = 'boolean'
        when k = 'fontSize' and kind = 'label' then
          public._layout_number(v, 10, 18) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        when k = 'width' and kind = 'label' then public._layout_number(v, 0.3, 4)
        when k = 'style' and kind = 'label' then
          jsonb_typeof(v) = 'string' and v #>> '{}' in ('white', 'ink')
        when k = 'layer' and kind = 'piece' then
          public._layout_number(v, 0, 5) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
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
