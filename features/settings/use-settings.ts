'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/** The query that opens the settings sheet on a tab (0059): `?settings=theme`. */
export const SETTINGS = 'settings';

/** Opened from inside the app, so closing steps back; opened from a link, it replaces. */
let openedHere = false;

/**
 * The settings sheet's place in the URL (0059): a query, written with the
 * browser's own history, so opening it fetches nothing and back closes it;
 * a link with it opens the sheet on that tab.
 */
export function useSettings(): {
  tab: string | null;
  open: (tab: string) => void;
  select: (tab: string) => void;
  close: () => void;
} {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab = params.get(SETTINGS);
  const urlWith = useCallback(
    (next: string | null): string => {
      const query = new URLSearchParams(params);
      if (next) query.set(SETTINGS, next);
      else query.delete(SETTINGS);
      return query.size ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );
  return {
    tab,
    open: (next) => {
      openedHere = true;
      window.history.pushState(null, '', urlWith(next));
    },
    select: (next) => window.history.replaceState(null, '', urlWith(next)),
    close: () => {
      if (openedHere) {
        openedHere = false;
        window.history.back();
      } else window.history.replaceState(null, '', urlWith(null));
    },
  };
}
