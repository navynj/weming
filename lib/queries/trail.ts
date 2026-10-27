import { dayOf, flowInstant } from '@/lib/flow-key';
import type { DuringClient } from '@/lib/queries/profile';
import { WITH_CATEGORY, type RippleWithCategory } from '@/lib/queries/ripples';
import type { IsoDate } from '@/lib/time';

export type TrailDay = { date: IsoDate; ripples: RippleWithCategory[] };

/**
 * My whole archive, newest first: every top-level block, with its post.
 *
 * **This is my own archive, not a feed.** The no-feed hypothesis (A1, A2) is
 * about other people's content arriving unasked — an endless column of records
 * I did not write. A backward scroll through what I wrote myself is the
 * opposite motion: nothing new arrives at the top, and the only way through it
 * is to go back. Locker is the recall engine (D10), and this is recall.
 *
 * Locked blocks are included and unmarked: the Locker sees everything, and
 * audience state lives in the block editor rather than as a marker on my own
 * records.
 *
 * Unbounded. At P1 this is one person's few months, and a window would be a
 * cut-off the word "Trail" promises is not there; pagination is the answer
 * when the archive outgrows one request, not a limit that quietly hides it.
 */
export async function getMyTrail(
  supabase: DuringClient,
  authorId: string,
): Promise<RippleWithCategory[]> {
  // Newest written first (H24): a block is placed by its post, and within it
  // by when it was written; its own date orders nothing.
  const { data, error } = await supabase
    .from('ripples')
    .select(WITH_CATEGORY)
    .eq('author_id', authorId)
    .is('parent_ripple_id', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .returns<RippleWithCategory[]>();

  if (error) throw error;
  return data;
}

/**
 * Days, newest first, each day still reading early to late.
 *
 * The scroll descends through days and each day reads top-to-early, so a day
 * in the Trail is the day as it was lived rather than a reversed one. A day is
 * the coalesced day (H20c, H21f): the annotation's date, else the post's
 * declared date, else the author-local date the block was written.
 */
export function groupByDay(ripples: RippleWithCategory[], timeZone: string): TrailDay[] {
  const byDay = new Map<IsoDate, RippleWithCategory[]>();
  for (const ripple of ripples) {
    const date = dayOf(ripple, timeZone);
    const day = byDay.get(date);
    if (day) day.push(ripple);
    else byDay.set(date, [ripple]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, rows]) => ({
      date,
      ripples: [...rows].sort((a, b) => flowInstant(a, timeZone) - flowInstant(b, timeZone)),
    }));
}
