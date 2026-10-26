-- 0030: reactions and replies on a ripple (H24, 2026-10-26).
--
-- Two small things a reader can leave under a block: an emoji (several per
-- person, one of each) and a short reply (text, one level, no replies to
-- replies). Neither is a ripple: no lane, no date, never on the board as a
-- record, never counted toward a joint splash's "Add your side".
--
-- Who: exactly the people who can see the ripple (can_see_ripple), and
-- nobody on a locked one — a lock refuses both, and hides both from everyone
-- but the ripple's author. A person who left a pool follows keep_on_leave,
-- as their records do (member_visible): kept and visible when they chose
-- keep, hidden when they chose remove.
--
-- Replies are read and written only through the functions below. RLS can
-- refuse a row but cannot blank one column of it, and a reply the ripple's
-- author hid must reach nobody but its writer and that author. Deletes are
-- hard (privacy over recovery); edited and hidden are states, kept as
-- columns.
--
-- Additive: two tables, their policies, functions and grants. Signed-out
-- callers reach nothing (the 0026 pattern). Approved in the session by
-- Yoonji (2026-10-26): "Hard delete for replies: OK. Edited and hidden
-- states stay as columns." — "A former member's replies follow
-- keep_on_leave, the same as their placements."

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.ripple_reactions (
  ripple_id uuid not null references public.ripples (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- One grapheme, checked in the app (Intl.Segmenter); Postgres cannot count
  -- graphemes, so here only its outer bounds: a flag or a family emoji is
  -- several code points, never more than sixteen, never whitespace.
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (ripple_id, user_id, emoji),
  constraint ripple_reactions_emoji check (
    char_length(emoji) between 1 and 16 and emoji !~ '[[:space:]]'
  )
);

create index ripple_reactions_user_idx on public.ripple_reactions (user_id);

comment on table public.ripple_reactions is
  'An emoji left on a ripple by someone who can see it (H24). One of each emoji per person.';

create table public.ripple_replies (
  id uuid primary key default gen_random_uuid(),
  ripple_id uuid not null references public.ripples (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  -- Hidden by the ripple's author: the row stays, its text reaches only its
  -- writer and that author.
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  constraint ripple_replies_body check (
    char_length(body) <= 500 and char_length(btrim(body)) >= 1
  )
);

create index ripple_replies_ripple_idx on public.ripple_replies (ripple_id, created_at);
create index ripple_replies_author_idx on public.ripple_replies (author_id);

comment on table public.ripple_replies is
  'A short reply under one ripple (H24). Not a ripple: no lane, no date. Read and written only through the reply functions.';

alter table public.ripple_reactions enable row level security;
alter table public.ripple_replies enable row level security;

-- ---------------------------------------------------------------------------
-- who counts
-- ---------------------------------------------------------------------------

-- May I leave something on this ripple: signed in, I see it, it is not locked.
create function public.can_respond(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.can_see_ripple(rid)
     and not public.ripple_is_locked(rid);
$$;

-- May I read what others left on this ripple: I see it, and it is not locked
-- unless it is mine.
create function public.can_read_responses(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.can_see_ripple(rid)
     and (not public.ripple_is_locked(rid) or public.ripple_author(rid) = auth.uid());
$$;

-- The pools a ripple lives in: its joint splash's pool, or every pool its
-- post is placed and shared in.
create function public._ripple_pools(rid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.pool_id
    from public.ripples r
    join public.splashes s on s.id = r.splash_id
   where r.id = rid and s.owner_id is null and s.pool_id is not null
  union
  select p.pool_id
    from public.ripples r
    join public.splash_placements p on p.splash_id = r.splash_id and p.shared
   where r.id = rid;
$$;

-- Is what this person left on this ripple still to be seen: their own, the
-- ripple's author's, or someone a pool of the ripple still shows
-- (member_visible: a member, or one who left and chose keep).
create function public.responder_visible(rid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid = auth.uid()
      or uid = public.ripple_author(rid)
      or exists (
        select 1 from public._ripple_pools(rid) p(pool_id)
         where public.member_visible(p.pool_id, uid)
      );
$$;

-- Has this person left every pool the ripple lives in ("Former member").
create function public.responder_former(rid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public._ripple_pools(rid))
     and not exists (
       select 1
         from public._ripple_pools(rid) p(pool_id)
         join public.pool_members m on m.pool_id = p.pool_id and m.user_id = uid
        where m.left_at is null
     );
$$;

-- ---------------------------------------------------------------------------
-- reactions: plain policies, one row per (ripple, person, emoji)
-- ---------------------------------------------------------------------------

create policy "reactions are readable with their ripple"
  on public.ripple_reactions for select
  using (
    public.can_read_responses(ripple_id)
    and public.responder_visible(ripple_id, user_id)
  );

create policy "reactions are left by a reader of an unlocked ripple"
  on public.ripple_reactions for insert
  with check (user_id = auth.uid() and public.can_respond(ripple_id));

create policy "reactions are taken back by their own"
  on public.ripple_reactions for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- replies: functions only
-- ---------------------------------------------------------------------------

-- p_id is minted by the browser, so the optimistic row is the real one.
create function public.add_reply(p_ripple uuid, p_body text, p_id uuid default null)
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
  insert into public.ripple_replies (id, ripple_id, author_id, body)
  values (coalesce(p_id, gen_random_uuid()), p_ripple, uid, btrim(coalesce(p_body, '')))
  returning id into rid;
  return rid;
end;
$$;

create function public.edit_reply(p_reply uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  rep public.ripple_replies%rowtype;
begin
  select * into rep from public.ripple_replies where id = p_reply for update;
  if rep.id is null or rep.author_id <> uid then
    raise exception 'That reply is not yours.' using errcode = '42501';
  end if;
  if rep.hidden_at is not null then
    raise exception 'That reply was hidden by the ripple''s author.' using errcode = '42501';
  end if;
  if not public.can_respond(rep.ripple_id) then
    raise exception 'You can''t reply to this ripple.' using errcode = '42501';
  end if;
  update public.ripple_replies
     set body = btrim(coalesce(p_body, '')), edited_at = now()
   where id = p_reply;
end;
$$;

-- Hard delete: one's own reply, always, even after leaving or a lock.
create function public.delete_reply(p_reply uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
begin
  delete from public.ripple_replies where id = p_reply and author_id = uid;
  if not found then
    raise exception 'That reply is not yours.' using errcode = '42501';
  end if;
end;
$$;

-- The ripple's author hides (or shows again) any reply on their ripple.
create function public.hide_reply(p_reply uuid, p_hidden boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public._require_uid();
  rid uuid;
begin
  select ripple_id into rid from public.ripple_replies where id = p_reply for update;
  if rid is null or public.ripple_author(rid) is distinct from uid then
    raise exception 'Only the ripple''s author can hide a reply.' using errcode = '42501';
  end if;
  update public.ripple_replies
     set hidden_at = case when p_hidden then now() end,
         hidden_by = case when p_hidden then uid end
   where id = p_reply;
end;
$$;

-- Every reply I may read on these ripples, oldest first. A hidden one keeps
-- its place with no text, except for its writer and the ripple's author.
create function public.ripple_replies_for(p_ripples uuid[])
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
     and public.can_read_responses(r.ripple_id)
     and public.responder_visible(r.ripple_id, r.author_id)
   order by r.created_at, r.id;
$$;

-- The board's badge: per splash, its three most-used emoji and how many
-- reactions it holds, across every ripple of it I may read.
create function public.splash_reaction_summary(p_splashes uuid[])
returns table (splash_id uuid, emoji text[], total integer)
language sql
stable
security definer
set search_path = ''
as $$
  with seen as (
    select r.splash_id, x.emoji, x.created_at
      from public.ripple_reactions x
      join public.ripples r on r.id = x.ripple_id
     where r.splash_id = any(p_splashes)
       and public.can_read_responses(x.ripple_id)
       and public.responder_visible(x.ripple_id, x.user_id)
  ),
  ranked as (
    select splash_id, emoji, count(*) n, min(created_at) first_at
      from seen group by splash_id, emoji
  )
  select splash_id,
         (array_agg(emoji order by n desc, first_at, emoji))[1:3],
         sum(n)::integer
    from ranked
   group by splash_id;
$$;

-- The board's reply lines: per splash, its first replies I may read, oldest
-- first across all its ripples — two to show and the third, where "+n"
-- opens — and how many there are. Hidden replies are skipped and not counted.
create function public.splash_reply_preview(p_splashes uuid[])
returns table (
  splash_id uuid,
  reply_id uuid,
  ripple_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with seen as (
    select r.splash_id, x.id, x.ripple_id, x.author_id, x.body, x.created_at,
           row_number() over (partition by r.splash_id order by x.created_at, x.id) k,
           count(*) over (partition by r.splash_id) n
      from public.ripple_replies x
      join public.ripples r on r.id = x.ripple_id
     where r.splash_id = any(p_splashes)
       and x.hidden_at is null
       and public.can_read_responses(x.ripple_id)
       and public.responder_visible(x.ripple_id, x.author_id)
  )
  select splash_id, id, ripple_id, author_id, body, created_at, n::integer
    from seen
   where k <= 3
   order by splash_id, k;
$$;

-- ---------------------------------------------------------------------------
-- grants: signed-out callers reach nothing (0026)
-- ---------------------------------------------------------------------------

revoke all on table public.ripple_reactions from anon;
revoke all on table public.ripple_replies from anon;
-- Replies are reached only through the functions.
revoke all on table public.ripple_replies from authenticated;
revoke update on table public.ripple_reactions from authenticated;

revoke execute on function public.can_respond(uuid) from public, anon;
revoke execute on function public.can_read_responses(uuid) from public, anon;
revoke execute on function public._ripple_pools(uuid) from public, anon, authenticated;
revoke execute on function public.responder_visible(uuid, uuid) from public, anon;
revoke execute on function public.responder_former(uuid, uuid) from public, anon;
revoke execute on function public.add_reply(uuid, text, uuid) from public, anon;
revoke execute on function public.edit_reply(uuid, text) from public, anon;
revoke execute on function public.delete_reply(uuid) from public, anon;
revoke execute on function public.hide_reply(uuid, boolean) from public, anon;
revoke execute on function public.ripple_replies_for(uuid[]) from public, anon;
revoke execute on function public.splash_reaction_summary(uuid[]) from public, anon;
revoke execute on function public.splash_reply_preview(uuid[]) from public, anon;

grant execute on function public.can_respond(uuid) to authenticated;
grant execute on function public.can_read_responses(uuid) to authenticated;
grant execute on function public.responder_visible(uuid, uuid) to authenticated;
grant execute on function public.responder_former(uuid, uuid) to authenticated;
grant execute on function public.add_reply(uuid, text, uuid) to authenticated;
grant execute on function public.edit_reply(uuid, text) to authenticated;
grant execute on function public.delete_reply(uuid) to authenticated;
grant execute on function public.hide_reply(uuid, boolean) to authenticated;
grant execute on function public.ripple_replies_for(uuid[]) to authenticated;
grant execute on function public.splash_reaction_summary(uuid[]) to authenticated;
grant execute on function public.splash_reply_preview(uuid[]) to authenticated;
