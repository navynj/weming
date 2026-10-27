import type { Database } from '@/lib/database.types';

/**
 * A lane link's direction (0017): out, both (the default), in. Drawn between
 * the pool lane at the left and my lane at the right, so an arrow points where
 * records go: out ← (mine into the pool), in → (the pool's into mine).
 */
export type LinkDirection = Database['public']['Enums']['lane_link_direction'];

export const DEFAULT_DIRECTION: LinkDirection = 'both';

/** Shares my lane's splashes into the pool by default: out and both. */
export function sharesOut(direction: LinkDirection | null | undefined): boolean {
  return direction === 'out' || direction === 'both';
}

/** Brings the pool lane's joint splashes into my lane: both and in. */
export function bringsIn(direction: LinkDirection | null | undefined): boolean {
  return direction === 'both' || direction === 'in';
}

/**
 * Where a joint splash on this pool lane shows on my Home (H24): my lane
 * linked to it when the link brings in (↔ both, → in), else null — the
 * pool's own column (← out, or no link). Derived from the links, never
 * stored on a ripple. Several links may bring one pool lane in (0019): both
 * wins, then the first. The database's copy is `_joint_lane_for` (0028).
 */
export function jointLaneFor(
  poolLaneId: string | null,
  links: { myCategoryId: string; poolLaneId?: string; direction?: LinkDirection }[],
): string | null {
  if (!poolLaneId) return null;
  const bringing = links.filter(
    (l) => l.poolLaneId === poolLaneId && bringsIn(l.direction ?? DEFAULT_DIRECTION),
  );
  return (
    (bringing.find((l) => (l.direction ?? DEFAULT_DIRECTION) === 'both') ?? bringing[0])
      ?.myCategoryId ?? null
  );
}

export const DIRECTION_GLYPH: Record<LinkDirection, string> = { out: '←', both: '↔', in: '→' };

export const DIRECTION_CAPTION: Record<LinkDirection, string> = {
  out: 'Share my records to the pool',
  both: 'Share both ways',
  in: 'Bring pool records to my lane',
};

/** A tap cycles both → out → in → both: ↔ ← →. */
export function nextDirection(direction: LinkDirection): LinkDirection {
  return direction === 'both' ? 'out' : direction === 'out' ? 'in' : 'both';
}
