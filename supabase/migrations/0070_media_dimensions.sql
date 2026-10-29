-- 0070: a photo's size, and whether it has a display copy (2026-10-28).
--
-- Planned and approved in the session (photo compression and a storage
-- adapter): "Store width and height for each image (and for the display
-- variant if it differs) so layouts reserve the right space before loading.
-- If that needs a column on the media rows, it's additive."
--
-- `ripples.media` stays the list of paths and their order. Beside it, keyed
-- by path: { "w": 2048, "h": 1536, "d": { "w": 1024, "h": 768 } }. `d` is
-- there only when a display copy was uploaded beside the photo, at the path
-- with `.d` before its extension (lib/ripple-media.ts, displayPathOf). A path
-- with no entry is a photo from before this: its full image is its display
-- image, its size unknown until it loads.
--
-- The ripples policies already decide who reads and writes the row, so the
-- column needs none of its own. Additive: one column with a default; the app
-- in production never names it.

alter table public.ripples
  add column media_meta jsonb not null default '{}'::jsonb,
  add constraint ripples_media_meta_object check (jsonb_typeof(media_meta) = 'object');

comment on column public.ripples.media_meta is
  'Per media path: its pixel size {w,h}, and {d:{w,h}} when a display copy sits at displayPathOf(path). Missing: an older photo, its own display image.';
