-- 0069: the welcome splash, planted once per account (2026-10-29).
--
-- Yoonji, in the session: a new account starts with one ordinary splash of
-- its own, "Drop Your Splash", dated on its signup day (H58). The flag says it
-- was planted, so it is never planted again, even after its author deletes it.
--
-- Additive. Every account that exists before this migration counts as
-- already welcomed, so no one signing in again finds a welcome; the default
-- turns to false for the accounts made after it.

alter table public.profiles
  add column welcome_splash_created boolean not null default true;

alter table public.profiles
  alter column welcome_splash_created set default false;
