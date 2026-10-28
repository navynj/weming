'use client';

import { createContext, useContext } from 'react';

/** What the client already knows of a record before its page arrives. */
export type OpeningHeader = { title: string | null; icon: string | null; poolName: string | null };

export type Openings = {
  /** Opens the record's sheet now, with what is known, and routes to it. */
  open: (url: string, header?: OpeningHeader | null) => void;
  /** Prefetches the record's page in full, so the tap has it before the sheet is up. */
  prefetch: (url: string) => void;
  /** Read once by a routed sheet as it mounts: whether it takes over an open one. */
  peek: (path: string) => 'adopt' | 'dismissed' | null;
  /** The routed sheet is up: the opening one goes, in the same frame. */
  settle: () => void;
};

export const OpeningContext = createContext<Openings | null>(null);

/** The shell's record opener (features/splash/splash-opening), or null outside the shell. */
export function useSplashOpening(): Openings | null {
  return useContext(OpeningContext);
}
