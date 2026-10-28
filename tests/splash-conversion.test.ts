import { describe, expect, it } from 'vitest';

import type { PoolScope } from '@/features/pool/compose-scope';
import { planFromHome, planFromPool, type Current } from '@/features/splash-sheet/conversion';

/**
 * What the edit sheet does to a record's place (0020, 0033, H45). From a
 * pool: its lane chips — a joint record or my pool record moves among them,
 * my Home record is placed on the one chosen. From Home: my Home record's
 * lane, moving no placement. Nothing changes kind anywhere (H45).
 */
const POOL: PoolScope = {
  poolId: 'p-a',
  poolName: 'Sarang',
  lanes: [
    { id: 'pl-word', name: '말씀', icon: '📖' },
    { id: 'pl-thanks', name: '감사', icon: '🥹' },
    { id: 'pl-free', name: 'Free', icon: null },
  ],
  members: [
    { id: 'me', name: 'Yoonji', initials: 'YL' },
    { id: 'u-mina', name: 'Mina', initials: 'MK' },
  ],
};
const mine = (over: Partial<Current> = {}): Current => ({
  kind: 'mine',
  poolLaneId: null,
  declaredLaneId: 'church',
  sharedIn: [{ poolId: 'p-a', poolLaneId: 'pl-word' }],
  ...over,
});
const joint: Current = { kind: 'joint', poolLaneId: 'pl-word', declaredLaneId: null, sharedIn: [] };
const own: Current = { kind: 'own', poolLaneId: 'pl-free', declaredLaneId: null, sharedIn: [] };

describe('from a pool: its lane chips', () => {
  it('places my Home record on the chosen pool lane, keeping its lane', () => {
    expect(planFromPool(mine(), POOL, 'pl-thanks')).toEqual({
      op: 'set_lane',
      myLaneId: 'church',
      placeOn: 'pl-thanks',
    });
    expect(planFromPool(mine(), POOL, 'pl-word')).toEqual({ op: 'none' });
  });

  it('only moves my pool record or a joint record among the pool lanes', () => {
    expect(planFromPool(own, POOL, 'pl-word')).toEqual({ op: 'move_pool', poolLaneId: 'pl-word' });
    expect(planFromPool(own, POOL, 'pl-free')).toEqual({ op: 'none' });
    expect(planFromPool(joint, POOL, 'pl-free')).toEqual({
      op: 'move_pool',
      poolLaneId: 'pl-free',
    });
    expect(planFromPool(joint, POOL, 'pl-word')).toEqual({ op: 'none' });
  });

  it('does nothing on a lane that is not this pool’s', () => {
    expect(planFromPool(mine(), POOL, 'elsewhere')).toEqual({ op: 'none' });
    expect(planFromPool(joint, POOL, 'elsewhere')).toEqual({ op: 'none' });
  });
});

describe('from Home: my Home record’s lane', () => {
  it('changes lane and moves no placement', () => {
    expect(planFromHome(mine(), 'study')).toEqual({
      op: 'set_lane',
      myLaneId: 'study',
      placeOn: null,
    });
    expect(planFromHome(mine(), 'church')).toEqual({ op: 'none' });
    expect(planFromHome(mine(), null)).toEqual({ op: 'none' });
  });

  it('never converts a pool or joint record: Home files them instead (H45)', () => {
    expect(planFromHome(own, 'study')).toEqual({ op: 'none' });
    expect(planFromHome(joint, 'study')).toEqual({ op: 'none' });
  });
});
