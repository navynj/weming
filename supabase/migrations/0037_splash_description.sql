-- 0037: a splash's description (2026-10-27).
--
-- Yoonji, in the session: a splash may carry a description, optional, written
-- under its title and set apart from its ripples by a divider. Empty is none:
-- the app writes null rather than an empty string. Read and written as the
-- splash is, under its existing policies (the owner, or any current member for
-- a joint splash's title fields).
--
-- Additive: one nullable column with a length check; no row changes.

alter table public.splashes
  add column description text,
  add constraint splashes_description_length check (char_length(description) between 1 and 2000);

comment on column public.splashes.description is
  'A splash''s description (0037): optional, under its title, apart from its ripples. Null when none.';
