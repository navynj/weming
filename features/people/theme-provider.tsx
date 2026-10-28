'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_THEME,
  resolveTheme,
  themeHex,
  type MyTheme,
  type PoolColors,
  type Theme,
  type ThemeColor,
  type ThemeMode,
} from '@/lib/theme';

import { saveTheme, setMyPoolTheme, setPoolTheme } from './actions';

/** The pool I am in now, and its two colours (0059); null on Home. */
type Place = { poolId: string; colors: PoolColors } | null;

type ThemeApi = {
  /** What this place wears: resolved from mine and the pool's (lib/theme.ts). */
  theme: Theme;
  /** The colour's hex, for what is computed rather than styled (the stack's depth tint). */
  hex: string;
  /** My own settings: Home colour, mode, everywhere. */
  mine: MyTheme;
  place: Place;
  /** Each applies at once, saves behind it, and takes it back with a reason when refused. */
  chooseHome: (color: ThemeColor, everywhere: boolean) => Promise<string | null>;
  chooseMode: (mode: ThemeMode) => Promise<string | null>;
  choosePoolColor: (color: ThemeColor | null) => Promise<string | null>;
  chooseMyPoolColor: (color: ThemeColor | null) => Promise<string | null>;
  /** A pool's screen, arriving and leaving: its colours worn while there. */
  enter: (poolId: string, colors: PoolColors) => void;
  leave: (poolId: string) => void;
};

const MINE: MyTheme = { home: DEFAULT_THEME.color, mode: DEFAULT_THEME.mode, everywhere: false };
const nothing = async (): Promise<string | null> => null;

const ThemeContext = createContext<ThemeApi>({
  theme: DEFAULT_THEME,
  hex: themeHex(DEFAULT_THEME.color),
  mine: MINE,
  place: null,
  chooseHome: nothing,
  chooseMode: nothing,
  choosePoolColor: nothing,
  chooseMyPoolColor: nothing,
  enter: () => {},
  leave: () => {},
});

/** Where the theme is worn: on <html>, so pages, sheets and portals all read it. */
function wear(theme: Theme): void {
  document.documentElement.dataset.theme = theme.color;
  document.documentElement.dataset.mode = theme.mode;
}

/**
 * My theme (0032, H26; 0059): read on the server and worn on <html> from the
 * first paint as Home's; in a pool, that pool's resolution (my colour
 * there, my everywhere colour, the pool's, my Home colour) while I am in
 * it. A change shows the moment it is chosen (CLAUDE.md, the principle).
 */
export function ThemeProvider({ initial, children }: { initial: MyTheme; children: ReactNode }) {
  const [mine, setMine] = useState(initial);
  const [place, setPlace] = useState<Place>(null);
  const theme = resolveTheme(mine, place?.colors ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => wear(theme), [theme.color, theme.mode]);

  const saveMine = useCallback(
    async (next: MyTheme): Promise<string | null> => {
      const before = mine;
      setMine(next);
      const saved = await saveTheme(next);
      if (saved.ok) return null;
      setMine(before);
      return saved.message;
    },
    [mine],
  );
  const savePlace = useCallback(
    async (
      key: keyof PoolColors,
      color: ThemeColor | null,
      action: (
        poolId: string,
        color: ThemeColor | null,
      ) => Promise<{ ok: boolean; message?: string }>,
    ): Promise<string | null> => {
      if (!place) return null;
      const before = place;
      setPlace({ ...place, colors: { ...place.colors, [key]: color } });
      const saved = await action(place.poolId, color);
      if (saved.ok) return null;
      setPlace(before);
      return saved.message ?? 'That colour could not be saved.';
    },
    [place],
  );

  const api = useMemo<ThemeApi>(
    () => ({
      theme,
      hex: themeHex(theme.color, theme.mode),
      mine,
      place,
      chooseHome: (home, everywhere) => saveMine({ ...mine, home, everywhere }),
      chooseMode: (mode) => saveMine({ ...mine, mode }),
      choosePoolColor: (color) => savePlace('pool', color, setPoolTheme),
      chooseMyPoolColor: (color) => savePlace('mine', color, setMyPoolTheme),
      enter: (poolId, colors) => setPlace({ poolId, colors }),
      leave: (poolId) => setPlace((now) => (now?.poolId === poolId ? null : now)),
    }),
    [theme, mine, place, saveMine, savePlace],
  );
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  return useContext(ThemeContext);
}

/**
 * In a pool (0059): wears its colours while its screen is shown, and hands
 * the theme back to Home's on leaving. The server drew the pool's own
 * colour on its screen already, so the first paint is right.
 */
export function PlaceTheme({ poolId, colors }: { poolId: string; colors: PoolColors }) {
  const { enter, leave } = useTheme();
  useEffect(() => {
    enter(poolId, colors);
    return () => leave(poolId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, colors.pool, colors.mine]);
  return null;
}
