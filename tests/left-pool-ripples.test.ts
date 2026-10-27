import { describe, expect, it } from 'vitest';

import { cardColumn, inLeftPool, isOrphanCard, laneOfCard, placeCard } from '@/features/home/grid';
import type { SplashSummary } from '@/features/splash/summary';

/** A ripple shown alone: its splash is unreadable, and it has no lane (H24 release 2). */
function lone(id: string): SplashSummary {
  return {
    id,
    title: '',
    ghostTitle: 'from the trip',
    declaredLaneId: null,
    icon: null,
    laneIds: [],
    declaredRange: null,
    range: { start: '2026-10-22', end: '2026-10-22' },
    count: 1,
    blocks: [],
    latestCreatedAt: '2026-10-22T18:00:00Z',
    createdAt: '2026-10-22T18:00:00Z',
    pinnedAt: null,
    sessionId: null,
    orphan: true,
  } as unknown as SplashSummary;
}

describe('a ripple from a pool I left, on Home (0041)', () => {
  it('without its pool, has no column at all: laneless', () => {
    const card = placeCard(lone('r-1'), '', 'UTC');
    expect(cardColumn(card)).toBeNull();
    expect(isOrphanCard(card, [{ id: 'my-trips' }])).toBe(true);
  });

  it('sits in that pool’s column, named "A pool you left"', () => {
    const card = inLeftPool(placeCard(lone('r-1'), '', 'UTC'), 'p-left');
    expect(cardColumn(card)).toBe('pool:p-left');
    expect(isOrphanCard(card, [{ id: 'my-trips' }, { id: 'pool:p-left' }])).toBe(false);
    expect(laneOfCard(card, [])).toEqual({ icon: null, name: 'A pool you left' });
  });
});
