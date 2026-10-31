import { daysSince, formatAgo, type Zone } from '@/lib/admin/zones';

/** A last write older than this is tinted. */
export const STALE_DAYS = 3;

/** "Oct 27 · 3d ago", tinted amber past three days: someone going quiet. */
export function LastWrite({ at, now, zone }: { at: number | null; now: number; zone: Zone }) {
  const stale = at !== null && daysSince(at, now) > STALE_DAYS;
  return (
    <span className={stale ? 'rounded bg-amber-100 px-1 text-amber-900' : undefined}>
      {formatAgo(at, now, zone)}
    </span>
  );
}
