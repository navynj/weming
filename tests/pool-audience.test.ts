import { describe, expect, it } from 'vitest';

import { audienceLabel } from '@/features/pool/audience';
import { chipLabel, type AudiencePool } from '@/features/pool/audience-sheet';

const pools: AudiencePool[] = [
  {
    id: 'p1',
    name: 'Our Pool',
    lanes: [
      { id: 'l-trips', name: 'Trips', icon: '🏕' },
      { id: 'l-food', name: 'Food', icon: null },
    ],
  },
  { id: 'p2', name: 'Crew', lanes: [{ id: 'l-crew', name: 'Crew', icon: '🎲' }] },
  { id: 'p3', name: 'Study', lanes: [] },
];

describe('the Audience chip (H23, 0033)', () => {
  it('says Only me, a pool’s name, or N pools — what the placements are', () => {
    expect(audienceLabel([])).toBe('Only me');
    expect(audienceLabel(['Our Pool'])).toBe('Our Pool');
    expect(audienceLabel(['Our Pool', 'Crew'])).toBe('2 pools');
  });

  it('names one pool with its lane, emoji first when it has one', () => {
    expect(chipLabel([{ poolId: 'p1', poolLaneId: 'l-trips' }], pools)).toBe('Our Pool · 🏕 Trips');
    expect(chipLabel([{ poolId: 'p1', poolLaneId: 'l-food' }], pools)).toBe('Our Pool · Food');
  });

  it('says Only me with none, N pools with several', () => {
    expect(chipLabel([], pools)).toBe('Only me');
    expect(
      chipLabel(
        [
          { poolId: 'p1', poolLaneId: 'l-trips' },
          { poolId: 'p2', poolLaneId: 'l-crew' },
        ],
        pools,
      ),
    ).toBe('2 pools');
  });

  it('falls back to the pool’s name, or "A pool", when the lane or pool is unknown', () => {
    expect(chipLabel([{ poolId: 'p1', poolLaneId: 'gone' }], pools)).toBe('Our Pool');
    expect(chipLabel([{ poolId: 'gone', poolLaneId: 'x' }], pools)).toBe('A pool');
  });
});
