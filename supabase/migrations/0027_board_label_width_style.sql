-- 0027: a label's width and style and an icon's tilt, set by hand (2026-10-26).
--
-- Yoonji, in the session: "label width도 레이아웃 슬라이더에 있어야할 듯"
-- and "그리고 라벨 스타일도 (어떤 컬러인지)", then "아이콘 틸트도 있어야 함".
-- icon.tilt is ±15°, as the label's; label.width is a share of
-- the lane, 0.3–2 (narrower than it, or across the next); label.style is
-- a filled label's fill, 'white' or 'ink' — no fill is another kind of
-- label, not a style to switch to (Yoonji: "바꿀 수 있는 건 white냐 ink냐만").
--
-- Additive: _layout_group accepts three more keys; every row 0025 accepted
-- it still accepts. The grants are 0026's, given again since a replaced
-- function keeps them but this file says so on its own.

create or replace function public._layout_group(g jsonb, kind text)
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
        when k = 'tilt' and kind in ('icon', 'label', 'photo', 'wave') then public._layout_number(v, -15, 15)
        when k = 'inline' and kind = 'icon' then jsonb_typeof(v) = 'boolean'
        when k = 'size' and kind = 'icon' then public._layout_number(v, 0.8, 4)
        when k = 'size' and kind = 'photo' then public._layout_number(v, 0.3, 1)
        when k = 'fontSize' and kind = 'label' then
          public._layout_number(v, 10, 18) and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        when k = 'width' and kind = 'label' then public._layout_number(v, 0.3, 2)
        when k = 'style' and kind = 'label' then
          jsonb_typeof(v) = 'string' and v #>> '{}' in ('white', 'ink')
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

revoke execute on function public._layout_group(jsonb, text) from public, anon;
grant execute on function public._layout_group(jsonb, text) to authenticated;
