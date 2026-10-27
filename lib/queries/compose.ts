import type { DuringClient } from '@/lib/queries/profile';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import type { IsoDate } from '@/lib/time';

/** Postgres exclusion-constraint violation. */
export const EXCLUSION_VIOLATION = '23P01';

/**
 * The author's running timer, if one is going. H10 guarantees at most one, so
 * this is a single row rather than a list.
 */
export async function getRunningSession(
  supabase: DuringClient,
  authorId: string,
): Promise<RippleWithSplash | null> {
  const { data, error } = await supabase
    .from('ripples')
    .select('*, category:my_categories(name, icon)')
    .eq('author_id', authorId)
    .is('ended_at', null)
    .is('parent_ripple_id', null)
    .not('occurred_time', 'is', null)
    .eq('planned', false)
    .order('started_at', { ascending: false })
    .limit(1)
    .returns<RippleWithSplash[]>();

  if (error) throw error;
  return data[0] ?? null;
}

/**
 * Which record a rejected write collided with.
 *
 * The constraint says no, but "no" is not a message — the sheet has to name
 * the record in the way and, when it is a session, offer to file the new one
 * inside it. Run after a 23P01 rather than before every write: the database
 * is the authority, and a check beforehand would be a race.
 *
 * A typed span passes its end too (H18), because the record in the way may
 * begin after the span does; searching only under the start would find
 * nothing and leave the author with the raw constraint.
 */
export async function findCollision(
  supabase: DuringClient,
  authorId: string,
  at: Date,
  until: Date | null = null,
): Promise<RippleWithSplash | null> {
  const from = at.toISOString();
  const to = (until ?? at).toISOString();

  const candidates = supabase
    .from('ripples')
    .select('*, category:my_categories(name, icon)')
    .eq('author_id', authorId)
    .is('parent_ripple_id', null)
    .eq('planned', false)
    .or(`ended_at.is.null,ended_at.gt.${from}`);

  // Half-open, matching the constraint: a span ending where another starts is
  // adjacent, while a point has to be caught at its own instant.
  const { data, error } = await (
    until ? candidates.lt('started_at', to) : candidates.lte('started_at', from)
  )
    .order('started_at', { ascending: false })
    .limit(1)
    .returns<RippleWithSplash[]>();

  if (error) throw error;
  const candidate = data[0];
  if (!candidate) return null;

  // A drop's span is a point, so it collides only where it actually sits.
  const isPoint = candidate.ended_at !== null && candidate.ended_at === candidate.started_at;
  if (isPoint) {
    // Compared as instants: Postgres renders +00:00 where the client sent Z,
    // so the same moment is two different strings.
    const started = Date.parse(candidate.started_at!);
    const inside = until
      ? started >= Date.parse(from) && started < Date.parse(to)
      : started === Date.parse(from);
    if (!inside) return null;
  }

  return candidate;
}

/** Today's Ripples, for the sheet's rail. Same query the timeline uses. */
export type ComposeContext = {
  ripples: RippleWithSplash[];
  running: RippleWithSplash | null;
  date: IsoDate;
};

/**
 * A running session's inner ripples. Their spans are what draw calm water in
 * the parent's bundle, so the timeline needs them even though they never take
 * a row of their own (H10).
 */
export async function getInnerRipples(
  supabase: DuringClient,
  parentIds: string[],
): Promise<RippleWithSplash[]> {
  if (parentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('ripples')
    .select('*, category:my_categories(name, icon)')
    .in('parent_ripple_id', parentIds)
    .order('started_at', { ascending: true })
    .returns<RippleWithSplash[]>();

  if (error) throw error;
  return data;
}

/** The break currently running inside a session, if any. */
export function runningBreak(inner: RippleWithSplash[]): RippleWithSplash | null {
  return inner.find((child) => child.ended_at === null && child.occurred_time !== null) ?? null;
}
