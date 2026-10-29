-- The join screen shows who is in the pool (2026-10-28, Yoonji: "풀 가입시에는
-- 멤버들의 프로필사진과 이름까지 같이 표시되면 좋을 듯"): each current
-- member's name and photo, not their initials alone. Expand only:
-- invite_preview is unchanged and keeps serving the app in production.
--
-- The same token checks as invite_preview (valid, unexpired, unrevoked). As
-- with invite_photo (0024), only the server calls it, with the service role,
-- and signs each photo briefly; the object path never reaches a browser, and
-- no member's id leaves the database.
create function public.invite_members(p_token text)
returns table (display_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.display_name, pr.avatar_path
    from public.pool_members m
    join public.profiles pr on pr.id = m.user_id
   where m.pool_id = public._invite_pool(p_token)
     and m.left_at is null
   order by m.joined_at;
$$;

revoke execute on function public.invite_members(text) from public, anon, authenticated;
