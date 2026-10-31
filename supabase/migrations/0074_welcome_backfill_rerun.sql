-- 0074: the welcome flags' backfill, once more (H71, 2026-10-31).
--
-- Asked in the session: "After the deploy finishes, re-run the is_welcome
-- backfill once to catch any welcome splash created between the migration
-- and the deploy." 0073 backfilled the flags before the app that sets them
-- was live; a welcome splash planted in that window by the old app has
-- them off. _docs/DEPLOY.md § Release: 0073 says when to merge this:
-- after 0073's deploy is Ready.
--
-- 0073's two statements, idempotent: they only turn a flag on, matched by
-- the built-in photo the welcome block carries. The log gets a count only.

do $$
declare
  flagged integer;
begin
  update public.ripples set is_welcome = true
   where not is_welcome and 'app:welcome/shell.png' = any (media);
  update public.splashes s set is_welcome = true
   where not s.is_welcome
     and exists (select 1 from public.ripples r where r.splash_id = s.id and r.is_welcome);
  get diagnostics flagged = row_count;
  raise notice '0074: flagged % welcome splash(es)', flagged;
end;
$$;
