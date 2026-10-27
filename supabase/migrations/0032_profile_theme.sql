-- 0032: a person's theme — one colour and a mode (2026-10-26).
--
-- Chosen in the settings sheet (the strip's gear, before my face), kept on
-- the account so a phone and a desktop open the same. One theme colour of
-- eleven; dark mode is the colour as the water ground with white on it (the
-- ground as it has always been), light mode a white ground where the white
-- labels take the colour. Yellow and lime are deep enough that white on them
-- reads (3:1 at least); every colour's hex lives in lib/theme.ts.
--
-- Additive: two columns with defaults (blue, dark: what everyone sees
-- today) and their checks. Written by the person's own profile policy
-- ("profiles are updated by self"); read by nobody else.

alter table public.profiles
  add column theme_color text not null default 'blue',
  add column theme_mode text not null default 'dark',
  add constraint profiles_theme_color check (
    theme_color in (
      'red', 'orange', 'yellow', 'green', 'lime', 'sky',
      'blue', 'purple', 'pink', 'brown', 'black'
    )
  ),
  add constraint profiles_theme_mode check (theme_mode in ('dark', 'light'));

comment on column public.profiles.theme_color is
  'The theme colour (0032): the water ground in dark mode, the labels in light mode. Hexes in lib/theme.ts.';
comment on column public.profiles.theme_mode is
  'dark: the colour is the ground, white on it; light: a white ground, the colour on it (0032).';
