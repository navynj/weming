'use client';

import { useSyncExternalStore } from 'react';

/**
 * The board shows a week (the default) or a month; remembered per device
 * (review), and per board: Home's choice is Home's, and each pool opens on
 * Week until it is switched there (2026-10-31).
 */
export type BoardSpan = 'week' | 'month';

const KEY = 'weming.board-span';
const EVENT = 'weming:board-span';

function keyOf(scope: string | null): string {
  return scope === null ? KEY : `${KEY}.${scope}`;
}

function read(scope: string | null): BoardSpan {
  try {
    return window.localStorage.getItem(keyOf(scope)) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** `scope`: a pool's id, for its own span; none for Home's. */
export function useBoardSpan(scope: string | null = null): [BoardSpan, (span: BoardSpan) => void] {
  const span = useSyncExternalStore(
    subscribe,
    () => read(scope),
    () => 'week' as const,
  );
  const set = (next: BoardSpan): void => {
    try {
      window.localStorage.setItem(keyOf(scope), next);
    } catch {
      // Not remembered, then; the switch still happens below.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [span, set];
}
