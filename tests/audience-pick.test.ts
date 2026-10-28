import { describe, expect, it } from 'vitest';

import { preselectLane, withPick } from '@/features/pool/audience';
import { landingHint, resolvePick } from '@/features/pool/pool-pick';

/**
 * Audience, record by record (H45): no lane links, so no defaults — a pool
 * turned on starts on the lane last picked on this device, or none.
 */
describe('the chip a pool starts on in Audience (H45)', () => {
  const lanes = ['pl-games', 'pl-notes'];

  it('is the lane last picked on this device', () => {
    expect(preselectLane('pl-notes', lanes)).toBe('pl-notes');
  });

  it('then none: one must be picked', () => {
    expect(preselectLane(null, lanes)).toBeNull();
  });

  it('only ever a lane of that pool', () => {
    expect(preselectLane('ql', lanes)).toBeNull();
  });
});

describe('switching a pool in Audience (0033)', () => {
  const start = [
    { poolId: 'p', poolLaneId: 'pl-games' },
    { poolId: 'q', poolLaneId: 'ql' },
  ];

  it('turns a pool on at a lane, keeping the others', () => {
    expect(withPick([], 'p', 'pl-games')).toEqual([{ poolId: 'p', poolLaneId: 'pl-games' }]);
    expect(withPick(start, 'r', 'rl')).toEqual([...start, { poolId: 'r', poolLaneId: 'rl' }]);
  });

  it('moves a pool to another of its lanes, once', () => {
    expect(withPick(start, 'p', 'pl-notes')).toEqual([
      { poolId: 'q', poolLaneId: 'ql' },
      { poolId: 'p', poolLaneId: 'pl-notes' },
    ]);
  });

  it('turns a pool off', () => {
    expect(withPick(start, 'p', null)).toEqual([{ poolId: 'q', poolLaneId: 'ql' }]);
    expect(withPick(start, 'z', null)).toEqual(start);
  });
});

describe('where a pick from a pool lands (0033)', () => {
  it('is my pool record with nobody together, joint with anyone or Everyone', () => {
    expect(resolvePick('pl-games', [])).toEqual({ kind: 'own', poolLaneId: 'pl-games' });
    expect(resolvePick('pl-games', ['mina'])).toEqual({ kind: 'joint', poolLaneId: 'pl-games' });
    expect(resolvePick('pl-games', [], true)).toEqual({ kind: 'joint', poolLaneId: 'pl-games' });
  });

  it('says so with no word "lane"', () => {
    expect(landingHint('Our Pool', [])).toBe('Yours · in Our Pool');
    expect(landingHint('Our Pool', ['Mina', 'Jae'])).toBe('Together with Mina, Jae');
    expect(landingHint('Our Pool', [], true)).toBe('Together with everyone');
  });
});
