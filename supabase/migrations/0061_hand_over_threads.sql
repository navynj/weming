-- 0061: a record others wrote in outlives its owner's leaving or deleting
-- (2026-10-28).
--
-- Planned and approved in the session (H46): "a record that other members
-- have written in must survive its owner leaving the pool or deleting their
-- account." And, answered: "Under 'keep', do not hand over: the record
-- already stays visible to the pool with every member's ripple. Hand over
-- only when the record would otherwise disappear from that pool: the owner
-- leaves with 'remove'; the owner deletes the record itself (this replaces
-- today's rule of returning members' ripples to their authors as separate
-- records; members' words stay together on the joint record); the owner
-- deletes their account. In all three, the owner's own ripples are not
-- carried over." "Board layouts for that pool move to the new joint record
-- so it looks the same." "This is an automatic internal step; there is no
-- menu for it." "Use a new internal function rather than keeping
-- splash_to_together alive for it." "Build only the profiles delete trigger
-- now."
--
-- _hand_over_thread(record, pool): for one pool where someone other than
-- its owner wrote, a joint record of that pool with the record's title,
-- icon and days, on its pool lane there, with its With there; that pool's
-- thread moves onto it (others' ripples, and their replies and reactions
-- with them), and the pool's layouts, the writers' own layouts and filings,
-- and the pool's notifications follow. The owner's ripples stay where they
-- are. Each pool is its own hand-over; threads were already apart.
--
-- Replies and reactions members left in that pool on the owner's own
-- ripples are kept (Yoonji, in the session, before the merge): "On the
-- joint record, put a placeholder ripple in the owner's ripple's place,
-- authored by nobody, reading 'This part was removed', with no text, media
-- or reactions of the owner, and move those members' replies and reactions
-- onto it. Order stays as it was. If no other member replied or reacted to
-- an owner ripple, no placeholder is created." A placeholder is a ripple
-- with no author (the one widening below), no words and no media, carrying
-- the owner's ripple's day and moment so it sits where that ripple did.
--
-- A pool's deletion is untouched: there is no pool left to hand over to, so
-- delete_pool still returns members' ripples to their authors (0035).
--
-- Additive: two columns, ripples.author_id made nullable (a widening: every
-- writer still sets it; only a placeholder has none, and a check keeps a
-- placeholder empty), a function, a trigger, functions replaced with their
-- signatures unchanged.

alter table public.splash_placements
  add column handed_to uuid,
  add column handed_at timestamptz;

comment on column public.splash_placements.handed_to is
  'The joint record this placement''s thread was handed to when its owner left the pool with remove (0061). The placement stays, switched off. No foreign key: a second path from placements to splashes would make every embed between them ambiguous, the running app''s included.';

-- A part removed by a hand-over: no author, nothing of theirs on it.
alter table public.ripples alter column author_id drop not null;
alter table public.ripples
  add constraint ripples_removed_is_empty check (
    author_id is not null
    or (note is null and media = '{}' and splash_id is not null and parent_ripple_id is null)
  );

comment on column public.ripples.author_id is
  'Who wrote it. Null only on a placeholder left by a hand-over (0061): "This part was removed", holding members'' replies and reactions on the owner''s ripple that was there.';

-- ---------------------------------------------------------------------------
-- the hand-over
-- ---------------------------------------------------------------------------

create function public._hand_over_thread(p_splash uuid, p_pool uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.splashes%rowtype;
  pl public.splash_placements%rowtype;
  writers uuid[];
  opener uuid;
  jid uuid;
  part record;
  holder uuid;
begin
  select * into s from public.splashes where id = p_splash;
  select * into pl from public.splash_placements where splash_id = p_splash and pool_id = p_pool;
  if s.id is null or s.owner_id is null or pl.splash_id is null
     or not exists (select 1 from public.pools where id = p_pool) then
    return null;
  end if;
  select array_agg(distinct author_id) into writers
    from public.ripples
   where splash_id = p_splash and thread_pool_id = p_pool and author_id <> s.owner_id;
  if writers is null then
    return null;
  end if;
  -- Opened by whoever wrote there first: a joint record is credited to a
  -- member, and its owner, gone from it, is never one.
  select author_id into opener
    from public.ripples
   where splash_id = p_splash and thread_pool_id = p_pool and author_id <> s.owner_id
   order by created_at, id
   limit 1;

  perform set_config('weming.reshape', 'on', true);

  insert into public.splashes
    (owner_id, pool_id, pool_lane_id, created_by, title, icon,
     declared_start, declared_end, joint_invite_all, created_at)
  values (
    null, p_pool, pl.pool_lane_id, opener, s.title, s.icon,
    coalesce(s.declared_start, s.written_on), s.declared_end, pl.invite_all, s.created_at
  )
  returning id into jid;

  -- Its With there becomes the joint record's.
  insert into public.joint_invitees (splash_id, user_id)
  select jid, i.user_id
    from public.joint_invitees i
   where i.splash_id = p_splash and i.pool_id = p_pool and i.user_id <> s.owner_id
  on conflict do nothing;
  delete from public.joint_invitees where splash_id = p_splash and pool_id = p_pool;

  -- The thread: their ripples become the joint record's, and their replies
  -- and reactions follow by ripple, already of this pool.
  update public.ripples
     set splash_id = jid, thread_pool_id = null
   where splash_id = p_splash and thread_pool_id = p_pool;

  -- What members said in this pool on the owner's own ripples: kept on a
  -- placeholder in each such ripple's place, none for one nobody answered.
  -- The owner's own replies and reactions stay with their ripple.
  perform set_config('weming.inherit_backfill', 'on', true);
  for part in
    select r.id, r.occurred_on, r.created_at, r.written_on
      from public.ripples r
     where r.splash_id = p_splash
       and r.author_id = s.owner_id
       and r.parent_ripple_id is null
       and (
         exists (select 1 from public.ripple_replies x
                  where x.ripple_id = r.id and x.thread_pool_id = p_pool
                    and x.author_id <> s.owner_id)
         or exists (select 1 from public.ripple_reactions x
                     where x.ripple_id = r.id and x.thread_pool_id = p_pool
                       and x.user_id <> s.owner_id)
       )
  loop
    insert into public.ripples
      (author_id, splash_id, note, media, occurred_on, created_at, written_on)
    values (null, jid, null, '{}', part.occurred_on, part.created_at, part.written_on)
    returning id into holder;
    update public.ripple_replies
       set ripple_id = holder
     where ripple_id = part.id and thread_pool_id = p_pool and author_id <> s.owner_id;
    update public.ripple_reactions
       set ripple_id = holder
     where ripple_id = part.id and thread_pool_id = p_pool and user_id <> s.owner_id;
    update public.notifications
       set ripple_id = holder
     where ripple_id = part.id and pool_id = p_pool and recipient_id <> s.owner_id;
  end loop;
  perform set_config('weming.inherit_backfill', 'off', true);

  -- It looks the same in the pool, and on each writer's Home. A layout
  -- never changes splash (stamp_board_layout), so it is copied and the
  -- original goes.
  with moving as (
    delete from public.board_layouts b
     where b.splash_id = p_splash
       and (
         (b.scope = 'pool' and b.pool_id = p_pool)
         or (b.scope = 'home' and b.user_id = any (writers)
             and not exists (select 1 from public.ripples r
                              where r.splash_id = p_splash and r.author_id = b.user_id))
       )
    returning b.*
  )
  insert into public.board_layouts (splash_id, scope, pool_id, user_id, view, layout)
  select jid, scope, pool_id, user_id, view, layout from moving;
  update public.home_filing f
     set splash_id = jid
   where f.splash_id = p_splash and f.user_id = any (writers)
     and not exists (select 1 from public.ripples r
                      where r.splash_id = p_splash and r.author_id = f.user_id);

  -- Not a new post: what the pool was told about stays, pointing at it.
  delete from public.notifications where splash_id = jid;
  delete from public.notifications
   where splash_id = p_splash and pool_id = p_pool and recipient_id = s.owner_id;
  update public.notifications
     set splash_id = jid
   where splash_id = p_splash and pool_id = p_pool;

  update public.splash_placements
     set shared = false, handed_to = jid, handed_at = now(), updated_at = now()
   where splash_id = p_splash and pool_id = p_pool;

  perform set_config('weming.reshape', 'off', true);
  return jid;
end;
$$;

revoke execute on function public._hand_over_thread(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- when: leaving with remove, deleting the record, deleting the account
-- ---------------------------------------------------------------------------

create or replace function public.leave_pool(p_pool uuid, p_keep boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_member(p_pool);
  sid uuid;
begin
  if p_keep is null then
    raise exception 'keep or remove must be chosen' using errcode = '22023';
  end if;
  -- Removed, my records would go from the pool and take members' words
  -- with them: those threads become the pool's joint records first (0061).
  if not p_keep then
    for sid in
      select distinct r.splash_id
        from public.ripples r
        join public.splashes s on s.id = r.splash_id
       where r.thread_pool_id = p_pool and s.owner_id = uid
    loop
      perform public._hand_over_thread(sid, p_pool);
    end loop;
  end if;
  update public.pool_members
     set left_at = now(), keep_on_leave = p_keep
   where pool_id = p_pool and user_id = uid;
end;
$$;

-- Deleting my record hands each pool's thread to that pool (0061); with no
-- pool to hand to (a placement removed), members' ripples go back to their
-- authors as before (0035).
create or replace function public.detach_threads_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tp uuid;
begin
  if old.owner_id is not null then
    for tp in
      select distinct thread_pool_id from public.ripples
       where splash_id = old.id and thread_pool_id is not null
    loop
      if coalesce(current_setting('weming.pool_teardown', true), '') = 'on'
         or public._hand_over_thread(old.id, tp) is null then
        perform public._detach_thread(old.id, tp);
      end if;
    end loop;
  end if;
  return old;
end;
$$;

-- Deleting my account: every pool's thread on my records is handed over
-- first, so the cascade takes only what is mine.
create function public.hand_over_on_account_delete()
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
  return old;
end;
$$;

revoke execute on function public.hand_over_on_account_delete() from public, anon, authenticated;

create trigger profiles_hand_over_threads
  before delete on public.profiles
  for each row execute function public.hand_over_on_account_delete();

-- ---------------------------------------------------------------------------
-- the thread I handed over, still mine to read up to when I left
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ripple_in_my_pools(rid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         or (r.thread_pool_id is not null
           and s.owner_id is not null
           and public.member_visible(r.thread_pool_id, r.author_id)
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
$function$;
