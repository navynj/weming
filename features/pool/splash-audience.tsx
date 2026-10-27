'use client';

import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { setPlacement, setPlacementTogether } from './actions';
import {
  preselectLane,
  withPick,
  withTogether,
  type AudienceLink,
  type AudiencePick,
} from './audience';
import { AudienceChip, type AudiencePool } from './audience-sheet';
import { lastPicked, rememberPick } from './last-pick';

/**
 * A record's Audience chip on its own page (H23, 0033): the pools it is
 * shared to, each on a pool lane, switched in place. Each change shows at
 * once and the placement follows behind it; a refusal takes it back and
 * says why. A pick is remembered on this device for my lane and that pool.
 */
export function SplashAudience({
  splashId,
  myLaneId,
  shared,
  pools,
  links,
}: {
  splashId: string;
  /** The record's lane: what a link's default and my last pick are kept by. */
  myLaneId: string | null;
  shared: AudiencePick[];
  pools: AudiencePool[];
  links: AudienceLink[];
}) {
  const audience = useOptimisticAction(shared);
  return (
    <span className="flex flex-col items-end gap-1">
      <AudienceChip
        shared={audience.value}
        pools={pools}
        preselect={(poolId) =>
          preselectLane(
            myLaneId,
            poolId,
            links,
            lastPicked(myLaneId, poolId),
            pools.find((p) => p.id === poolId)?.lanes.map((l) => l.id) ?? [],
          )
        }
        onChange={(poolId, poolLaneId) => {
          if (poolLaneId) rememberPick(myLaneId, poolId, poolLaneId);
          audience.run(
            (current) => withPick(current, poolId, poolLaneId),
            () => setPlacement(splashId, poolId, poolLaneId !== null, poolLaneId),
            'Audience saved',
          );
        }}
        onTogether={(poolId, together) =>
          audience.run(
            (current) => withTogether(current, poolId, together),
            () => setPlacementTogether(splashId, poolId, together.picked, together.everyone),
            'Saved',
          )
        }
      />
      {audience.message ? (
        <span role="alert" className="text-pool-500 text-[10px]">
          {audience.message}
        </span>
      ) : null}
    </span>
  );
}
