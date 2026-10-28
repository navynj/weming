import type { Splash } from '@/features/splash/summary';
import type { DuringClient } from '@/lib/queries/profile';
import { getMyPlacements } from '@/lib/queries/pools';
import { getLockedIds, getRippleResponses } from '@/lib/queries/responses';

import type { Card } from './grid';

/**
 * The posts of mine others can read (H25): where a top card offers
 * reactions and replies. A pool's own (joint), a Just-mine one, or one
 * shared to a pool. Home and a lane's page read the same rule.
 */
export async function sharedSplashIds(
  supabase: DuringClient,
  me: string,
  mine: Splash[],
  joints: Splash[],
): Promise<Set<string>> {
  const placed = await getMyPlacements(supabase, me);
  return new Set([
    ...joints.map((j) => j.id),
    ...mine.flatMap((s) => (s.own_pool_id ? [s.id] : [])),
    ...placed.flatMap((p) => (p.shared ? [p.splashId] : [])),
  ]);
}

/**
 * Each card others can read, with what readers left on its ripples and my
 * locked ones among them, for the top card (H25, review). A card nobody
 * else reads carries none.
 */
export async function withResponded(
  supabase: DuringClient,
  cards: Card[],
  shared: Set<string>,
  /** My own records' cards, which keep every thread, each labelled with its pool (0053). */
  mine?: { me: string; ids: Set<string>; poolNames: Map<string, string> },
): Promise<Card[]> {
  const answerable = cards.flatMap((c) =>
    shared.has(c.splash.id) ? c.ripples.map((r) => r.id) : [],
  );
  const [responded, locked] = await Promise.all([
    getRippleResponses(supabase, answerable),
    getLockedIds(supabase, answerable),
  ]);
  return cards.map((card) => {
    if (!shared.has(card.splash.id)) return card;
    const ids = new Set(card.ripples.map((r) => r.id));
    return {
      ...card,
      responded: {
        value: {
          reactions: responded.reactions.filter((r) => ids.has(r.ripple_id)),
          replies: responded.replies.filter((r) => ids.has(r.ripple_id)),
        },
        locked,
        ...(mine?.ids.has(card.splash.id)
          ? { labels: { owner: mine.me, pools: Object.fromEntries(mine.poolNames) } }
          : {}),
      },
    };
  });
}
