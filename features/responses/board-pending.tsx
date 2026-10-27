'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Card } from '@/features/home/grid';

import type { BoardResponses } from './model';

/**
 * The board under an open splash shows a reaction or reply the moment it is
 * made (CLAUDE.md, the principle; H25): the page hands its splash's new
 * numbers here, and the board draws them until a re-read newer than the
 * change arrives with the server's own.
 */
type Pending = Record<string, { value: BoardResponses; at: string }>;

type Api = { pending: Pending; show: (splashId: string, value: BoardResponses) => void };

const Context = createContext<Api>({ pending: {}, show: () => {} });

export function BoardResponsesProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending>({});
  const show = useCallback((splashId: string, value: BoardResponses) => {
    setPending((current) => ({
      ...current,
      [splashId]: { value, at: new Date().toISOString() },
    }));
  }, []);
  const api = useMemo(() => ({ pending, show }), [pending, show]);
  return <Context.Provider value={api}>{children}</Context.Provider>;
}

export function useShowOnBoard(): Api['show'] {
  return useContext(Context).show;
}

/** The cards with any change made since they were read drawn over the server's numbers. */
export function useCardsWithPending(cards: Card[]): Card[] {
  const { pending } = useContext(Context);
  return useMemo(() => {
    if (Object.keys(pending).length === 0) return cards;
    return cards.map((card) => {
      const change = pending[card.splash.id];
      if (!change || (card.respondedAsOf && card.respondedAsOf > change.at)) return card;
      return { ...card, responses: change.value };
    });
  }, [cards, pending]);
}
