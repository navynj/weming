import { homeLaneFor, type MarkedLink } from './links';

/**
 * Composing from a pool (H23, 0033): the pool, its lanes, and its current
 * members for Together. A pool lane carries my home lane for it, when I
 * marked one: where a record written there shows on my Home. Nothing here
 * asks for a lane of mine.
 */
export type PoolScope = {
  poolId: string;
  poolName: string;
  lanes: {
    id: string;
    name: string;
    icon: string | null;
    /** My lane marked as this pool lane's home lane (0033), else null: the pool's column. */
    homeLaneId: string | null;
  }[];
  /** Current members, me among them: the faces Together offers. */
  members: { id: string; name: string; initials: string }[];
  /** Pool settings: Everyone starts on in this pool's compose (0033). */
  inviteAllByDefault?: boolean;
};

/** A pool as the composer takes it: its lanes with my home lanes, and its members. */
export function poolScopeOf(view: {
  pool: { id: string; name: string; inviteAllByDefault?: boolean };
  lanes: { id: string; name: string; icon: string | null }[];
  myLinks: MarkedLink[];
  members?: { userId: string; name: string; initials: string; former: boolean }[];
}): PoolScope {
  return {
    poolId: view.pool.id,
    poolName: view.pool.name,
    lanes: view.lanes.map((lane) => ({
      id: lane.id,
      name: lane.name,
      icon: lane.icon,
      homeLaneId: homeLaneFor(lane.id, view.myLinks),
    })),
    inviteAllByDefault: view.pool.inviteAllByDefault ?? false,
    members: (view.members ?? [])
      .filter((m) => !m.former)
      .map((m) => ({ id: m.userId, name: m.name, initials: m.initials })),
  };
}
