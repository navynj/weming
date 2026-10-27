import { dayOf, isFutureDated, type FlowKeyed } from '@/lib/flow-key';
import type { DuringClient } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';

/** One day's record count per category. Days with nothing are simply absent. */
export type LaneCounts = Map<IsoDate, Record<string, number>>;

export type LaneSpan = {
  counts: LaneCounts;
  /** The day the archive starts, or null when there is nothing in it yet. */
  earliest: IsoDate | null;
};

/**
 * The matrix's numbers: how many Ripples each category holds on each day.
 *
 * **Inner ripples are counted**, which is the aggregation rule stated the
 * other way round (H15a2): inner ripples contribute their count and their
 * content, never their time. A cell is a count, so a break inside a session
 * is one more thing that happened, not a subtraction from it.
 *
 * Locked Ripples are counted too, unmarked. This view is mine alone, and lock
 * state belongs to the detail sheet rather than to a marker on my own archive.
 *
 * A day is the block's coalesced day (H20c, H21f): its annotation's date,
 * else its post's declared date, else the author-local date it was written.
 * Future-dated blocks are left out: a cell says what the day held, and that
 * day has not happened.
 */
export async function getLaneCounts(
  supabase: DuringClient,
  authorId: string,
  timeZone: string,
  today: IsoDate,
): Promise<LaneSpan> {
  const { data, error } = await supabase
    .from('ripples')
    .select(
      'occurred_on, occurred_time, created_at, splash:splashes(declared_start, declared_lane_id)',
    )
    .eq('author_id', authorId)
    .eq('planned', false);

  if (error) throw error;
  // A ripple's lane is its post's (H24, 0042).
  return tallyLaneCounts(
    data.map((row) => ({ ...row, lane_id: row.splash?.declared_lane_id ?? null })),
    timeZone,
    today,
  );
}

/** The row shape the tally reads: the key columns and the lane. */
export type LaneRow = FlowKeyed & { lane_id: string | null };

/**
 * The counting, kept pure. Two spans that overlap are two records and both
 * count (H20c): a cell is how many things happened, not how the day's hours
 * were divided.
 */
export function tallyLaneCounts(rows: LaneRow[], timeZone: string, today: IsoDate): LaneSpan {
  const counts: LaneCounts = new Map();
  let earliest: IsoDate | null = null;
  for (const row of rows) {
    if (isFutureDated(row, timeZone, today)) continue;
    // No lane of mine (Just mine, 0014): no cell to count it in.
    if (row.lane_id === null) continue;
    const date = dayOf(row, timeZone);
    const day = counts.get(date) ?? {};
    day[row.lane_id] = (day[row.lane_id] ?? 0) + 1;
    counts.set(date, day);
    if (earliest === null || date < earliest) earliest = date;
  }

  return { counts, earliest };
}
