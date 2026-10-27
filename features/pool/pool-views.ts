import type { PoolViewKind } from './pool-cards';

// Calendar | Members | Lane | List (review): the calendar first, then its
// people; re-tapping Pool walks them in this order. The values are the
// remembered keys and the tests' names, the labels what the hand reads.
export const POOL_VIEWS = [
  { value: 'board', label: 'Calendar' },
  { value: 'members', label: 'Members' },
  { value: 'lane', label: 'Lane' },
  { value: 'date', label: 'List' },
] as const satisfies readonly { value: PoolViewKind; label: string }[];

/** `?view=`: a pool lane page's tabs send the pool back on that view (review); anything else, the Calendar. */
export function poolViewParam(value: string | undefined): PoolViewKind {
  return value === 'members' || value === 'lane' || value === 'date' ? value : 'board';
}
