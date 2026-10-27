import { describe, expect, it } from 'vitest';

import type { PoolScope } from '@/features/pool/compose-scope';
import {
  homeWarnings,
  planFromHome,
  planFromPool,
  removedFrom,
  type Current,
} from '@/features/splash-sheet/conversion';

/**
 * Converting a record (0022, 0033) as the edit sheet decides it. From a
 * pool: its lane chips and Together — nobody picked keeps a pool record a
 * pool record, anyone picked (or Everyone) makes it joint, and "Make it
 * mine" turns a joint record into my pool record. From Home: my lanes; a
 * Home record's lane change moves no placement, and a pool or joint record
 * moved to my lane stays shared to its pool.
 */
const POOL: PoolScope = {
  poolId: 'p-a',
  poolName: 'Sarang',
  lanes: [
    { id: 'pl-word', name: '말씀', icon: '📖', homeLaneId: 'church' },
    { id: 'pl-thanks', name: '감사', icon: '🥹', homeLaneId: null },
    { id: 'pl-free', name: 'Free', icon: null, homeLaneId: null },
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

describe('from a pool: lane chips and Together', () => {
  it('turns a Home record or a pool record joint once anyone is picked, with those invitees', () => {
    expect(planFromPool(mine(), POOL, 'pl-word', ['u-mina'])).toEqual({
      op: 'to_joint',
      poolLaneId: 'pl-word',
      invitees: ['u-mina'],
      everyone: false,
    });
    expect(planFromPool(own, POOL, 'pl-free', ['u-mina'])).toEqual({
      op: 'to_joint',
      poolLaneId: 'pl-free',
      invitees: ['u-mina'],
      everyone: false,
    });
  });

  it('turns it joint with Everyone, naming no invitees: everyone is every member, later ones too', () => {
    expect(planFromPool(own, POOL, 'pl-thanks', ['u-mina'], false, true)).toEqual({
      op: 'to_joint',
      poolLaneId: 'pl-thanks',
      invitees: [],
      everyone: true,
    });
    expect(planFromPool(mine(), POOL, 'pl-word', [], false, true)).toEqual({
      op: 'to_joint',
      poolLaneId: 'pl-word',
      invitees: [],
      everyone: true,
    });
  });

  it('with nobody picked, places my Home record on the chosen pool lane, keeping its lane', () => {
    expect(planFromPool(mine(), POOL, 'pl-word', [])).toEqual({ op: 'none' });
    expect(planFromPool(mine(), POOL, 'pl-thanks', [])).toEqual({
      op: 'set_lane',
      myLaneId: 'church',
      placeOn: 'pl-thanks',
    });
  });

  it('with nobody picked, only moves my pool record among the pool lanes', () => {
    expect(planFromPool(own, POOL, 'pl-free', [])).toEqual({ op: 'none' });
    expect(planFromPool(own, POOL, 'pl-word', [])).toEqual({
      op: 'move_pool',
      poolLaneId: 'pl-word',
    });
  });

  it('only moves a joint record among the lanes: Together adds people, never a conversion', () => {
    expect(planFromPool(joint, POOL, 'pl-word', [])).toEqual({ op: 'none' });
    expect(planFromPool(joint, POOL, 'pl-free', ['u-mina'])).toEqual({
      op: 'move_pool',
      poolLaneId: 'pl-free',
    });
  });

  it('makes a joint record my pool record on "Make it mine", on the lane chosen', () => {
    expect(planFromPool(joint, POOL, 'pl-word', [], true)).toEqual({
      op: 'to_pool_record',
      poolLaneId: 'pl-word',
    });
    expect(planFromPool(joint, POOL, 'pl-thanks', [], true)).toEqual({
      op: 'to_pool_record',
      poolLaneId: 'pl-thanks',
    });
  });

  it('does nothing on a lane that is not this pool’s', () => {
    expect(planFromPool(mine(), POOL, 'pl-elsewhere', ['u-mina'])).toEqual({ op: 'none' });
  });

  it('lists the other pools a conversion takes it out of', () => {
    const shared = mine({
      sharedIn: [
        { poolId: 'p-a', poolLaneId: 'pl-word' },
        { poolId: 'p-b', poolLaneId: 'x' },
      ],
    });
    expect(removedFrom(shared, 'p-a')).toEqual(['p-b']);
  });
});

describe('from Home: my lanes, and what stays shared', () => {
  const poolName = (id: string) => ({ 'p-a': 'Sarang', 'p-b': 'Study Crew' })[id] ?? id;

  it('changes a Home record’s lane and says nothing: placements never move', () => {
    const shared = mine({
      declaredLaneId: 'church',
      sharedIn: [
        { poolId: 'p-a', poolLaneId: 'pl-word' },
        { poolId: 'p-b', poolLaneId: 'pb-notes' },
      ],
    });
    expect(planFromHome(shared, 'study')).toEqual({
      op: 'set_lane',
      myLaneId: 'study',
      placeOn: null,
    });
    expect(homeWarnings({ ...shared, poolId: null }, 'study', poolName)).toEqual([]);
    expect(planFromHome(shared, 'church')).toEqual({ op: 'none' });
    expect(planFromHome(shared, null)).toEqual({ op: 'none' });
  });

  it('says what becoming mine costs a joint record, then that it stays shared to its pool', () => {
    expect(planFromHome(joint, 'church')).toEqual({
      op: 'to_mine',
      myLaneId: 'church',
      placeOn: null,
    });
    expect(homeWarnings({ ...joint, poolId: 'p-a' }, 'church', poolName)).toEqual([
      'This is a joint splash in Sarang. Moving it to your lane makes it yours alone; members can no longer add to it.',
      'It stays shared to Sarang.',
    ]);
  });

  it('moves a pool record to my lane, staying shared to its pool', () => {
    expect(planFromHome(own, 'study')).toEqual({ op: 'to_mine', myLaneId: 'study', placeOn: null });
    expect(homeWarnings({ ...own, poolId: 'p-a' }, 'study', poolName)).toEqual([
      'It stays shared to Sarang.',
    ]);
    expect(homeWarnings({ ...own, poolId: 'p-a' }, null, poolName)).toEqual([]);
  });
});
