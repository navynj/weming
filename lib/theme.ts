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
    hex: '#C08600',
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
    hex: '#E5318C',
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

/** What I set for my theme (0059): my Home colour, my mode, and whether my colour applies in every pool. */
export type MyTheme = { home: ThemeColor; mode: ThemeMode; everywhere: boolean };

/**
 * A pool's two sources (0059): its members' colour, and mine there; each
 * with the mode chosen with it (0062), absent or null for my Home mode.
 */
export type PoolColors = {
  pool: ThemeColor | null;
  mine: ThemeColor | null;
  poolMode?: ThemeMode | null;
  mineMode?: ThemeMode | null;
};

/**
 * What a place wears (0059, Yoonji, in the session). In a pool: my colour
 * here ?? my Home colour if I apply it everywhere ?? the pool's ?? my Home
 * colour ?? the app's. On Home (no pool): my Home colour ?? the app's. A
 * colour and its mode are one choice (0062): the mode comes from the source
 * the colour came from — mine here or the pool's when chosen with it — and
 * is otherwise my Home mode.
 */
export function resolveTheme(mine: Partial<MyTheme> | null, place: PoolColors | null): Theme {
  const home = mine?.home ?? null;
  const homeMode = mine?.mode ?? DEFAULT_THEME.mode;
  if (place?.mine) return { color: place.mine, mode: place.mineMode ?? homeMode };
  if (place && mine?.everywhere && home) return { color: home, mode: homeMode };
  if (place?.pool) return { color: place.pool, mode: place.poolMode ?? homeMode };
  return { color: home ?? DEFAULT_THEME.color, mode: homeMode };
}

/** A stored colour read safely: anything unknown is none. */
export function asThemeColor(value: unknown): ThemeColor | null {
  return THEME_COLORS.includes(value as ThemeColor) ? (value as ThemeColor) : null;
}

/** A stored mode read safely: anything unknown is none. */
export function asThemeMode(value: unknown): ThemeMode | null {
  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : null;
}

/**
 * The first paint of a pool loaded directly (a reload, a link): <html> is
 * the root layout's, Home's, so a line run as the page is read puts the
 * pool's colour and mode on it before anything shows. Both values are the
 * fixed keys of lib/theme.ts, never anyone's text.
 */
export function wornHere(theme: Theme): string {
  return `document.documentElement.dataset.theme=${JSON.stringify(theme.color)};document.documentElement.dataset.mode=${JSON.stringify(theme.mode)};`;
}
