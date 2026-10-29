-- 0066: a label's fifth style, Outline (2026-10-29).
--
-- Yoonji, in the session: "지정 가능한 라벨 스타일에 테마색상, 흰색상(검은색상),
-- 아웃라인, 반투명, 배경없음 이렇게 다섯 가지". The stored values keep their
-- meaning — white is the theme-colour style, ink white or black, glass the
-- translucent one, none no fill — and outline is new: on the dark ground the
-- ground's colour with a white edge and words, on the light ground white with
-- the theme colour's edge and words (H55).
--
-- Additive: the layout check accepts one more value; nothing stored changes.

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
          jsonb_typeof(v) = 'string' and v #>> '{}' in ('none', 'white', 'ink', 'outline', 'glass')
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
