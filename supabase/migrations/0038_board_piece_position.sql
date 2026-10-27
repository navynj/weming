-- 0038: a board piece moved whole, and its layer (2026-10-27).
--
-- Yoonji, in the session: on the calendar, a piece moves as one — label,
-- icon, photos, wave and slot together, X and Y — and sits over or under
-- the pieces it meets, by a layer (0–5, higher on top). Stored as one more
-- group of a layout, `piece` {x, y, layer}, beside icon, label, photos and
-- wave; x and y take the ranges every part's offset takes. The merge and the
-- clears are generic already; only the validator learns the group.
--
-- Additive: two functions replaced, each accepting more than before;
-- every stored layout stays valid.

create or replace function public._layout_group(g jsonb, kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
        when k = 'tilt' and kind in ('icon', 'label', 'photo', 'wave') then public._layout_number(v, -15, 15)
        when k = 'inline' and kind = 'icon' then jsonb_typeof(v) = 'boolean'
        when k = 'size' and kind = 'icon' then public._layout_number(v, 0.8, 4)
        when k = 'size' and kind = 'photo' then public._layout_number(v, 0.3, 1)
        when k = 'fontSize' and kind = 'label' then
          public._layout_number(v, 10, 18) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        when k = 'width' and kind = 'label' then public._layout_number(v, 0.3, 2)
        when k = 'style' and kind = 'label' then
          jsonb_typeof(v) = 'string' and v #>> '{}' in ('white', 'ink')
        when k = 'layer' and kind = 'piece' then
          public._layout_number(v, 0, 5) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
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
$function$;

create or replace function public.board_layout_valid(l jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  k text;
  v jsonb;
begin
  if l is null or jsonb_typeof(l) <> 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each(l) loop
    if k in ('piece', 'icon', 'label', 'wave') then
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
$function$;
