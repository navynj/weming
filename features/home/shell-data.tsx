'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { MyCategory } from '@/lib/queries/profile';

/**
 * What the shell read once for every page (0059): my lanes, for the
 * settings sheet's tabs to open from at once, with nothing to fetch.
 */
type ShellData = { categories: MyCategory[] };

const Context = createContext<ShellData>({ categories: [] });

export function ShellDataProvider({ value, children }: { value: ShellData; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShellData(): ShellData {
  return useContext(Context);
}
