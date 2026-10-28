import type { ReactNode } from 'react';

import { representativeLane, type Splash, type SplashSummary } from '@/features/splash/summary';
import type { Placement } from '@/lib/queries/pools';
import type { MyCategory } from '@/lib/queries/profile';

import type { AudiencePool } from './audience-sheet';
import { SplashAudience } from './splash-audience';

/**
 * A record page's Audience chip (H23, 0033, H45), one rule for Home's page
 * and the pool's: my Home record and my pool record get a row per pool I am
 * in, each on a pool lane, any of them switched off; switching off a pool
 * record's last pool asks which of my lanes keeps it. Anything else has none.
 */
export function audienceFor({
  board,
  summary,
  me,
  categories,
  filed = null,
  pools,
  placements,
  picks = {},
}: {
  board: Splash | null;
  summary: SplashSummary;
  me: string;
  /** My lanes, for "Keep it in which of your lanes?". */
  categories: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
  /** Where I filed it on Home (H45), if anywhere. */
  filed?: string | null;
  pools: AudiencePool[];
  placements: Placement[];
  /** The faces I picked on it, by pool (0035). */
  picks?: Record<string, string[]>;
}): ReactNode {
  if (!board || board.owner_id !== me) return null;
  if (pools.length === 0) return null;
  return (
    <SplashAudience
      splashId={board.id}
      myLaneId={summary.declaredLaneId ?? representativeLane(summary)}
      shared={placements
        .filter((p) => p.splashId === board.id && p.shared)
        .map((p) => ({
          poolId: p.poolId,
          poolLaneId: p.poolLaneId,
          together: { everyone: Boolean(p.inviteAll), picked: picks[p.poolId] ?? [] },
        }))}
      pools={pools}
      keepIn={board.own_pool_id ? { lanes: categories, filed } : null}
    />
  );
}
