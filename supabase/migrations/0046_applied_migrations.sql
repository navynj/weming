-- 0046: which migrations production has applied (2026-10-27). Additive.
--
-- Yoonji, in the session: a production build must wait while the repository
-- holds a migration production has not applied — not only on the commit that
-- adds it, but on every app commit that lands while it awaits approval.
-- Vercel's Ignored Build Step (scripts/vercel-ignore.mjs) asks production
-- itself, through this function, with the service role key the build
-- already has. supabase_migrations is not exposed through the API, hence a
-- function; only the service role may call it.
create function public.applied_migrations()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select version from supabase_migrations.schema_migrations order by version;
$$;

revoke execute on function public.applied_migrations() from public, anon, authenticated;
grant execute on function public.applied_migrations() to service_role;
