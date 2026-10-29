'use client';

import type { MyCategory } from '@/lib/queries/profile';
import type { useOptimisticAction } from '@/lib/use-optimistic-action';

import { deleteLane, reorderLanes, saveLane } from './actions';
import { LaneRows } from './lane-rows';

/**
 * My lanes, in the settings sheet's Home tab (0059): the lane rows (H42b)
 * over Home's optimistic lane state, each change saved as it is made. A
 * lane with records refuses deletion and says so (H19).
 */
export function LanesSheet({
  categories,
  apply,
  message,
}: {
  categories: MyCategory[];
  apply: ReturnType<typeof useOptimisticAction<MyCategory[]>>['run'];
  /** The last refusal, from Home's optimistic lane state. */
  message?: string | null;
}) {
  return (
    <LaneRows
      lanes={categories}
      apply={apply}
      message={message}
      save={({ id, name, icon }) => saveLane({ id, name, icon })}
      reorder={reorderLanes}
      remove={deleteLane}
      draft={(lane, position) => ({
        id: lane.id,
        user_id: '',
        name: lane.name,
        icon: lane.icon,
        default_mode: 'drop' as const,
        position,
        created_at: new Date().toISOString(),
      })}
      iconRequired
      maxName={24}
    />
  );
}
