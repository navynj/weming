import type { PoolScope } from '@/features/pool/compose-scope';

/**
 * Converting a record between my Home record, my pool record and joint
 * (0022, 0033), as the edit sheet decides it. Pure, so the rules are tested
 * here and the sheet only draws them. Kept pairs (decision 3): Home record ↔
 * joint, pool record ↔ joint, and a pool record moved to Home.
 */
export type SplashKind = 'mine' | 'own' | 'joint';

/** One database act, or nothing to convert. */
export type Conversion =
  | { op: 'none' }
  | { op: 'move_pool'; poolLaneId: string } // move_pool_splash (0020)
  | { op: 'to_joint'; poolLaneId: string; invitees: string[]; everyone: boolean }
  | { op: 'to_pool_record'; poolLaneId: string } // splash_to_pool_record (0033)
  | { op: 'to_mine'; myLaneId: string; placeOn: string | null }
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
 * From a pool screen (0033): that pool's lane chips and Together. A joint
 * record moves among the pool's lanes (Together only adds people); my pool
 * record becomes joint once anyone is picked, else moves; my Home record
 * becomes joint once anyone is picked, else is placed on the lane chosen.
 * `toPoolRecord` is "Make it mine" on a joint record only I wrote in.
 */
export function planFromPool(
  current: Current,
  scope: PoolScope,
  poolLaneId: string,
  together: string[],
  toPoolRecord = false,
  everyone = false,
): Conversion {
  if (!scope.lanes.some((l) => l.id === poolLaneId)) return { op: 'none' };
  if (current.kind === 'joint') {
    if (toPoolRecord) return { op: 'to_pool_record', poolLaneId };
    return current.poolLaneId === poolLaneId ? { op: 'none' } : { op: 'move_pool', poolLaneId };
  }
  if (everyone || together.length > 0) {
    return { op: 'to_joint', poolLaneId, invitees: everyone ? [] : together, everyone };
  }
  if (current.kind === 'own') {
    return current.poolLaneId === poolLaneId ? { op: 'none' } : { op: 'move_pool', poolLaneId };
  }
  const here = current.sharedIn.find((s) => s.poolId === scope.poolId)?.poolLaneId ?? null;
  return here === poolLaneId
    ? { op: 'none' }
    : { op: 'set_lane', myLaneId: current.declaredLaneId, placeOn: poolLaneId };
}

/**
 * From Home: one of my lanes. My Home record changes lane and moves no
 * placement (0033); my pool record moves to Home ("Move to Home…"), and a
 * joint record only I wrote in becomes mine — each staying shared to its
 * pool on the pool lane it was on.
 */
export function planFromHome(current: Current, myLaneId: string | null): Conversion {
  if (!myLaneId) return { op: 'none' };
  if (current.kind === 'mine') {
    return myLaneId === current.declaredLaneId
      ? { op: 'none' }
      : { op: 'set_lane', myLaneId, placeOn: null };
  }
  return { op: 'to_mine', myLaneId, placeOn: null };
}

/**
 * What a Home edit does, said before saving (review). A lane change of my
 * Home record says nothing: sharing is per record and stays. A pool or joint
 * record moved to my lane stays shared to its pool; a joint one first says
 * what becoming mine costs.
 */
export function homeWarnings(
  current: Current & { poolId: string | null },
  myLaneId: string | null,
  poolName: (id: string) => string,
): string[] {
  const plan = planFromHome(current, myLaneId);
  if (plan.op === 'none' || current.kind === 'mine' || !current.poolId) return [];
  const pool = poolName(current.poolId);
  const stays = `It stays shared to ${pool}.`;
  return current.kind === 'joint'
    ? [
        `This is a joint splash in ${pool}. Moving it to your lane makes it yours alone; members can no longer add to it.`,
        stays,
      ]
    : [stays];
}

/** The pools a conversion in one pool takes the record out of: every other one it is shared to. */
export function removedFrom(current: Current, poolId: string): string[] {
  return current.sharedIn.filter((s) => s.poolId !== poolId).map((s) => s.poolId);
}
