-- 0065: deleting my account (2026-10-28).
--
-- Planned and approved in the session (H53). Everything I wrote goes: my
-- records, my ripples on anyone's record (joint records included), my
-- replies and reactions, my lanes, layouts (Home overrides), filings,
-- settings, notifications to and from me, push subscriptions and the invite
-- links I made. What others wrote stays, by H46's rules, which run from the
-- profiles trigger (0061): a pool thread others wrote on a record of mine is
-- handed over as that pool's joint record, and what members said to my
-- ripples stays on a placeholder. A joint record left with no ripples at
-- all goes. Pool layouts I edited stay: they belong to the pool.
--
-- Ownership never blocks it (Yoonji: "Never blocked by ownership"): each
-- pool I own with other current members goes to the longest-standing of
-- them, with no notification ("No notification for automatic transfer on
-- account deletion"); a pool where I am the only current member is torn
-- down as delete_pool would, people's words going back to them.
--
-- One transaction for the rows (delete_my_account); the server action
-- removes my storage objects and then the auth user with the service role.
-- Run again it does nothing: with no profile there is nothing of mine.
--
-- My side of someone else's shared record (Yoonji, in the session: "when
-- my account is deleted, replies and reactions that others left on my
-- ripples on someone else's shared record must survive. Leave a 'This part
-- was removed' placeholder ripple in place of mine on that record, in the
-- same pool thread, carrying their replies and reactions, as H46 does
-- elsewhere"): the profiles trigger leaves one there for each ripple of
-- mine others answered, in its pool thread, and the pool reads it as it
-- reads a placeholder on a joint record — while the record is shared there.
--
-- Found while rehearsing: when a profile goes, its layouts' updated_by is
-- set null by the foreign key, and stamp_board_layout stamped that very
-- update with the deleted user's id again, a reference to no one that the
-- key's own action never checks. The stamp now leaves that update alone.
-- None dangle locally or, with no account ever deleted, in production.
--
-- Additive: four functions, and three functions' bodies replaced with their
-- signatures unchanged (ripple_in_my_pools widened for a placeholder only).

-- Who a pool goes to without `leaving`: its longest-standing current member
-- other than them (the earliest joined_at of their current stint).
create function public._pool_heir(pid uuid, leaving uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
    from public.pool_members m
   where m.pool_id = pid and m.left_at is null and m.user_id <> leaving
   order by m.joined_at, m.user_id
   limit 1;
$$;

-- What the confirm sheet lists: what goes, and each pool I own, handed to
-- whom or deleted.
create function public.account_deletion_preview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
begin
  return jsonb_build_object(
    'records', (select count(*) from public.splashes where owner_id = uid),
    'ripples', (select count(*) from public.ripples where author_id = uid),
    'replies', (select count(*) from public.ripple_replies where author_id = uid),
    'reactions', (select count(*) from public.ripple_reactions where user_id = uid),
    'photos', (select coalesce(sum(cardinality(media)), 0) from public.ripples where author_id = uid),
    'lanes', (select count(*) from public.my_categories where user_id = uid),
    'pools', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pool_id', p.id,
               'name', p.name,
               'heir_id', h.heir,
               'heir_name', pr.display_name
             ) order by p.name)
        from public.pools p
        cross join lateral (select public._pool_heir(p.id, uid) as heir) h
        left join public.profiles pr on pr.id = h.heir
       where p.owner_id = uid
    ), '[]'::jsonb)
  );
end;
$$;

create function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  pid uuid;
  heir uuid;
  handed jsonb := '[]'::jsonb;
  torn jsonb := '[]'::jsonb;
  photos jsonb := '[]'::jsonb;
  photo text;
  joints uuid[];
  counts jsonb;
  n integer;
begin
  if not exists (select 1 from public.profiles where id = uid) then
    return jsonb_build_object('deleted', false, 'counts', '{}'::jsonb,
                              'handed', handed, 'torn', torn, 'pool_photos', photos);
  end if;

  -- The pools I own: handed on, or torn down while my words are still here
  -- to go back with everyone else's.
  for pid in select id from public.pools where owner_id = uid order by created_at for update loop
    heir := public._pool_heir(pid, uid);
    if heir is not null then
      update public.pools set owner_id = heir where id = pid;
      handed := handed || jsonb_build_object('pool_id', pid, 'owner_id', heir);
    else
      select photo_path into photo from public.pools where id = pid;
      if photo is not null then photos := photos || to_jsonb(photo); end if;
      perform public._teardown_pool(pid);
      torn := torn || to_jsonb(pid);
    end if;
  end loop;

  -- What is mine, counted before it goes (the cascade from profiles).
  counts := jsonb_build_object(
    'splashes', (select count(*) from public.splashes where owner_id = uid),
    'ripples', (select count(*) from public.ripples where author_id = uid),
    'ripple_replies', (select count(*) from public.ripple_replies where author_id = uid),
    'ripple_reactions', (select count(*) from public.ripple_reactions where user_id = uid),
    'ripple_views', (select count(*) from public.ripple_views where viewer_id = uid),
    'my_categories', (select count(*) from public.my_categories where user_id = uid),
    'home_filing', (select count(*) from public.home_filing where user_id = uid),
    'board_layouts', (select count(*) from public.board_layouts where user_id = uid),
    'lane_mappings', (select count(*) from public.lane_mappings where user_id = uid),
    'joint_invitees', (select count(*) from public.joint_invitees where user_id = uid),
    'pool_members', (select count(*) from public.pool_members where user_id = uid),
    'pool_removed_members', (select count(*) from public.pool_removed_members where user_id = uid),
    'member_pool_settings', (select count(*) from public.member_pool_settings where user_id = uid),
    'member_notification_prefs', (select count(*) from public.member_notification_prefs where user_id = uid),
    'my_theme_settings', (select count(*) from public.my_theme_settings where user_id = uid),
    'notification_settings', (select count(*) from public.notification_settings where user_id = uid),
    'notifications', (select count(*) from public.notifications where recipient_id = uid or actor_id = uid),
    'push_subscriptions', (select count(*) from public.push_subscriptions where user_id = uid),
    'sessions', (select count(*) from public.sessions where owner_id = uid),
    'lists', (select count(*) from public.lists where owner_id = uid),
    'list_members', (select count(*) from public.list_members where member_id = uid),
    'links', (select count(*) from public.links where user_a = uid or user_b = uid)
  );

  -- The joint records I wrote on, to see which are left with nothing.
  select array_agg(distinct r.splash_id) into joints
    from public.ripples r
    join public.splashes s on s.id = r.splash_id
   where r.author_id = uid and s.owner_id is null;

  -- Kept as set null otherwise: the links I made go with me.
  delete from public.pool_invites where created_by = uid;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('pool_invites', n);

  -- The rest is the cascade, after the hand-over trigger (0061) has run.
  delete from public.profiles where id = uid;
  counts := counts || jsonb_build_object('profiles', 1);

  -- A joint record left with no ripples at all goes; one holding a
  -- placeholder others answered stays.
  delete from public.splashes s
   where s.id = any(coalesce(joints, '{}'))
     and s.owner_id is null
     and not exists (select 1 from public.ripples r where r.splash_id = s.id);
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('empty_joint_splashes', n);

  return jsonb_build_object('deleted', true, 'counts', counts,
                            'handed', handed, 'torn', torn, 'pool_photos', photos);
end;
$$;

-- A placeholder in my thread ripple's place on someone's record: no author,
-- no words, no media, my ripple's day and moment, in its pool thread; the
-- replies and reactions others left there move onto it, with what they
-- notified. As _leave_placeholder (0061), with the thread kept.
create function public._leave_thread_placeholder(rid uuid, owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  holder uuid;
begin
  select splash_id, thread_pool_id, occurred_on, created_at, written_on into r
    from public.ripples where id = rid;
  perform set_config('weming.inherit_backfill', 'on', true);
  insert into public.ripples
    (author_id, splash_id, thread_pool_id, note, media, occurred_on, created_at, written_on)
  values (null, r.splash_id, r.thread_pool_id, null, '{}', r.occurred_on, r.created_at, r.written_on)
  returning id into holder;
  perform set_config('weming.inherit_backfill', 'off', true);
  update public.ripple_replies set ripple_id = holder
   where ripple_id = rid and author_id <> owner;
  update public.ripple_reactions set ripple_id = holder
   where ripple_id = rid and user_id <> owner;
  update public.notifications set ripple_id = holder
   where ripple_id = rid and recipient_id <> owner;
end;
$$;

-- 0061's trigger, with my side of others' records answered there kept too.
create or replace function public.hand_over_on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  for rec in
    select distinct r.splash_id, r.thread_pool_id
      from public.ripples r
      join public.splashes s on s.id = r.splash_id
     where s.owner_id = old.id and r.thread_pool_id is not null
  loop
    perform public._hand_over_thread(rec.splash_id, rec.thread_pool_id);
  end loop;
  -- My ripples on joint records go with me; what others said to them stays,
  -- on a placeholder in each one's place.
  for rec in
    select r.id, r.splash_id
      from public.ripples r
      join public.splashes s on s.id = r.splash_id
     where r.author_id = old.id and s.owner_id is null and r.parent_ripple_id is null
       and public._answered_by_others(r.id, null, old.id)
  loop
    perform public._leave_placeholder(rec.id, rec.splash_id, null, old.id);
  end loop;
  -- Likewise my side of someone else's record, in its pool thread (0065).
  for rec in
    select r.id
      from public.ripples r
      join public.splashes s on s.id = r.splash_id
     where r.author_id = old.id and r.thread_pool_id is not null
       and s.owner_id is not null and s.owner_id <> old.id
       and r.parent_ripple_id is null
       and public._answered_by_others(r.id, null, old.id)
  loop
    perform public._leave_thread_placeholder(rec.id, old.id);
  end loop;
  -- A joint record I started that holds nothing of anyone else's goes with
  -- me; one others wrote in stays, opened by no one (created_by set null).
  delete from public.splashes s
   where s.owner_id is null and s.created_by = old.id
     and not exists (select 1 from public.ripples r
                      where r.splash_id = s.id and r.author_id is distinct from old.id);
  return old;
end;
$$;

-- 0061's reader, with a placeholder in a member's thread on someone's
-- record read as that thread is: by the record's owner, and by the pool's
-- current members while the record is shared there.
create or replace function public.ripple_in_my_pools(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.ripples r
      join public.splashes s on s.id = r.splash_id
     where r.id = rid
       and not public.ripple_is_locked(r.id)
       and (
         (s.owner_id is null
           and public.is_current_member(s.pool_id)
           -- A placeholder (0061) has no author: the pool reads it.
           and (r.author_id is null or public.member_visible(s.pool_id, r.author_id)))
         or (s.owner_id = r.author_id and public.splash_in_my_pools(s.id))
         -- A member's ripple on someone's record (0035): followed by
         -- keep_on_leave; read by the record's owner, on or off, and by
         -- the pool's current members while the record is shared there.
         -- A placeholder there (0065) has no author: the thread reads it.
         or (r.thread_pool_id is not null
           and s.owner_id is not null
           and (r.author_id is null or public.member_visible(r.thread_pool_id, r.author_id))
           and (
             s.owner_id = auth.uid()
             or (public.is_current_member(r.thread_pool_id)
               and public.member_visible(r.thread_pool_id, s.owner_id)
               and exists (
                 select 1 from public.splash_placements p
                  where p.splash_id = s.id and p.pool_id = r.thread_pool_id and p.shared
               ))
           ))
         -- A thread handed over when I left its pool with remove (0061):
         -- mine to read on my record as it stood then, nothing written after.
         or (s.owner_id is null
           and r.author_id is not null
           and exists (
             select 1 from public.splash_placements p
               join public.splashes o on o.id = p.splash_id
              where p.handed_to = s.id
                and o.owner_id = auth.uid()
                and r.created_at <= p.handed_at
           ))
       )
  );
$$;

create or replace function public.stamp_board_layout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.splash_id <> old.splash_id
    or new.scope <> old.scope
    or new.pool_id is distinct from old.pool_id
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'a layout stays with its splash and its owner' using errcode = '42501';
  end if;
  -- Its editor's account gone (on delete set null): nobody edited it.
  if tg_op = 'UPDATE' and new.updated_by is null and old.updated_by is not null
     and new.layout is not distinct from old.layout then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke execute on function public._pool_heir(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._leave_thread_placeholder(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.hand_over_on_account_delete() from public, anon, authenticated;
revoke execute on function public.account_deletion_preview() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.account_deletion_preview() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
