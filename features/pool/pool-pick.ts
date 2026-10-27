import type { PoolScope } from './compose-scope';
import { bringsIn } from './direction';

/**
 * The choice when composing from a pool (H23): a pool lane, and whose — a
 * joint splash the pool owns; or, Just mine, my own splash in the lane I
 * linked to it (placed here), or with no lane of mine.
 */
export type PoolPick =
  | { kind: 'joint'; poolLaneId: string }
  /** "Just mine" (0014): my splash on that pool lane, linked to no lane of mine. */
  | { kind: 'own'; poolLaneId: string }
  | { kind: 'lane'; poolLaneId: string; myCategoryId: string }
  | null;

/**
 * Where a pick lands, by the Just mine switch and the pool lane's link
 * (0017): off, a joint splash — my ripple in my linked lane when the link
 * brings in (both, in), else with no lane; on, my own splash — in my linked
 * lane, placed here, when the link brings in, else a Just-mine splash with
 * no lane of mine.
 */
export function resolvePick(
  lane: PoolScope['lanes'][number],
  justMine: boolean,
): Exclude<PoolPick, null> {
  const mine = lane.myCategoryId && bringsIn(lane.direction) ? lane.myCategoryId : null;
  if (!justMine) return { kind: 'joint', poolLaneId: lane.id };
  return mine
    ? { kind: 'lane', poolLaneId: lane.id, myCategoryId: mine }
    : { kind: 'own', poolLaneId: lane.id };
}

/**
 * "Joint · also in your Games", "Joint · pool only", "Yours · in Games",
 * "Yours · pool only". No "lane" on a compose screen (hotfix 2026-10-26).
 */
export function landingHint(
  lane: PoolScope['lanes'][number],
  justMine: boolean,
  myLaneName: (id: string) => string | null,
): string {
  const mine = lane.myCategoryId && bringsIn(lane.direction) ? myLaneName(lane.myCategoryId) : null;
  if (!justMine) return mine ? `Joint · also in your ${mine}` : 'Joint · pool only';
  return mine ? `Yours · in ${mine}` : 'Yours · pool only';
}
