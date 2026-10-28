import { GroundSkeleton } from '@/features/home/ground-skeleton';

/** A pool before its data (review): the ground's frame. Grouped so the pool's settings, lane and splash pages keep their own. */
export default function PoolLoading() {
  return <GroundSkeleton here="pool" />;
}
