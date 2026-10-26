'use client';

import { useSyncExternalStore } from 'react';

/** The board shows a week (the default) or a month; remembered per device (review). */
export type BoardSpan = 'week' | 'month';

const KEY = 'weming.board-span';
const EVENT = 'weming:board-span';

function read(): BoardSpan {
  try {
    return window.localStorage.getItem(KEY) === 'month' ? 'month' : 'week';
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

export function useBoardSpan(): [BoardSpan, (span: BoardSpan) => void] {
  const span = useSyncExternalStore(subscribe, read, () => 'week' as const);
  const set = (next: BoardSpan): void => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Not remembered, then; the switch still happens below.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [span, set];
}
