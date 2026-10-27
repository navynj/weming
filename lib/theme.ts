/**
 * A person's theme (0032, 0036): one colour of eleven and a mode. Dark mode
 * is the colour as the water ground, white on it — the ground as it always
 * was; light mode is a white ground where what was white on it (labels,
 * marks, text) takes the colour; pastel mode is a white ground with a soft
 * grey on it and the colour's pastel as its fills. Every hex keeps white at 3:1 or better
 * (dark and light swap the same pair); every pastel keeps the grey at 4.5:1
 * (tests/theme.test.tsx).
 *
 * The keys are the database's (profiles.theme_color's check); the hexes live
 * here alone, as CSS variables in globals.css read them too.
 */
export const THEMES = [
  { key: 'red', name: 'Red', hex: '#D92D20', pastel: '#F2A7A0' },
  { key: 'orange', name: 'Orange', hex: '#D9480F', pastel: '#F7C59B' },
  { key: 'yellow', name: 'Yellow', hex: '#B07C00', pastel: '#F3DE8A' },
  { key: 'green', name: 'Green', hex: '#14804A', pastel: '#A9DBB8' },
  { key: 'lime', name: 'Lime', hex: '#4E8A1A', pastel: '#CBE79B' },
  { key: 'sky', name: 'Sky', hex: '#0B7FC2', pastel: '#A8D5F0' },
  { key: 'blue', name: 'Blue', hex: '#0507C9', pastel: '#AFB8F0' },
  // A step toward blue (Yoonji, in the session): it read reddish.
  { key: 'purple', name: 'Purple', hex: '#6338D8', pastel: '#C2B8F2' },
  // Baby pink (Yoonji, in the session): the first pastel read too strong.
  { key: 'pink', name: 'Pink', hex: '#C2307A', pastel: '#F9CFE0' },
  { key: 'brown', name: 'Brown', hex: '#8A5A2B', pastel: '#D6BC9F' },
  { key: 'black', name: 'Black', hex: '#161621', pastel: '#D3D3DA' },
] as const;

/**
 * Pastel mode's labels, marks and words on the pastel ground (Yoonji, in
 * the session): not pure black, a soft grey that reads 4.5:1 or better on
 * every pastel (tests/theme.test.tsx).
 */
export const PASTEL_INK = '#45424D';

export type ThemeColor = (typeof THEMES)[number]['key'];
export type ThemeMode = 'dark' | 'light' | 'pastel';
export type Theme = { color: ThemeColor; mode: ThemeMode };

/** What everyone saw before 0032: the blue water. */
export const DEFAULT_THEME: Theme = { color: 'blue', mode: 'dark' };

export const THEME_COLORS = THEMES.map((t) => t.key) as ThemeColor[];
export const THEME_MODES: ThemeMode[] = ['dark', 'light', 'pastel'];

/** The colour the ground wears: the theme's own, or its pastel in pastel mode. */
export function themeHex(color: ThemeColor, mode: ThemeMode = 'dark'): string {
  const theme = THEMES.find((t) => t.key === color) ?? THEMES[6];
  return mode === 'pastel' ? theme.pastel : theme.hex;
}

/** A stored value read safely: anything unknown is the default. */
export function asTheme(color: unknown, mode: unknown): Theme {
  return {
    color: THEME_COLORS.includes(color as ThemeColor) ? (color as ThemeColor) : DEFAULT_THEME.color,
    mode: THEME_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : DEFAULT_THEME.mode,
  };
}
