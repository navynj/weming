import { describe, expect, it } from 'vitest';

import { defaultAudience, linkedPools } from '@/features/pool/audience';
import { DIRECTION_CAPTION, DIRECTION_GLYPH, nextDirection } from '@/features/pool/direction';
import { landingHint, resolvePick } from '@/features/pool/pool-pick';

/** A pool lane, Games, as compose sees it: linked to my "Games" lane in some direction, or not. */
const games = (direction: 'out' | 'both' | 'in' | null) => ({
  id: 'pl-games',
  name: 'Games',
  icon: '🎲',
  myCategoryId: direction ? 'my-games' : null,
  direction,
});
const nameOf = (id: string): string | null => (id === 'my-games' ? 'Games' : null);

describe('where a pick lands (0017)', () => {
  it('Just mine off, linked both or in: joint, my ripple in my linked lane', () => {
    for (const d of ['both', 'in'] as const) {
      expect(resolvePick(games(d), false)).toEqual({ kind: 'joint', poolLaneId: 'pl-games' });
      expect(landingHint(games(d), false, nameOf)).toBe('Joint · also in your Games');
    }
  });

  it('Just mine off, linked out or not at all: joint, my ripple with no lane', () => {
    for (const d of ['out', null] as const) {
      expect(resolvePick(games(d), false)).toEqual({ kind: 'joint', poolLaneId: 'pl-games' });
      expect(landingHint(games(d), false, nameOf)).toBe('Joint · pool only');
    }
  });

  it('Just mine on, linked both or in: my own splash in my linked lane, placed here', () => {
    for (const d of ['both', 'in'] as const) {
      expect(resolvePick(games(d), true)).toEqual({
        kind: 'lane',
        poolLaneId: 'pl-games',
        myCategoryId: 'my-games',
      });
      expect(landingHint(games(d), true, nameOf)).toBe('Yours · in Games');
    }
  });

  it('Just mine on, linked out or not at all: a Just-mine splash with no lane', () => {
    for (const d of ['out', null] as const) {
      expect(resolvePick(games(d), true)).toEqual({ kind: 'own', poolLaneId: 'pl-games' });
      expect(landingHint(games(d), true, nameOf)).toBe('Yours · pool only');
    }
  });
});

describe('the Audience default from Home (0017)', () => {
  const links = (direction: 'out' | 'both' | 'in') => [
    { myCategoryId: 'my-games', poolId: 'p', poolName: 'Our Pool', direction },
  ];

  it('shares a splash in an out or both lane by default', () => {
    expect(defaultAudience('my-games', links('out'))).toEqual(['p']);
    expect(defaultAudience('my-games', links('both'))).toEqual(['p']);
  });

  it('defaults an in lane to Only me for that pool, still offering its switch', () => {
    expect(defaultAudience('my-games', links('in'))).toEqual([]);
    expect(linkedPools('my-games', links('in'))).toEqual(['p']);
  });

  it('reads a link with no direction as both', () => {
    expect(
      defaultAudience('my-games', [{ myCategoryId: 'my-games', poolId: 'p', poolName: 'P' }]),
    ).toEqual(['p']);
  });
});

describe('the direction control', () => {
  it('cycles both → out → in, drawn ↔ ← → with the pool lane at the left', () => {
    expect(nextDirection('both')).toBe('out');
    expect(nextDirection('out')).toBe('in');
    expect(nextDirection('in')).toBe('both');
    // Arrows point where records go: mine (right) into the pool (left) is ←.
    expect(DIRECTION_GLYPH).toEqual({ out: '←', both: '↔', in: '→' });
    expect(DIRECTION_CAPTION).toEqual({
      out: 'Share my records to the pool',
      both: 'Share both ways',
      in: 'Bring pool records to my lane',
    });
  });
});
