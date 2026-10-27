'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_THEME, themeHex, type Theme } from '@/lib/theme';

import { saveTheme } from './actions';

type ThemeApi = {
  theme: Theme;
  /** The colour's hex, for what is computed rather than styled (the stack's depth tint). */
  hex: string;
  /** Applies at once, saves behind it, and takes it back with a reason when refused. */
  choose: (next: Theme) => Promise<string | null>;
};

const ThemeContext = createContext<ThemeApi>({
  theme: DEFAULT_THEME,
  hex: themeHex(DEFAULT_THEME.color),
  choose: async () => null,
});

/** Where the theme is worn: on <html>, so pages, sheets and portals all read it. */
function wear(theme: Theme): void {
  document.documentElement.dataset.theme = theme.color;
  document.documentElement.dataset.mode = theme.mode;
}

/**
 * My theme (0032, H26): read on the server and worn on <html> from the first
 * paint; a change shows the moment it is chosen (CLAUDE.md, the principle).
 */
export function ThemeProvider({ initial, children }: { initial: Theme; children: ReactNode }) {
  const [theme, setTheme] = useState(initial);
  const choose = useCallback(
    async (next: Theme): Promise<string | null> => {
      const before = theme;
      setTheme(next);
      wear(next);
      const saved = await saveTheme(next);
      if (saved.ok) return null;
      setTheme(before);
      wear(before);
      return saved.message;
    },
    [theme],
  );
  const api = useMemo(
    () => ({ theme, hex: themeHex(theme.color, theme.mode), choose }),
    [theme, choose],
  );
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  return useContext(ThemeContext);
}
