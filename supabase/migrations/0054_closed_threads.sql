-- 0054: a deleted pool's thread is closed, never deleted (2026-10-27).
--
-- 0053 gave replies and reactions a thread pool with ON DELETE CASCADE, so
-- deleting a pool would delete its thread's responses. Yoonji, in the
-- session: "Pool deletion: do not delete replies and reactions of that
-- pool's thread. Keep them, readable only by the record owner and the
-- writer (mark the thread as closed, e.g. a thread_closed flag or a
-- tombstone pool reference, and make sure a null pool never widens
-- visibility)."
--
-- Before a pool's row goes, its responses are closed: thread_closed set,
-- thread_pool_id cleared, so the cascade finds nothing to delete. The
-- foreign key itself is left as it is (changing it would drop a
-- constraint). A null thread pool now means one of two things, told apart
-- by the flag: the record's owner from no pool (read with the ripple, as in
-- 0053), or a closed thread (read by the record's owner and its writer
-- only). Nothing can set the flag but the closing; nothing can clear it.
--
-- Additive: two columns, functions, a trigger, one policy altered (none
-- removed). Production holds no closed thread yet: no pool has been deleted
-- since 0053.

alter table public.ripple_replies
  add column thread_closed boolean not null default false;
alter table public.ripple_reactions
  add column thread_closed boolean not null default false;

comment on column public.ripple_replies.thread_closed is
  'Its pool was deleted (0054): kept, read only by the record''s owner and the writer. thread_pool_id is null.';
comment on column public.ripple_reactions.thread_closed is
  'As ripple_replies.thread_closed (0054).';

-- ---------------------------------------------------------------------------
-- reading: a closed thread never widens
-- ---------------------------------------------------------------------------

create function public.response_readable(rid uuid, writer uuid, tp uuid, closed boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when closed then
      auth.uid() is not null
      and (
        writer = auth.uid()
        or exists (
          select 1 from public.ripples r join public.splashes s on s.id = r.splash_id
           where r.id = rid and s.owner_id = auth.uid()
        )
      )
    else public.response_readable(rid, writer, tp)
  end;
$$;

alter policy "reactions are readable with their ripple"
  on public.ripple_reactions
  using (public.response_readable(ripple_id, user_id, thread_pool_id, thread_closed));

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
     and public.response_readable(r.ripple_id, r.author_id, r.thread_pool_id, r.thread_closed)
   order by r.created_at, r.id;
$$;

create or replace function public.ripple_replies_in(p_ripples uuid[])
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
     and public.response_readable(r.ripple_id, r.author_id, r.thread_pool_id, r.thread_closed)
   order by r.created_at, r.id;
$$;

-- ---------------------------------------------------------------------------
-- closing, and holding the flag
-- ---------------------------------------------------------------------------

-- Replaces 0053's: the one change a thread may take is being closed.
create or replace function public.set_response_thread()
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
    if new.thread_closed is distinct from old.thread_closed
       or new.thread_pool_id is distinct from old.thread_pool_id then
      if not (
        coalesce(current_setting('weming.close_threads', true), '') = 'on'
        and new.thread_closed and not old.thread_closed and new.thread_pool_id is null
      ) then
        raise exception 'a response stays in the pool it was written in' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;
  -- Only a pool's deletion closes a thread.
  new.thread_closed := false;
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

-- 0053's triggers fire on an update of thread_pool_id, which closing sets.
-- thread_closed alone is not writable by anyone: replies change only
-- through functions that leave it, reactions have no update policy.

create function public.close_pool_threads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('weming.close_threads', 'on', true);
  update public.ripple_replies
     set thread_closed = true, thread_pool_id = null
   where thread_pool_id = old.id;
  update public.ripple_reactions
     set thread_closed = true, thread_pool_id = null
   where thread_pool_id = old.id;
  perform set_config('weming.close_threads', '', true);
  return old;
end;
$$;

create trigger pools_close_threads
  before delete on public.pools
  for each row execute function public.close_pool_threads();

revoke execute on function public.close_pool_threads() from public, anon, authenticated;
revoke execute on function public.response_readable(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.response_readable(uuid, uuid, uuid, boolean) to authenticated;
