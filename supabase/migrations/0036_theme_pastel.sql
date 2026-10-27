-- 0036: Pastel, a third theme mode, and mint, a twelfth colour (2026-10-26,
-- H26 amended).
--
-- Pastel colours fail 3:1 against white in either existing mode: dark puts
-- white on the colour, light puts the colour on white. So pastel is its own
-- mode (Yoonji, in the session): a white ground, every word on it a soft
-- grey, the colour's pastel as the accent. The pastels and the grey live in
-- lib/theme.ts and app/globals.css; the database only learns the word.
-- Mint joins the colours beside sky's powder blue (Yoonji, in the session).
--
-- Destructive: the checks on profiles.theme_mode and profiles.theme_color
-- are dropped and made again, 'pastel' and 'mint' added. They only widen
-- what a row may hold; no row changes. Approved by Yoonji in the session,
-- in reply to the request to drop and re-create both checks, quoted:
--   "좋아 이대로 진행"


alter table public.profiles drop constraint profiles_theme_mode;
alter table public.profiles
  add constraint profiles_theme_mode check (theme_mode in ('dark', 'light', 'pastel'));

alter table public.profiles drop constraint profiles_theme_color;
alter table public.profiles
  add constraint profiles_theme_color check (theme_color in (
    'red', 'orange', 'yellow', 'green', 'lime', 'sky', 'mint',
    'blue', 'purple', 'pink', 'brown', 'black'
  ));

comment on column public.profiles.theme_mode is
  'dark: the colour as the ground, white on it; light: a white ground, the colour on it; pastel: a white ground, words in the colour''s soft tone, its pastel as the fill (0032, 0036).';
