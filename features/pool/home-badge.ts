import { ownPoolColumn, type Card } from '@/features/home/grid';

import { originTag } from './origin-tag';
import { poolSplashHref } from './pool-cards';

/** What Home knows about a joint splash I have written in. */
export type JointOnHome = {
  poolId: string;
  /** Null once I cannot read the pool (I left it). */
  poolName: string | null;
  /** Its photo (0024), while I am in it. */
  poolPhoto?: string | null;
  /** My lane its pool lane is brought into (jointLaneFor, H24); null: the pool's column. */
  linkedLane: string | null;
  /** Its pool lane, while I can read it. */
  poolLane: { name: string; icon: string | null } | null;
};

/**
 * A card on Home, as pools touch it (H23, H24): a joint splash — my
 * ripples on a splash a pool owns — carries the pool's monogram, opens the
 * pool's page, and is neither pinned nor deleted from here. It sits in my
 * lane its pool lane is brought into, else in its pool's column — derived
 * from my link, never from a ripple; and it carries its tag,
 * "<Pool> · <emoji> <pool lane>". My own splash merely shared to a pool
 * carries no badge on Home: its audience shows on its page's Audience chip.
 */
export function withPoolBadge(card: Card, joint: JointOnHome | undefined): Card {
  if (!joint) return card;
  const name = joint.poolName;
  return {
    ...card,
    pools: name ? [name] : [],
    poolPhoto: name ? (joint.poolPhoto ?? null) : null,
    joint: true,
    href: poolSplashHref(joint.poolId, card.splash.id),
    menu: { pin: false, delete: false },
    // Its title and icon are any current member's to edit; once I left, not mine.
    editable: name !== null,
    column: joint.linkedLane ?? ownPoolColumn(joint.poolId),
    // In its pool's column there is no lane of mine to lend an emoji: the
    // mark falls back to the pool lane's (review), named by the pool.
    ...(joint.linkedLane === null && joint.poolLane
      ? { lane: { icon: joint.poolLane.icon, name: name ?? 'A pool you left' } }
      : {}),
    ...(joint.poolLane
      ? {
          origins: [originTag(name ?? 'A pool you left', joint.poolLane.icon, joint.poolLane.name)],
        }
      : {}),
  };
}
