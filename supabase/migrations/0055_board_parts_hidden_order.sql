-- 0055: a post's icon and label can be hidden, its parts ordered, and its
-- videos laid out (2026-10-27).
--
-- Yoonji, in the session (planned and approved): "Each post can hide its
-- icon and/or its label on the board, like photos" — icon.hidden and
-- label.hidden; "Order within a post ... stored in the layout json" — a
-- top-level `order`, the post's parts back to front as keys (label, icon,
-- wave, photo:<media path>, video:<YouTube id>); "The order list must
-- hold every part a post can have (label, icon, wave, all photos and
-- videos), so cap it generously (for example 40)" — 40. And for YouTube
-- links (part 5): "videos are subparts with the same move, rotate,
-- resize, hide and order controls as photos, keyed by video id in the
-- layout json (widen validation in the part 3 migration)" — `videos`,
-- per id, a photo's fields.
--
-- Additive: _layout_group and board_layout_valid accept more than before,
-- so every stored layout stays valid and nothing is rewritten; the merge
-- takes videos per id as it takes photos; the clear tidies an emptied
-- video; the prune drops a removed photo from the order. Signatures are
-- unchanged.

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

create or replace function public.board_layout_valid(l jsonb)
 returns boolean
 language plpgsql
 immutable
 set search_path to ''
as $function$
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
    elsif k = 'videos' then
      -- Keyed by YouTube's eleven-character id.
      if jsonb_typeof(v) <> 'object' or (select count(*) from jsonb_object_keys(v)) > 20 then
        return false;
      end if;
      if exists (
        select 1 from jsonb_each(v) p
         where p.key !~ '^[A-Za-z0-9_-]{11}$' or not public._layout_group(p.value, 'video')
      ) then
        return false;
      end if;
    elsif k = 'order' then
      -- Back to front, each part once: every part a post can have, up to 40.
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 40 then
        return false;
      end if;
      if exists (
        select 1 from jsonb_array_elements(v) e
         where jsonb_typeof(e) <> 'string'
            or char_length(e #>> '{}') > 520
            or e #>> '{}' !~ '^(label|icon|wave|photo:.+|video:[A-Za-z0-9_-]{11})$'
      ) or (select count(distinct e) from jsonb_array_elements(v) e) <> jsonb_array_length(v) then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$function$;

-- Photos and now videos per key, then per field; `order` replaced whole.
create or replace function public._board_layout_merge(base jsonb, patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  out jsonb := coalesce(base, '{}'::jsonb);
  k text;
  v jsonb;
  p text;
  pv jsonb;
  inner_map jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(patch, '{}'::jsonb)) loop
    if k in ('photos', 'videos') and jsonb_typeof(v) = 'object' then
      inner_map := coalesce(out -> k, '{}'::jsonb);
      for p, pv in select * from jsonb_each(v) loop
        inner_map := jsonb_set(inner_map, array[p], coalesce(inner_map -> p, '{}'::jsonb) || pv, true);
      end loop;
      out := jsonb_set(out, array[k], inner_map, true);
    elsif jsonb_typeof(v) = 'object' then
      out := jsonb_set(out, array[k], coalesce(out -> k, '{}'::jsonb) || v, true);
    else
      out := jsonb_set(out, array[k], v, true);
    end if;
  end loop;
  return out;
end;
$$;

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
      -- icon.hidden, label.hidden, videos.<id>, videos.<id>.<field>: ids hold no dots.
      out := out #- string_to_array(path, '.');
    else
      out := out - path;
    end if;
  end loop;
  for k in select key from jsonb_each(out) loop
    if k in ('photos', 'videos') then
      out := jsonb_set(
        out,
        array[k],
        coalesce(
          (select jsonb_object_agg(key, value) from jsonb_each(out -> k) where value <> '{}'::jsonb),
          '{}'::jsonb
        )
      );
    end if;
    if out -> k = '{}'::jsonb or out -> k = '[]'::jsonb then
      out := out - k;
    end if;
  end loop;
  return out;
end;
$function$;

-- A photo the post no longer carries leaves its layout and its place in the order.
create or replace function public._board_layout_prune(l jsonb, media text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with photos as (
    select case
      when l ? 'photos' then
        case
          when exists (select 1 from jsonb_object_keys(l -> 'photos') k where k = any (media)) then
            jsonb_set(
              l,
              '{photos}',
              (select jsonb_object_agg(key, value) from jsonb_each(l -> 'photos') where key = any (media))
            )
          else l - 'photos'
        end
      else l
    end as l
  )
  select case
    when p.l ? 'order' then
      jsonb_set(
        p.l,
        '{order}',
        coalesce(
          (select jsonb_agg(e order by n)
             from jsonb_array_elements(p.l -> 'order') with ordinality as o(e, n)
            where e #>> '{}' not like 'photo:%' or substr(e #>> '{}', 7) = any (media)),
          '[]'::jsonb
        )
      )
    else p.l
  end
  from photos p;
$$;
