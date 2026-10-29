'use client';

import { LaneRows } from '@/features/lanes/lane-rows';
import type { PoolLane } from '@/lib/queries/pools';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { reorderPoolLanes, savePoolLane } from './actions';

/**
 * The pool's lanes, in the settings sheet's Pool tab: Home's lane rows
 * (H42b) — add, rename, emoji, a line of description, drag to reorder —
 * each any current member's, as renaming is (H23). No Delete: deleting a
 * pool lane waits for roles. Each change is saved as it is made.
 */
export function PoolLanesSheet({ poolId, lanes }: { poolId: string; lanes: PoolLane[] }) {
  const shown = useOptimisticAction(lanes);
  return (
    <div data-pool-lanes-editor>
      <LaneRows
        lanes={shown.value}
        apply={shown.run}
        message={shown.message}
        save={({ id, name, icon, description }) =>
          savePoolLane({ id, poolId, name, icon: icon || null, description })
        }
        reorder={(ids) => reorderPoolLanes(poolId, ids)}
        draft={(lane, position) => ({
          id: lane.id,
          pool_id: poolId,
          name: lane.name,
          icon: lane.icon || null,
          description: lane.description,
          position,
        })}
        iconRequired={false}
        describe
        maxName={40}
      />
    </div>
  );
}
