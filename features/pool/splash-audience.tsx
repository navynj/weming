'use client';

import { useOptimistic, useState, useTransition } from 'react';

import { useToast } from '@/components/ui/toast';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { moveToHome, setPlacement, setPlacementTogether } from './actions';
import { preselectLane, withPick, withTogether, type AudiencePick } from './audience';
import { AudienceChip, type AudiencePool } from './audience-sheet';
import type { MoveHome } from './move-to-home';
import { lastPicked, rememberPick } from './last-pick';

/**
 * A record's Audience chip on its own page (H23, 0033): the pools it is
 * shared to, each on a pool lane, switched in place. Each change shows at
 * once and the placement follows behind it; a refusal takes it back and
 * says why. A pick is remembered on this device for my lane and that pool.
 * My record written in a pool keeps that pool on (0056) until Move to Home
 * (H45), which keeps every pool and unlocks it.
 */
export function SplashAudience({
  splashId,
  myLaneId,
  shared,
  pools,
  locked = null,
  moveHome = null,
  onMoved,
}: {
  splashId: string;
  /** The record's lane: what my last pick is kept by. */
  myLaneId: string | null;
  shared: AudiencePick[];
  pools: AudiencePool[];
  /** My record written in a pool (0056): its pool, always on. */
  locked?: string | null;
  /** The same record (H45): my lanes, and where I filed it, for Move to Home. */
  moveHome?: Omit<MoveHome, 'onMove'> | null;
  /** Moved to Home: the record is a Home record now, so a sheet holding it closes. */
  onMoved?: () => void;
}) {
  const audience = useOptimisticAction(shared);
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);
  // Moved to Home (H45): the origin unlocks at once; every pool stays as it is.
  const [moved, setMoved] = useOptimistic(false);
  const [, startMove] = useTransition();
  return (
    <span className="flex flex-col items-end gap-1">
      <AudienceChip
        shared={audience.value}
        pools={pools}
        locked={moved ? null : locked}
        moveHome={
          moveHome && !moved
            ? {
                ...moveHome,
                onMove: (laneId) =>
                  startMove(async () => {
                    setMoved(true);
                    const done = await moveToHome(splashId, laneId);
                    if (!done.ok) {
                      setMessage(done.message);
                      return;
                    }
                    toast.show('Moved to Home');
                    onMoved?.();
                  }),
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
      {audience.message || message ? (
        <span role="alert" className="text-pool-500 text-[10px]">
          {audience.message ?? message}
        </span>
      ) : null}
    </span>
  );
}
