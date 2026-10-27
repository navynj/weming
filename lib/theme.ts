/**
 * A person's theme (0032, 0036): one colour of twelve and a mode. Dark mode
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
  {
    key: 'red',
    name: 'Red',
    hex: '#D92D20',
    pastel: {
      tone: '#F58880',
      fill: '#FFD1CD',
      card: '#FEF9F8',
      stack: ['#FFE6E4', '#FFCDC8'],
      rule: '#FFEDEB',
    },
  },
  {
    key: 'orange',
    name: 'Orange',
    hex: '#D9540F',
    pastel: {
      tone: '#E29942',
      fill: '#FED6AD',
      card: '#FFF9F3',
      stack: ['#FDE9D5', '#FBD3AA'],
      rule: '#FBF0E4',
    },
  },
  {
    key: 'yellow',
    name: 'Yellow',
    hex: '#B07C00',
    pastel: {
      tone: '#D0A535',
      fill: '#F2DCA9',
      card: '#FEFAF1',
      stack: ['#F7ECD3', '#EFD9A6'],
      rule: '#F8F1E3',
    },
  },
  {
    key: 'green',
    name: 'Green',
    hex: '#14804A',
    pastel: {
      tone: '#5CC486',
      fill: '#BAECCA',
      card: '#F4FDF7',
      stack: ['#DBF4E3', '#B7E9C7'],
      rule: '#E8F6EC',
    },
  },
  {
    key: 'lime',
    name: 'Lime',
    hex: '#4E8A1A',
    pastel: {
      tone: '#93BB5A',
      fill: '#D1E8B6',
      card: '#F8FCF3',
      stack: ['#E6F2D9', '#CDE4B3'],
      rule: '#EEF5E6',
    },
  },
  {
    key: 'sky',
    name: 'Sky',
    hex: '#0B7FC2',
    pastel: {
      tone: '#59B5EF',
      fill: '#90C5EA',
      card: '#F6FAFD',
      stack: ['#E3F0FA', '#C8E2F4'],
      rule: '#EEF6FC',
    },
  },
  // Mint (0036): an aqua mint beside sky's powder blue (Yoonji, in the session).
  {
    key: 'mint',
    name: 'Mint',
    hex: '#14857F',
    pastel: {
      tone: '#4DBCBE',
      fill: '#A6E3E3',
      card: '#F8FDFD',
      stack: ['#E9F8F8', '#D2F1F1'],
      rule: '#F2FBFB',
    },
  },
  {
    key: 'blue',
    name: 'Blue',
    hex: '#0507C9',
    pastel: {
      tone: '#8BA6FF',
      fill: '#D1DDFF',
      card: '#F8FAFE',
      stack: ['#E6ECFE', '#CDDAFE'],
      rule: '#EDF2FE',
    },
  },
  // A step toward blue (Yoonji, in the session): it read reddish.
  {
    key: 'purple',
    name: 'Purple',
    hex: '#6338D8',
    pastel: {
      tone: '#AE9BF9',
      fill: '#DED8FF',
      card: '#FAF9FF',
      stack: ['#EDEAFE', '#DBD5FF'],
      rule: '#F2F0FF',
    },
  },
  {
    key: 'pink',
    name: 'Pink',
    hex: '#C2307A',
    pastel: {
      tone: '#DE8ACF',
      fill: '#FBCDF2',
      card: '#FFF8FD',
      stack: ['#FCE5F7', '#F8CAEF'],
      rule: '#FBEDF8',
    },
  },
  {
    key: 'brown',
    name: 'Brown',
    hex: '#8A5A2B',
    pastel: {
      tone: '#B4967A',
      fill: '#DCC8B4',
      card: '#FAF7F4',
      stack: ['#F1E9E1', '#E6D8CB'],
      rule: '#F6F1EC',
    },
  },
  {
    key: 'black',
    name: 'Black',
    hex: '#161621',
    pastel: {
      tone: '#A6A6A6',
      fill: '#DADADA',
      card: '#F9F9F9',
      stack: ['#F0F0F0', '#E5E5E5'],
      rule: '#F6F6F6',
    },
  },
] as const;

/**
 * Pastel mode (0036, Yoonji's mockups): a white ground; its words and marks
 * in each colour's soft `tone` (below 3:1 on white, by her choice for this
 * mode); its accent and filled labels in the `fill`; cards in a near-white
 * `card` tint, the ones beneath deepening through `stack`; lane rules in
 * `rule`. Words on a fill and body text take this soft grey, 4.5:1 or
 * better on every fill (tests/theme.test.tsx).
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
  return mode === 'pastel' ? theme.pastel.fill : theme.hex;
}

/** A stored value read safely: anything unknown is the default. */
export function asTheme(color: unknown, mode: unknown): Theme {
  return {
    color: THEME_COLORS.includes(color as ThemeColor) ? (color as ThemeColor) : DEFAULT_THEME.color,
    mode: THEME_MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : DEFAULT_THEME.mode,
  };
}
