import type { Database } from '@/lib/database.types';
import type { DuringClient } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';

export type Ripple = Database['public']['Tables']['ripples']['Row'];

/**
 * A block with the post it composes, because an unannotated block rests at
 * its post's declared date (H21f) and the key cannot be computed without it.
 * Its lane is its post's (H24); the block's own went with 0042.
 */
export type RippleWithSplash = Ripple & {
  splash?: { declared_start: string | null; title: string } | null;
};

export const WITH_SPLASH = '*, splash:splashes(declared_start, title)';

/**
 * One author's day, top level only. Chronological top to bottom (H2), with
 * date-only records first: they belong to the day without claiming a position
 * on its axis and render in the Daily Note area above it (SPEC 5, H5).
 *
 * Dormant (H20b) with the paged day; kept for P3's Swim.
 *
 * The author filter narrows, it does not protect: RLS decides what a viewer
 * may see. Without it the same call would also return rows seen through my
 * pools, which is the pool's query, not the timeline's.
 */
export async function getRipplesForDate(
  supabase: DuringClient,
  authorId: string,
  occurredOn: IsoDate,
): Promise<RippleWithSplash[]> {
  const { data, error } = await supabase
    .from('ripples')
    .select(WITH_SPLASH)
    .eq('author_id', authorId)
    .eq('occurred_on', occurredOn)
    .is('parent_ripple_id', null)
    .order('occurred_time', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .returns<RippleWithSplash[]>();

  if (error) throw error;
  return data;
}

export async function getMyRipplesForDate(
  supabase: DuringClient,
  occurredOn: IsoDate,
): Promise<RippleWithSplash[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return getRipplesForDate(supabase, user.id, occurredOn);
}

/**
 * Splits a day into its two regions. Date-only records belong to the day
 * without claiming a position on its axis, so they stack in the Daily Note
 * area (SPEC 5.3, H5) and never appear on the timeline. Dormant (H20b).
 */
export function splitByRegion(ripples: RippleWithSplash[]): {
  notes: RippleWithSplash[];
  timeline: RippleWithSplash[];
} {
  return {
    notes: ripples.filter((ripple) => ripple.occurred_time === null),
    timeline: ripples.filter((ripple) => ripple.occurred_time !== null),
  };
}
