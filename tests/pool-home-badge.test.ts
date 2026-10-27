import { describe, expect, it } from 'vitest';

import { placeCard, withEdits } from '@/features/home/grid';
import { withPoolBadge } from '@/features/pool/home-badge';
import { homeLaneFor } from '@/features/pool/links';
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

describe('where a joint splash shows on my Home, derived from my Home marker (H24, 0033)', () => {
  const links = (isHome: boolean) => [{ myCategoryId: 'my-games', poolLaneId: 'l-games', isHome }];

  it('a link marked Home brings the pool lane into my lane', () => {
    expect(homeLaneFor('l-games', links(true))).toBe('my-games');
  });

  it('a link not marked Home, or no link, leaves it in the pool’s column', () => {
    expect(homeLaneFor('l-games', links(false))).toBeNull();
    expect(homeLaneFor('l-games', [])).toBeNull();
    expect(homeLaneFor('l-other', links(true))).toBeNull();
  });

  it('takes the one marked Home when several of my lanes link one pool lane', () => {
    expect(
      homeLaneFor('l-games', [
        { myCategoryId: 'my-a', poolLaneId: 'l-games', isHome: false },
        { myCategoryId: 'my-b', poolLaneId: 'l-games', isHome: true },
      ]),
    ).toBe('my-b');
  });
});
