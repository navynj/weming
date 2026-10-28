'use client';

import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { keepInLane, setPlacement, setPlacementTogether } from './actions';
import { preselectLane, withPick, withTogether, type AudiencePick } from './audience';
import { AudienceChip, type AudiencePool } from './audience-sheet';
import type { KeepIn } from './keep-in-lane';
import { lastPicked, rememberPick } from './last-pick';

/**
 * A record's Audience chip on its own page (H23, 0033): the pools it is
 * shared to, each on a pool lane, switched in place. Each change shows at
 * once and the placement follows behind it; a refusal takes it back and
 * says why. A pick is remembered on this device for my lane and that pool.
 * My pool record's last pool asks for a lane of mine first (H45).
 */
export function SplashAudience({
  splashId,
  myLaneId,
  shared,
  pools,
  keepIn = null,
  onKept,
}: {
  splashId: string;
  /** The record's lane: what my last pick is kept by. */
  myLaneId: string | null;
  shared: AudiencePick[];
  pools: AudiencePool[];
  /** My pool record (H45): my lanes, and where I filed it. */
  keepIn?: Omit<KeepIn, 'onKeep'> | null;
  /** Kept in my lane: the record is mine now, so a sheet holding it closes. */
  onKept?: () => void;
}) {
  const audience = useOptimisticAction(shared);
  return (
    <span className="flex flex-col items-end gap-1">
      <AudienceChip
        shared={audience.value}
        pools={pools}
        keepIn={
          keepIn
            ? {
                ...keepIn,
                onKeep: (laneId) => {
                  audience.run(
                    () => [],
                    () => keepInLane(splashId, laneId),
                    'Kept in your lane',
                  );
                  onKept?.();
                },
              }
            : null
        }
        preselect={(poolId) =>
          preselectLane(
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
