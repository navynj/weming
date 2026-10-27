/**
 * A person's theme (0032): one colour of eleven and a mode. Dark mode is the
 * colour as the water ground, white on it — the ground as it always was;
 * light mode is a white ground where what was white on it (labels, marks,
 * text) takes the colour. Every hex keeps white on it at 3:1 or better, so
 * dark mode's white labels read on all of them (tests/theme.test.ts).
 *
 * The keys are the database's (profiles.theme_color's check); the hexes live
 * here alone, as CSS variables in globals.css read them too.
 */
export const THEMES = [
  { key: 'red', name: 'Red', hex: '#D92D20' },
  { key: 'orange', name: 'Orange', hex: '#D9480F' },
  { key: 'yellow', name: 'Yellow', hex: '#B07C00' },
  { key: 'green', name: 'Green', hex: '#14804A' },
  { key: 'lime', name: 'Lime', hex: '#4E8A1A' },
  { key: 'sky', name: 'Sky', hex: '#0B7FC2' },
  { key: 'blue', name: 'Blue', hex: '#0507C9' },
  { key: 'purple', name: 'Purple', hex: '#7B2FD0' },
  { key: 'pink', name: 'Pink', hex: '#C2307A' },
  { key: 'brown', name: 'Brown', hex: '#8A5A2B' },
  { key: 'black', name: 'Black', hex: '#161621' },
] as const;

export type ThemeColor = (typeof THEMES)[number]['key'];
export type ThemeMode = 'dark' | 'light';
export type Theme = { color: ThemeColor; mode: ThemeMode };

/** What everyone saw before 0032: the blue water. */
export const DEFAULT_THEME: Theme = { color: 'blue', mode: 'dark' };

export const THEME_COLORS = THEMES.map((t) => t.key) as ThemeColor[];
export const THEME_MODES: ThemeMode[] = ['dark', 'light'];

export function themeHex(color: ThemeColor): string {
  return THEMES.find((t) => t.key === color)?.hex ?? THEMES[6].hex;
}

/** A stored value read safely: anything unknown is the default. */
export function asTheme(color: unknown, mode: unknown): Theme {
  return {
    color: THEME_COLORS.includes(color as ThemeColor) ? (color as ThemeColor) : DEFAULT_THEME.color,
    mode: THEME_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : DEFAULT_THEME.mode,
  };
}
