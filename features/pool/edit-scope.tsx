'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { PoolScope } from './compose-scope';

/**
 * Which pool a screen belongs to, for the edit sheet (review, 0022): opened
 * from a pool, a splash is edited with that pool's lane chips and Together;
 * opened from Home (no scope), with my own lanes.
 */
const Context = createContext<PoolScope | null>(null);

export function PoolEditScope({ scope, children }: { scope: PoolScope; children: ReactNode }) {
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}

export function usePoolEditScope(): PoolScope | null {
  return useContext(Context);
}
