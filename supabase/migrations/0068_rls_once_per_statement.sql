-- RLS once per statement (2026-10-28).
--
-- The read policies called a SECURITY DEFINER function for every row they
-- looked at (ripple_in_my_pools, response_readable, is_current_member, …);
-- such a function is never inlined, and each call ran its own queries and
-- the functions it called in turn. On a copy of production the reactions of
-- 87 ripples took 19ms to read and ripple_replies_in 32ms, nearly all of it
-- these calls; together they were most of the database's time.
--
-- The rules are unchanged, word for word. What changes is how often they
-- run: each per-row call becomes a set the statement computes once —
-- `col in (select private.f())`, which Postgres evaluates as one hashed
-- subplan — built by the helpers below from the same predicates.
--
-- The helpers live in `private`, a schema PostgREST does not expose
-- (config.toml [api] schemas), so none of them is an RPC anyone can call;
-- policies call them as the reader, who needs only USAGE and EXECUTE.
--
-- Only SELECT policies are replaced: a write touches one row, where the
-- per-row cost is one call. The old functions stay: write policies and
-- RPCs still use them.
--
-- Destructive DDL (drop policy), approved by Yoonji in the session:
--   "Approved: 0068 drops and recreates the 15 SELECT policies listed
--   (board_layouts, joint_invitees, pool_invites, pool_lanes, pool_members,
--   pool_notification_defaults, pool_removed_members, pools, profiles,
--   ripple_reactions, ripple_views, ripples, splash_origins,
--   splash_placements, splashes), same names and same rules, and redefines
--   ripple_replies_in the same way."

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- the sets
-- ---------------------------------------------------------------------------

-- is_current_member(pid): the pools I am in now.
create function private.my_pools()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.pool_id from public.pool_members m
   where m.user_id = auth.uid() and m.left_at is null;
$$;

-- member_visible(pid, uid): a member, or one who left keeping their records.
create function private.visible_members()
returns table (pool_id uuid, user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select m.pool_id, m.user_id from public.pool_members m
   where m.left_at is null or m.keep_on_leave;
$$;

-- splash_owner(sid) = auth.uid()
create function private.my_splashes()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.splashes s where s.owner_id = auth.uid();
$$;

-- ripple_author(rid) = auth.uid()
create function private.my_ripples()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select r.id from public.ripples r where r.author_id = auth.uid();
$$;

-- pool_creator_is_me(pid)
create function private.my_owned_pools()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.pools p where auth.uid() is not null and p.owner_id = auth.uid();
$$;

-- ripple_is_locked(rid): locked itself, or its parent is.
create function private.locked_ripples()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select a.ripple_id from public.ripple_audience a where a.target_type = 'lock'
  union
  select r.id from public.ripples r
    join public.ripple_audience a on a.ripple_id = r.parent_ripple_id and a.target_type = 'lock';
$$;

-- splash_in_my_pools(sid)
create function private.pool_splashes()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.splashes s
   where s.owner_id is null and s.pool_id in (select private.my_pools())
  union
  select p.splash_id
    from public.splash_placements p
    join public.splashes s on s.id = p.splash_id
   where p.shared
     and p.pool_id in (select private.my_pools())
     and (p.pool_id, s.owner_id) in (select * from private.visible_members());
$$;

-- ripple_in_my_pools(rid), branch for branch.
create function private.pool_ripples()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select r.id
    from public.ripples r
    join public.splashes s on s.id = r.splash_id
   where r.id not in (select private.locked_ripples())
     and (
       (s.owner_id is null
         and s.pool_id in (select private.my_pools())
         and (r.author_id is null
           or (s.pool_id, r.author_id) in (select * from private.visible_members())))
       or (s.owner_id = r.author_id and s.id in (select private.pool_splashes()))
       or (r.thread_pool_id is not null
         and s.owner_id is not null
         and (r.author_id is null
           or (r.thread_pool_id, r.author_id) in (select * from private.visible_members()))
         and (
           s.owner_id = auth.uid()
           or (r.thread_pool_id in (select private.my_pools())
             and (r.thread_pool_id, s.owner_id) in (select * from private.visible_members())
             and exists (
               select 1 from public.splash_placements p
                where p.splash_id = s.id and p.pool_id = r.thread_pool_id and p.shared
             ))
         ))
       or (s.owner_id is null
         and r.author_id is not null
         and exists (
           select 1 from public.splash_placements p
             join public.splashes o on o.id = p.splash_id
            where p.handed_to = s.id
              and o.owner_id = auth.uid()
              and r.created_at <= p.handed_at
         ))
     );
$$;

-- can_read_responses(rid): a ripple I can see (can_see_ripple), not locked
-- unless it is mine.
create function private.response_ripples()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select v.id
    from (select private.my_ripples() as id union select private.pool_ripples()) v
   where auth.uid() is not null
     and (v.id not in (select private.locked_ripples()) or v.id in (select private.my_ripples()));
$$;

-- _ripple_pools(rid). Every pair, not only the ripples I can read: each
-- use stands beside `ripple_id in (select private.response_ripples())`,
-- which limits it, and computing that set again in here would double the
-- statement's work.
create function private.response_ripple_pools()
returns table (ripple_id uuid, pool_id uuid)
language sql stable security definer set search_path = ''
as $$
  select r.id, s.pool_id
    from public.ripples r
    join public.splashes s on s.id = r.splash_id
   where s.owner_id is null and s.pool_id is not null
  union
  select r.id, p.pool_id
    from public.ripples r
    join public.splash_placements p on p.splash_id = r.splash_id and p.shared
   where r.thread_pool_id is null or p.pool_id = r.thread_pool_id;
$$;

-- responder_visible(rid, uid), less its `uid = auth.uid()`: the ripple's
-- author, or a visible member of one of its pools. Unlimited for the same
-- reason as response_ripple_pools.
create function private.response_writers()
returns table (ripple_id uuid, user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.author_id from public.ripples r where r.author_id is not null
  union
  select rp.ripple_id, vm.user_id
    from private.response_ripple_pools() rp
    join private.visible_members() vm on vm.pool_id = rp.pool_id;
$$;

-- The `exists (… s.owner_id = auth.uid())` of response_readable: ripples on
-- my own records.
create function private.ripples_on_my_records()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select r.id from public.ripples r
    join public.splashes s on s.id = r.splash_id
   where s.owner_id = auth.uid();
$$;

-- splash_in_pool(sid, pid), in the pools I am in.
create function private.pool_splash_pairs()
returns table (splash_id uuid, pool_id uuid)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.pool_id from public.splashes s
   where s.owner_id is null and s.pool_id in (select private.my_pools())
  union
  select p.splash_id, p.pool_id from public.splash_placements p
   where p.shared and p.pool_id in (select private.my_pools());
$$;

-- is_current_member(_joint_pool(sid)): joint splashes of the pools I am in.
create function private.my_pools_joint_splashes()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.splashes s
   where s.owner_id is null and s.pool_id in (select private.my_pools());
$$;

-- shares_pool(other): anyone with a row in a pool I am in now.
create function private.companions()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select theirs.user_id from public.pool_members theirs
   where theirs.pool_id in (select private.my_pools());
$$;

-- The placements members read: shared, in a pool I am in, by an owner who
-- is a visible member there.
create function private.visible_placements()
returns table (splash_id uuid, pool_id uuid)
language sql stable security definer set search_path = ''
as $$
  select p.splash_id, p.pool_id
    from public.splash_placements p
    join public.splashes s on s.id = p.splash_id
   where p.shared
     and p.pool_id in (select private.my_pools())
     and (p.pool_id, s.owner_id) in (select * from private.visible_members());
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- the policies, the same rules read once per statement
-- ---------------------------------------------------------------------------

drop policy "pool layouts are read by current members" on public.board_layouts;
create policy "pool layouts are read by current members"
  on public.board_layouts for select
  using (
    scope = 'pool'
    and pool_id in (select private.my_pools())
    and (splash_id, pool_id) in (select * from private.pool_splash_pairs())
  );

drop policy "invitees are readable by the pool's current members" on public.joint_invitees;
create policy "invitees are readable by the pool's current members"
  on public.joint_invitees for select
  using (
    (pool_id is not null and pool_id in (select private.my_pools()))
    or (pool_id is null and splash_id in (select private.my_pools_joint_splashes()))
    or (pool_id is not null and splash_id in (select private.my_splashes()))
  );

drop policy "invites are readable by current members" on public.pool_invites;
create policy "invites are readable by current members"
  on public.pool_invites for select
  using (pool_id in (select private.my_pools()));

drop policy "pool lanes are readable by current members" on public.pool_lanes;
create policy "pool lanes are readable by current members"
  on public.pool_lanes for select
  using (pool_id in (select private.my_pools()));

drop policy "pool members are readable by current members" on public.pool_members;
create policy "pool members are readable by current members"
  on public.pool_members for select
  using (pool_id in (select private.my_pools()));

drop policy "pool defaults are read by current members" on public.pool_notification_defaults;
create policy "pool defaults are read by current members"
  on public.pool_notification_defaults for select
  using (pool_id in (select private.my_pools()));

drop policy "removed members are read by the pool's owner" on public.pool_removed_members;
create policy "removed members are read by the pool's owner"
  on public.pool_removed_members for select
  using (
    pool_id in (select private.my_pools())
    and pool_id in (select private.my_owned_pools())
  );

drop policy "pools are readable by current members" on public.pools;
create policy "pools are readable by current members"
  on public.pools for select
  using (id in (select private.my_pools()));

drop policy "profiles are readable by pool companions" on public.profiles;
create policy "profiles are readable by pool companions"
  on public.profiles for select
  using (id in (select private.companions()));

-- response_readable(ripple_id, user_id, thread_pool_id, thread_closed).
drop policy "reactions are readable with their ripple" on public.ripple_reactions;
create policy "reactions are readable with their ripple"
  on public.ripple_reactions for select
  using (
    case
      when thread_closed then
        auth.uid() is not null
        and (user_id = auth.uid() or ripple_id in (select private.ripples_on_my_records()))
      else
        ripple_id in (select private.response_ripples())
        and (
          user_id = auth.uid()
          or (ripple_id, user_id) in (select * from private.response_writers())
        )
        and (
          thread_pool_id is null
          or user_id = auth.uid()
          or ripple_id in (select private.ripples_on_my_records())
          or (thread_pool_id in (select private.my_pools())
            and (thread_pool_id, user_id) in (select * from private.visible_members())
            and (ripple_id, thread_pool_id) in (select * from private.response_ripple_pools()))
        )
    end
  );

drop policy "views are readable by the ripple's author" on public.ripple_views;
create policy "views are readable by the ripple's author"
  on public.ripple_views for select
  using (ripple_id in (select private.my_ripples()));

drop policy "ripples are readable through my pools" on public.ripples;
create policy "ripples are readable through my pools"
  on public.ripples for select
  using (id in (select private.pool_ripples()));

drop policy "origins are readable by the splash's owner" on public.splash_origins;
create policy "origins are readable by the splash's owner"
  on public.splash_origins for select
  using (splash_id in (select private.my_splashes()));

drop policy "placements are readable by the author and by members" on public.splash_placements;
create policy "placements are readable by the author and by members"
  on public.splash_placements for select
  using (
    splash_id in (select private.my_splashes())
    or (splash_id, pool_id) in (select * from private.visible_placements())
  );

drop policy "splashes are readable through my pools" on public.splashes;
create policy "splashes are readable through my pools"
  on public.splashes for select
  using (id in (select private.pool_splashes()));

-- ---------------------------------------------------------------------------
-- ripple_replies_in: the same filter as the reactions' policy, once
-- ---------------------------------------------------------------------------

create or replace function public.ripple_replies_in(p_ripples uuid[])
returns table (
  id uuid, ripple_id uuid, author_id uuid, body text, created_at timestamptz,
  edited_at timestamptz, hidden boolean, former boolean, thread_pool_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select r.id,
         r.ripple_id,
         r.author_id,
         case when r.hidden_at is null
                or r.author_id = auth.uid()
                or r.ripple_id in (select private.my_ripples())
              then r.body end,
         r.created_at,
         r.edited_at,
         r.hidden_at is not null,
         -- responder_former: the ripple is in a pool, and the writer is a
         -- current member of none of its pools.
         exists (select 1 from public._ripple_pools(r.ripple_id))
           and not exists (
             select 1 from public._ripple_pools(r.ripple_id) p(pool_id)
               join public.pool_members m on m.pool_id = p.pool_id and m.user_id = r.author_id
              where m.left_at is null
           ),
         r.thread_pool_id
    from public.ripple_replies r
   where r.ripple_id = any(p_ripples)
     and case
       when r.thread_closed then
         auth.uid() is not null
         and (r.author_id = auth.uid() or r.ripple_id in (select private.ripples_on_my_records()))
       else
         r.ripple_id in (select private.response_ripples())
         and (
           r.author_id = auth.uid()
           or (r.ripple_id, r.author_id) in (select * from private.response_writers())
         )
         and (
           r.thread_pool_id is null
           or r.author_id = auth.uid()
           or r.ripple_id in (select private.ripples_on_my_records())
           or (r.thread_pool_id in (select private.my_pools())
             and (r.thread_pool_id, r.author_id) in (select * from private.visible_members())
             and (r.ripple_id, r.thread_pool_id) in (select * from private.response_ripple_pools()))
         )
     end
   order by r.created_at, r.id;
$$;
