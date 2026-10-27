-- 0044: a photo hidden from the board; hand-set ranges widened (2026-10-27).
-- Additive: both functions only accept more than before, so every stored
-- layout stays valid and nothing is rewritten.
--
-- Yoonji, in the session:
--   - each photo gets "Show on board"; off is photos.<path>.hidden = true,
--     the photo gone from the board only (the card and the sheet keep it);
--   - sliders stay the only control, so they reach further: offsets X ±3
--     column widths and Y ±20 lines (label, icon, photo, wave and the whole
--     piece), tilt ±45°, icon size 0.5–8 lines, photo size 0.2–2 column
--     widths, the wave's length up to 4 label widths (its span).
-- Amplitude, wavelength, weight, a label's font size, width and fill, and
-- a piece's layer are unchanged.

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
        when k = 'width' and kind = 'label' then public._layout_number(v, 0.3, 2)
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

-- "photos.<path>.hidden" clears like any other photo field.
create or replace function public._board_layout_clear(l jsonb, paths text[])
 returns jsonb
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  out jsonb := coalesce(l, '{}'::jsonb);
  path text;
  m text[];
  k text;
begin
  foreach path in array coalesce(paths, '{}'::text[]) loop
    m := regexp_match(path, '^photos\.(.+)\.(size|x|y|tilt|hidden)$');
    if m is not null then
      out := out #- array['photos', m[1], m[2]];
    elsif path like 'photos.%' then
      out := out #- array['photos', substr(path, 8)];
    elsif position('.' in path) > 0 then
      out := out #- string_to_array(path, '.');
    else
      out := out - path;
    end if;
  end loop;
  -- A group left with nothing in it is gone, so only set fields remain.
  for k in select key from jsonb_each(out) loop
    if k = 'photos' then
      out := jsonb_set(
        out,
        '{photos}',
        coalesce(
          (select jsonb_object_agg(key, value) from jsonb_each(out -> 'photos') where value <> '{}'::jsonb),
          '{}'::jsonb
        )
      );
    end if;
    if out -> k = '{}'::jsonb then
      out := out - k;
    end if;
  end loop;
  return out;
end;
$function$;
