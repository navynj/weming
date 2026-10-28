import type { PoolScope } from '@/features/pool/compose-scope';

/**
 * What the edit sheet, opened in a pool, does to a record's place there
 * (0020, 0033). Pure, so the rules are tested here and the sheet only draws
 * them. Nothing changes kind: a record becomes joint only by being written
 * so, and leaves a pool through Audience (H45).
 */
export type SplashKind = 'mine' | 'own' | 'joint';

/** One database act, or nothing to do. */
export type Conversion =
  | { op: 'none' }
  | { op: 'move_pool'; poolLaneId: string } // move_pool_splash (0020)
  | { op: 'set_lane'; myLaneId: string | null; placeOn: string | null };

/** Where the record stands now, as the sheet loaded it. */
export type Current = {
  kind: SplashKind;
  /** Joint: its pool lane; pool record: its placement's pool lane. */
  poolLaneId: string | null;
  /** Mine: its declared lane. */
  declaredLaneId: string | null;
  /** Mine: where it is shared now, pool by pool. */
  sharedIn: { poolId: string; poolLaneId: string }[];
};

/**
 * From a pool screen (0033): that pool's lane chips. A joint record and my
 * pool record move among the pool's lanes; my Home record is placed on the
 * lane chosen there.
 */
export function planFromPool(current: Current, scope: PoolScope, poolLaneId: string): Conversion {
  if (!scope.lanes.some((l) => l.id === poolLaneId)) return { op: 'none' };
  if (current.kind === 'joint' || current.kind === 'own') {
    return current.poolLaneId === poolLaneId ? { op: 'none' } : { op: 'move_pool', poolLaneId };
  }
  const here = current.sharedIn.find((s) => s.poolId === scope.poolId)?.poolLaneId ?? null;
  return here === poolLaneId
    ? { op: 'none' }
    : { op: 'set_lane', myLaneId: current.declaredLaneId, placeOn: poolLaneId };
}

/** From Home, my Home record's lane: a change of lane moves no placement (0033). */
export function planFromHome(current: Current, myLaneId: string | null): Conversion {
  if (current.kind !== 'mine' || !myLaneId || myLaneId === current.declaredLaneId) {
    return { op: 'none' };
  }
  return { op: 'set_lane', myLaneId, placeOn: null };
}
