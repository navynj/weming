-- 0040: Sharing model v2, contract (2026-10-26; _docs/SHARING-V2.md §3).
--
-- The app has run on v2 since #13 (0033–0035): nothing reads a link's
-- direction, writes the old link shape, or calls the old functions. This
-- removes them. Planned as 0034 and later 0036; the theme's Pastel took
-- 0036 and 0037–0039 followed, so the contract is 0040.
--
-- Destructive DDL, approved by Yoonji in the session, quoted:
--   "I approve migration 0040 (Sharing v2 contract) as you listed it:
--   dropping the lane_mappings_one_per_pool_lane constraint, the
--   lane_mappings_one_sender index, the lane_mappings.direction column and
--   its type lane_link_direction, restricting _set_links to the marker
--   shape, and dropping the functions splash_to_just_mine, _sending_lane,
--   _joint_lane_for, _place_history, invite_lanes, splash_reaction_summary,
--   splash_reply_preview, create_joint_splash, splash_to_joint,
--   splash_to_pool_record, _inherit_backfill, _inherit_split_from and
--   _inherit_post_title."
--
-- 1. Links lose their direction. _set_links takes only the marker shape
--    (the old app's direction shape is gone with the old app), then:
--      lane_mappings_one_per_pool_lane (0009) — one lane of mine per pool
--        lane: many-to-many links (SHARING-V2 §0) need it gone;
--      lane_mappings_one_sender (0019) — one "out" link per lane;
--      lane_mappings.direction, and its type lane_link_direction.
-- 2. Functions nothing calls:
--      splash_to_just_mine, _sending_lane, _joint_lane_for — v1 sharing;
--      _place_history — "include my earlier records", retired (decision 5);
--      invite_lanes — join-time lane matching, retired;
--      splash_reaction_summary, splash_reply_preview — the board's reaction
--        badge and reply lines, removed with them (H25 amended);
--      create_joint_splash, splash_to_joint — the old app's calls, kept as
--        Everyone-on wrappers through the 0033 window;
--      splash_to_pool_record — retired before it was used ("Make it mine"
--        is on Home only, 0034);
--      _inherit_backfill, _inherit_split_from, _inherit_post_title — H24's
--        expand helpers (0028), unused since 0029.
-- No row is deleted. Links keep every marker; placements, records and
-- ripples are untouched.

-- ---------------------------------------------------------------------------
-- links: the marker shape alone
-- ---------------------------------------------------------------------------

-- p_links: [{pool_lane_id, my_category_id, is_default?, share_by_default?,
-- is_home?}], the whole set for this pool. Unlinking changes defaults and
-- display only (0033).
create or replace function public._set_links(pid uuid, uid uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link jsonb;
  plid uuid;
  cid uuid;
  mid uuid;
  wants_default boolean;
begin
  if p_links is not null and jsonb_typeof(p_links) <> 'array' then
    raise exception 'links must be an array' using errcode = '22023';
  end if;

  -- Gone: every link not in the set ("Don't connect" is a null lane).
  delete from public.lane_mappings m
   where m.pool_id = pid and m.user_id = uid
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) e
        where (e ->> 'pool_lane_id')::uuid = m.pool_lane_id
          and nullif(e ->> 'my_category_id', '')::uuid = m.my_category_id
     );

  -- Markers cleared, then set row by row: the partial unique indexes check
  -- each row as it is written.
  update public.lane_mappings
     set is_default = false, share_by_default = null, is_home = false
   where pool_id = pid and user_id = uid
     and (is_default or is_home);

  for link in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    plid := (link ->> 'pool_lane_id')::uuid;
    cid := nullif(link ->> 'my_category_id', '')::uuid;
    if cid is null then
      continue;
    end if;
    if not exists (select 1 from public.pool_lanes where id = plid and pool_id = pid) then
      raise exception 'pool lane % is not in this pool', plid using errcode = '42501';
    end if;
    if not exists (select 1 from public.my_categories where id = cid and user_id = uid) then
      raise exception 'lane % is not yours', cid using errcode = '42501';
    end if;

    insert into public.lane_mappings (user_id, my_category_id, pool_lane_id, pool_id)
    values (uid, cid, plid, pid)
    on conflict (my_category_id, pool_lane_id) do update set pool_id = excluded.pool_id
    returning id into mid;

    wants_default := coalesce((link ->> 'is_default')::boolean, false);
    update public.lane_mappings
       set is_home = coalesce((link ->> 'is_home')::boolean, false),
           is_default = wants_default,
           share_by_default = case when wants_default
                                   then coalesce((link ->> 'share_by_default')::boolean, false)
                              end
     where id = mid;
  end loop;
  -- A (my lane, pool) left with no default gets its oldest link, at commit.
end;
$$;

alter table public.lane_mappings drop constraint lane_mappings_one_per_pool_lane;
drop index public.lane_mappings_one_sender;
alter table public.lane_mappings drop column direction;
drop type public.lane_link_direction;

-- ---------------------------------------------------------------------------
-- functions nothing calls
-- ---------------------------------------------------------------------------

drop function public.splash_to_just_mine(uuid, uuid);
drop function public._sending_lane(uuid, uuid, uuid);
drop function public._joint_lane_for(uuid, uuid);
drop function public._place_history(uuid, uuid);
drop function public.invite_lanes(text);
drop function public.splash_reaction_summary(uuid[]);
drop function public.splash_reply_preview(uuid[]);
drop function public.create_joint_splash(uuid, uuid, uuid, text, text, date);
drop function public.splash_to_joint(uuid, uuid);
drop function public.splash_to_pool_record(uuid);
drop function public._inherit_backfill();
drop function public._inherit_split_from(uuid, uuid, timestamp with time zone);
drop function public._inherit_post_title(text);
