-- 0051: a piece's layer may go under the others (2026-10-27).
-- Additive: _layout_group only accepts more than before (piece.layer, a
-- whole number, 0-5 becomes -20-20), so every stored layout stays valid and
-- nothing is rewritten. Every other range is 0050's, unchanged.
--
-- Yoonji, in the session: the toolbar's layer buttons (Bring forward, Send
-- backward, Bring to front, Send to back) write the existing layer field.
-- Unset is 0, so a piece sent backward past another, or to the back of the
-- view, needs a layer under 0.

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
