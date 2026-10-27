import { describe, expect, it } from 'vitest';

import { placeCard, withEdits } from '@/features/home/grid';
import { jointLaneFor } from '@/features/pool/direction';
import { withPoolBadge } from '@/features/pool/home-badge';
import type { SplashSummary } from '@/features/splash/summary';

function summary(id: string): SplashSummary {
  return {
    id,
    title: id,
    ghostTitle: null,
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
    orphan: false,
  } as unknown as SplashSummary;
}

describe('the pool badge on Home (H23, H24)', () => {
  it('puts a joint entry whose pool lane no link of mine brings in in its pool’s column, with the badge and tag', () => {
    const card = withPoolBadge(placeCard(summary('s-joint'), '', 'UTC'), {
      poolId: 'p-ours',
      poolName: 'Our Pool',
      linkedLane: null,
      poolLane: { name: 'Games', icon: '🎲' },
    });
    expect(card.column).toBe('pool:p-ours');
    expect(card.pools).toEqual(['Our Pool']);
    expect(card.origins).toEqual(['Our Pool · 🎲 Games']);
    expect(card.href).toBe('/pool/p-ours/splash/s-joint');
  });

  it('marks a joint entry on Home as joint, so it is drawn as a pill', () => {
    const card = withPoolBadge(placeCard(summary('s-joint'), '', 'UTC'), {
      poolId: 'p-ours',
      poolName: 'Our Pool',
      linkedLane: 'my-media',
      poolLane: { name: 'Games', icon: '🎲' },
    });
    expect(card.joint).toBe(true);
    expect(withPoolBadge(placeCard(summary('s-mine'), '', 'UTC'), undefined).joint).toBeUndefined();
  });

  it('lends the pool lane’s emoji to a mark in the pool’s column, never leaving it blank', () => {
    const card = withPoolBadge(placeCard(summary('s-joint'), '', 'UTC'), {
      poolId: 'p-ours',
      poolName: 'Our Pool',
      linkedLane: null,
      poolLane: { name: 'Games', icon: '🎲' },
    });
    expect(card.lane).toEqual({ icon: '🎲', name: 'Our Pool' });
  });

  it('keeps a joint entry whose pool lane is brought into my lane in that lane’s column', () => {
    const card = withPoolBadge(placeCard(summary('s-joint'), '', 'UTC'), {
      poolId: 'p-ours',
      poolName: 'Our Pool',
      linkedLane: 'my-media',
      poolLane: { name: 'Games', icon: '🎲' },
    });
    expect(card.column).toBe('my-media');
    expect(card.pools).toEqual(['Our Pool']);
    // My lane names it there, not the pool lane.
    expect(card.lane).toBeUndefined();
  });

  it('leaves my own splash shared to a pool unbadged', () => {
    const card = withPoolBadge(placeCard(summary('s-mine'), '', 'UTC'), undefined);
    expect(card.pools).toBeUndefined();
    expect(card.href).toBeUndefined();
    expect(card.column).toBeUndefined();
  });
});

describe('a joint splash made mine, on Home (0022)', () => {
  it('leaves its pool’s column and badge for the lane it now declares, at once', () => {
    const joint = withPoolBadge(placeCard(summary('s-joint'), '', 'UTC'), {
      poolId: 'p-ours',
      poolName: 'Our Pool',
      linkedLane: null,
      poolLane: { name: 'Games', icon: '🎲' },
    });
    const [mine] = withEdits([joint], {
      's-joint': { title: 's-joint', icon: null, declaredLaneId: 'my-games', kind: 'mine' },
    });
    expect(mine.column).toBeUndefined();
    expect(mine.pools).toBeUndefined();
    expect(mine.href).toBeUndefined();
    expect(mine.splash.declaredLaneId).toBe('my-games');
  });
});

describe('where a joint splash shows on my Home, derived from my link (H24)', () => {
  const links = (direction: 'out' | 'both' | 'in') => [
    { myCategoryId: 'my-games', poolLaneId: 'l-games', direction },
  ];

  it('↔ both and → in bring the pool lane into my lane', () => {
    expect(jointLaneFor('l-games', links('both'))).toBe('my-games');
    expect(jointLaneFor('l-games', links('in'))).toBe('my-games');
  });

  it('← out, or no link, leaves it in the pool’s column', () => {
    expect(jointLaneFor('l-games', links('out'))).toBeNull();
    expect(jointLaneFor('l-games', [])).toBeNull();
    expect(jointLaneFor('l-other', links('both'))).toBeNull();
  });

  it('prefers ↔ both when several of my lanes bring one pool lane in, then the first', () => {
    expect(
      jointLaneFor('l-games', [
        { myCategoryId: 'my-a', poolLaneId: 'l-games', direction: 'in' },
        { myCategoryId: 'my-b', poolLaneId: 'l-games', direction: 'both' },
      ]),
    ).toBe('my-b');
    expect(
      jointLaneFor('l-games', [
        { myCategoryId: 'my-a', poolLaneId: 'l-games', direction: 'in' },
        { myCategoryId: 'my-c', poolLaneId: 'l-games', direction: 'in' },
      ]),
    ).toBe('my-a');
  });
});
