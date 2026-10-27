// DORMANT (H20b): no surface reaches this since the Splash pivot. Kept, with
// its tests, for P3's Swim. Do not wire it back in; do not delete it.
import type { RippleWithSplash } from '@/lib/queries/ripples';

/**
 * Where a retroactively added inner ripple lands by default.
 *
 * **After the last thing already inside the session**, falling back to the
 * session's own start when there is nothing inside it yet — and back to the
 * start again if that would land on or past the end, since the span is
 * half-open and its final instant is not inside it.
 *
 * Chosen over the midpoint because adding to a finished session is usually
 * remembering something *else that happened*, and things are remembered in
 * the order they happened. A midpoint is arithmetic; the end of what is
 * already there is where the next thing goes.
 */
export function defaultInnerTime(
  parent: RippleWithSplash,
  existing: RippleWithSplash[],
  timeZone: string,
): string | undefined {
  if (!parent.started_at) return undefined;

  const start = Date.parse(parent.started_at);
  const end = parent.ended_at ? Date.parse(parent.ended_at) : Number.POSITIVE_INFINITY;

  const lastEnd = existing.reduce((latest, child) => {
    const childEnd = child.ended_at ? Date.parse(child.ended_at) : 0;
    return childEnd > latest ? childEnd : latest;
  }, 0);

  const at = lastEnd > start && lastEnd < end ? lastEnd : start;
  return wallClock(new Date(at), timeZone);
}

function wallClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}
