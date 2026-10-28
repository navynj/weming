-- 0057: a ripple can turn its video previews off (2026-10-27).
--
-- Planned and approved in the session (part 5, YouTube links become
-- players): "A per-ripple 'Show video previews' switch in the ripple's menu
-- turns detection off for that ripple." On by default, so every ripple
-- written before reads its links as videos; its author switches it off.
-- The ripples policies already let only the author update their ripple.
--
-- Additive: one column with a default; nothing rewritten.

alter table public.ripples
  add column video_previews boolean not null default true;

comment on column public.ripples.video_previews is
  'Its YouTube links drawn as videos (part 5); off, they stay plain links. The author''s to switch.';
