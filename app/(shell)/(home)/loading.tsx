import { GroundSkeleton } from '@/features/home/ground-skeleton';

/** Home before its data (review): the ground's frame, never a blank. In a group of its own so no other page under the shell inherits it. */
export default function HomeLoading() {
  return <GroundSkeleton here="home" />;
}
