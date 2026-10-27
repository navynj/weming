import type { ReactNode } from 'react';

import { representativeLane, type Splash, type SplashSummary } from '@/features/splash/summary';
import type { MyLink, Placement } from '@/lib/queries/pools';

import { FixedAudienceChip, type AudiencePool } from './audience-sheet';
import { SplashAudience } from './splash-audience';

/**
 * A record page's Audience chip (H23, 0033), one rule for Home's page and
 * the pool's: my pool record names its pool and switches nothing; my Home
 * record gets a row per pool I am in, each on a pool lane; anything else
 * has none.
 */
export function audienceFor({
  board,
  summary,
  me,
  links,
  pools,
  placements,
  picks = {},
}: {
  board: Splash | null;
  summary: SplashSummary;
  me: string;
  links: MyLink[];
  pools: AudiencePool[];
  placements: Placement[];
  /** The faces I picked on it, by pool (0035). */
  picks?: Record<string, string[]>;
}): ReactNode {
  if (!board || board.owner_id !== me) return null;
  if (board.own_pool_id) {
    return (
      <FixedAudienceChip
        poolName={pools.find((p) => p.id === board.own_pool_id)?.name ?? 'A pool you left'}
      />
    );
  }
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
      links={links}
    />
  );
}
