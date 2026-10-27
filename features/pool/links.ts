/**
 * Advanced links (0033, _docs/SHARING-V2.md): my lanes and a pool's lanes,
 * connected under Pool settings → Advanced, never while joining or
 * composing. A link carries up to two defaults, as markers:
 *
 * - the **default pool lane** for (my lane, pool) — one per pair with links
 *   — and, on that row only, **share by default**: a new Home record in that
 *   lane starts shared there. Off when made.
 * - the **home lane** for (me, pool lane), optional: that pool lane's pool
 *   records and joint records show in my lane's column on Home, else in the
 *   pool's own column. Display only.
 *
 * Unlinking changes defaults and display, never a record or a placement.
 */
export type LinkMarkers = {
  isDefault: boolean;
  shareByDefault: boolean;
  isHome: boolean;
};

export type MarkedLink = {
  myCategoryId: string;
  poolLaneId: string;
  poolId?: string;
} & Partial<LinkMarkers>;

/**
 * Where a joint or pool record on this pool lane shows on my Home: my lane
 * marked as its home lane, else null — the pool's own column. Derived from
 * the marker, never stored on a ripple (H24). The database's copy is
 * `_home_lane_for` (0033).
 */
export function homeLaneFor(poolLaneId: string | null, links: MarkedLink[]): string | null {
  if (!poolLaneId) return null;
  return links.find((l) => l.poolLaneId === poolLaneId && l.isHome)?.myCategoryId ?? null;
}

/** The default pool lane for (my lane, pool), when that lane is linked there. */
export function defaultLink(
  myLaneId: string | null,
  poolId: string,
  links: MarkedLink[],
): MarkedLink | null {
  if (!myLaneId) return null;
  return (
    links.find((l) => l.myCategoryId === myLaneId && l.poolId === poolId && l.isDefault) ?? null
  );
}
