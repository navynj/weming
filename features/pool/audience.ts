/**
 * A record's audience (H23, 0033): where it is shared, pool by pool, each on
 * one of that pool's lanes. Ripples have none of their own; they follow
 * their record. A Home record is "Only me" unless an advanced link of its
 * lane shares by default. The shape leaves room for a Followers row later.
 */
import { defaultLink, type MarkedLink } from './links';

export type AudienceLink = MarkedLink & {
  poolId: string;
  poolName: string;
};

/** One pool a record is shared to, and on which of its lanes. */
export type AudiencePick = { poolId: string; poolLaneId: string };

/** "Only me", the pool's name, or "N pools". */
export function audienceLabel(poolNames: string[]): string {
  if (poolNames.length === 0) return 'Only me';
  if (poolNames.length === 1) return poolNames[0];
  return `${poolNames.length} pools`;
}

/**
 * The default for a new Home record: every pool where the chosen lane's
 * default link shares by default, on that link's pool lane. With no such
 * link, "Only me" (0033): Home is private by default.
 */
export function defaultAudience(laneId: string | null, links: AudienceLink[]): AudiencePick[] {
  if (!laneId) return [];
  return links
    .filter((l) => l.myCategoryId === laneId && l.isDefault && l.shareByDefault)
    .map((l) => ({ poolId: l.poolId, poolLaneId: l.poolLaneId }));
}

/**
 * The chip a pool's row starts on when it is turned on: the link's default
 * pool lane, else the one I last picked for this (my lane, pool) on this
 * device, else none — one must then be picked. It only fills the chip; it
 * never turns sharing on.
 */
export function preselectLane(
  laneId: string | null,
  poolId: string,
  links: AudienceLink[],
  lastPicked: string | null,
  poolLaneIds: string[],
): string | null {
  const fromLink = defaultLink(laneId, poolId, links)?.poolLaneId ?? null;
  if (fromLink && poolLaneIds.includes(fromLink)) return fromLink;
  return lastPicked && poolLaneIds.includes(lastPicked) ? lastPicked : null;
}

/** The audience with one pool switched: on a pool lane, or off (null). */
export function withPick(
  audience: AudiencePick[],
  poolId: string,
  poolLaneId: string | null,
): AudiencePick[] {
  const rest = audience.filter((a) => a.poolId !== poolId);
  return poolLaneId ? [...rest, { poolId, poolLaneId }] : rest;
}
