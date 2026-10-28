-- 0053: replies and reactions follow threads, like ripples (2026-10-27).
--
-- A privacy leak, found in production: a reply on a ripple shown in several
-- pools was readable in all of them. responder_visible (0030) asks whether
-- the reply's writer is visible in *any* of the ripple's pools, never
-- whether the reader is in *that* pool, so a member of pool A read a reply
-- written by someone who shares only pool B with the record.
--
-- The rule, Yoonji in the session: "A reply on a ripple visible in several
-- pools belongs to the pool the replier wrote it in (store
-- reply.thread_pool_id, set from the viewing pool when posting; for replies
-- by the record owner, the pool they replied in). RLS: a reply with a
-- thread pool is readable by that pool's current members and the record
-- owner only. Backfill existing replies by the replier's shared pool with
-- the record (first joined if several). Same for reactions."
--
-- So each reply and reaction carries its thread pool:
--   - on a member's ripple (ripples.thread_pool_id, 0035), that pool;
--   - on a joint record, the record's pool;
--   - otherwise the pool it was written from, which must show the record
--     and hold its writer; the record's owner writing from no pool (Home)
--     leaves it null, read wherever the owner's own words are.
-- The app now in production sends no pool: such a write takes the first
-- pool its writer joined where the record is shared — the backfill's rule —
-- so it keeps working until the app that sends the pool is deployed.
--
-- Read: a response with a thread pool reaches that pool's current members,
-- the record's owner and its writer; one without, the ripple's readers as
-- before. Notifications follow the thread: a recipient outside it gets none.
--
-- Additive: two columns, functions, triggers, one policy altered (none
-- removed), a backfill. Production (read-only check before writing this):
-- 13 replies and 9 reactions, each resolving to exactly one pool or, for
-- the one reply by a record's owner, none; no reply or reaction
-- notifications exist yet.

-- ---------------------------------------------------------------------------
-- columns
-- ---------------------------------------------------------------------------

-- A pool deleted takes its threads' responses with it: hard deletes
-- (privacy over recovery), and nobody else may read them.
alter table public.ripple_replies
  add column thread_pool_id uuid references public.pools (id) on delete cascade;
alter table public.ripple_reactions
  add column thread_pool_id uuid references public.pools (id) on delete cascade;

comment on column public.ripple_replies.thread_pool_id is
  'The pool this reply was written in (0053): read only by its current members, the record''s owner and the writer. Null only for the record''s owner writing from no pool.';
comment on column public.ripple_reactions.thread_pool_id is
  'The pool this reaction was left in (0053), as ripple_replies.thread_pool_id.';

create index ripple_replies_thread_idx
  on public.ripple_replies (thread_pool_id) where thread_pool_id is not null;
create index ripple_reactions_thread_idx
  on public.ripple_reactions (thread_pool_id) where thread_pool_id is not null;

-- ---------------------------------------------------------------------------
-- which thread a response belongs to
-- ---------------------------------------------------------------------------

-- `wanted`: the pool it is written from, or null. Raises when that pool
-- cannot take it; returns null for the owner writing from no pool, and for
-- a writer who shares no pool with the record (the caller decides).
create function public._response_thread(rid uuid, uid uuid, wanted uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.ripples%rowtype;
  s public.splashes%rowtype;
  pid uuid;
begin
  select * into r from public.ripples where id = rid;
  if r.id is null or r.splash_id is null then
    return null;
  end if;
  if r.thread_pool_id is not null then
    return r.thread_pool_id;
  end if;
  select * into s from public.splashes where id = r.splash_id;
  if s.owner_id is null then
    return s.pool_id;
  end if;
  if wanted is not null then
    if not exists (
      select 1 from public.splash_placements p
       where p.splash_id = s.id and p.pool_id = wanted and p.shared
    ) or not exists (
      select 1 from public.pool_members m
       where m.pool_id = wanted and m.user_id = uid and m.left_at is null
    ) then
      raise exception 'You can''t respond here from that Pool.' using errcode = '42501';
    end if;
    return wanted;
  end if;
  if uid = s.owner_id then
    return null;
  end if;
  -- The first pool the writer joined where the record is shared; a current
  -- membership before a kept former one.
  select p.pool_id into pid
    from public.splash_placements p
    join public.pool_members m on m.pool_id = p.pool_id and m.user_id = uid
   where p.splash_id = s.id and p.shared
   order by (m.left_at is null) desc, m.joined_at, p.pool_id
   limit 1;
  return pid;
end;
$$;

-- Readable by me: the ripple's responses as before (0030), and, in a
-- thread, only as its current member, the record's owner or its writer.
create function public.response_readable(rid uuid, writer uuid, tp uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_read_responses(rid)
     and public.responder_visible(rid, writer)
     and (
       tp is null
       or writer = auth.uid()
       or exists (
         select 1 from public.ripples r join public.splashes s on s.id = r.splash_id
          where r.id = rid and s.owner_id = auth.uid()
       )
       or (
         public.is_current_member(tp)
         and public.member_visible(tp, writer)
         and tp in (select p from public._ripple_pools(rid) p)
       )
     );
$$;

-- ---------------------------------------------------------------------------
-- backfill, before the columns are held
-- ---------------------------------------------------------------------------

update public.ripple_replies
   set thread_pool_id = public._response_thread(ripple_id, author_id, null);
update public.ripple_reactions
   set thread_pool_id = public._response_thread(ripple_id, user_id, null);

-- ---------------------------------------------------------------------------
-- set on the way in, held after
-- ---------------------------------------------------------------------------

create function public.set_response_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  writer uuid;
  owner uuid;
begin
  -- A reply's writer is author_id, a reaction's user_id; one function for both.
  writer := coalesce(to_jsonb(new) ->> 'author_id', to_jsonb(new) ->> 'user_id')::uuid;
  if tg_op = 'UPDATE' then
    if new.thread_pool_id is distinct from old.thread_pool_id then
      raise exception 'a response stays in the pool it was written in' using errcode = '23514';
    end if;
    return new;
  end if;
  new.thread_pool_id := public._response_thread(new.ripple_id, writer, new.thread_pool_id);
  if new.thread_pool_id is null then
    select s.owner_id into owner
      from public.ripples r join public.splashes s on s.id = r.splash_id
     where r.id = new.ripple_id;
    if owner is distinct from writer then
      raise exception 'A response on someone else''s record is written in one of its Pools.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger ripple_replies_thread
  before insert or update of thread_pool_id on public.ripple_replies
  for each row execute function public.set_response_thread();
create trigger ripple_reactions_thread
  before insert or update of thread_pool_id on public.ripple_reactions
  for each row execute function public.set_response_thread();

-- ---------------------------------------------------------------------------
-- reading
-- ---------------------------------------------------------------------------

alter policy "reactions are readable with their ripple"
  on public.ripple_reactions
  using (public.response_readable(ripple_id, user_id, thread_pool_id));

-- The app in production: the same rows it reads today, minus other threads.
create or replace function public.ripple_replies_for(p_ripples uuid[])
returns table (
  id uuid,
  ripple_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  hidden boolean,
  former boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         r.ripple_id,
         r.author_id,
         case when r.hidden_at is null
                or r.author_id = auth.uid()
                or public.ripple_author(r.ripple_id) = auth.uid()
              then r.body end,
         r.created_at,
         r.edited_at,
         r.hidden_at is not null,
         public.responder_former(r.ripple_id, r.author_id)
    from public.ripple_replies r
   where r.ripple_id = any(p_ripples)
     and public.response_readable(r.ripple_id, r.author_id, r.thread_pool_id)
   order by r.created_at, r.id;
$$;

-- The app being deployed: each reply with its thread, so a pool lists its own.
create function public.ripple_replies_in(p_ripples uuid[])
returns table (
  id uuid,
  ripple_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  hidden boolean,
  former boolean,
  thread_pool_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         r.ripple_id,
         r.author_id,
         case when r.hidden_at is null
                or r.author_id = auth.uid()
                or public.ripple_author(r.ripple_id) = auth.uid()
              then r.body end,
         r.created_at,
         r.edited_at,
         r.hidden_at is not null,
         public.responder_former(r.ripple_id, r.author_id),
         r.thread_pool_id
    from public.ripple_replies r
   where r.ripple_id = any(p_ripples)
     and public.response_readable(r.ripple_id, r.author_id, r.thread_pool_id)
   order by r.created_at, r.id;
$$;

-- ---------------------------------------------------------------------------
-- writing: from a pool, by the app being deployed
-- ---------------------------------------------------------------------------

-- No defaults, so the production app's three-argument call still finds 0030's.
create function public.add_reply(p_ripple uuid, p_body text, p_id uuid, p_pool uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  rid uuid;
begin
  if not public.can_respond(p_ripple) then
    raise exception 'You can''t reply to this ripple.' using errcode = '42501';
  end if;
  insert into public.ripple_replies (id, ripple_id, author_id, body, thread_pool_id)
  values (coalesce(p_id, gen_random_uuid()), p_ripple, uid, btrim(coalesce(p_body, '')), p_pool)
  returning id into rid;
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- notifications follow the thread (H32's one pool, narrowed)
-- ---------------------------------------------------------------------------

create or replace function public.notify_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ripples%rowtype;
  s public.splashes%rowtype;
  who uuid;
  pid uuid;
begin
  begin
    select * into r from public.ripples where id = new.ripple_id;
    select * into s from public.splashes where id = r.splash_id;
    for who in
      select distinct t.uid from (
        select r.author_id as uid
        union select s.owner_id
        union select x.author_id from public.ripples x
               where s.owner_id is null and x.splash_id = s.id
        union select y.author_id from public.ripple_replies y
               where y.ripple_id = new.ripple_id and y.id <> new.id
      ) t
       where t.uid is not null and t.uid <> new.author_id
    loop
      if new.thread_pool_id is not null then
        -- Only the thread's own people: its current members.
        pid := case when exists (
                 select 1 from public.pool_members m
                  where m.pool_id = new.thread_pool_id and m.user_id = who and m.left_at is null
               ) then new.thread_pool_id end;
      else
        pid := public._notification_pool(new.ripple_id, new.author_id, who);
      end if;
      continue when pid is null;
      continue when public._notification_value(who, pid, 'reply') <> 'on';
      insert into public.notifications
        (recipient_id, type, pool_id, splash_id, ripple_id, reply_id, actor_id)
      values (who, 'reply', pid, s.id, new.ripple_id, new.id, new.author_id);
    end loop;
  exception when others then
    raise warning 'notify_reply: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ripples%rowtype;
  pid uuid;
  held uuid;
begin
  begin
    select * into r from public.ripples where id = new.ripple_id;
    if r.id is null or r.splash_id is null or r.author_id = new.user_id then
      return null;
    end if;
    if new.thread_pool_id is not null then
      pid := case when exists (
               select 1 from public.pool_members m
                where m.pool_id = new.thread_pool_id and m.user_id = r.author_id and m.left_at is null
             ) then new.thread_pool_id end;
    else
      pid := public._notification_pool(new.ripple_id, new.user_id, r.author_id);
    end if;
    if pid is null or public._notification_value(r.author_id, pid, 'reaction') <> 'on' then
      return null;
    end if;
    select n.id into held
      from public.notifications n
     where n.recipient_id = r.author_id and n.pool_id = pid and n.type = 'reaction'
       and n.created_at > now() - interval '1 hour'
     order by n.created_at desc
     limit 1
     for update;
    if held is not null then
      update public.notifications
         set count = count + 1,
             actor_id = new.user_id,
             splash_id = r.splash_id,
             ripple_id = new.ripple_id,
             read_at = null
       where id = held;
    else
      insert into public.notifications
        (recipient_id, type, pool_id, splash_id, ripple_id, actor_id)
      values (r.author_id, 'reaction', pid, r.splash_id, new.ripple_id, new.user_id);
    end if;
  exception when others then
    raise warning 'notify_reaction: %', sqlerrm;
  end;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants (the 0026 pattern: signed-out callers reach nothing)
-- ---------------------------------------------------------------------------

revoke execute on function public._response_thread(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.set_response_thread() from public, anon, authenticated;
revoke execute on function public.response_readable(uuid, uuid, uuid) from public, anon;
revoke execute on function public.ripple_replies_in(uuid[]) from public, anon;
revoke execute on function public.add_reply(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.response_readable(uuid, uuid, uuid) to authenticated;
grant execute on function public.ripple_replies_in(uuid[]) to authenticated;
grant execute on function public.add_reply(uuid, text, uuid, uuid) to authenticated;
