import {
  inThread,
  type ReactionRow,
  type ReplyRow,
  type RippleResponsesValue,
} from '@/features/responses/model';
import type { DuringClient } from '@/lib/queries/profile';

/**
 * Reactions and replies (H25, 0030). Every read goes through RLS or a
 * function that asks can_see_ripple, so a viewer only ever receives what
 * they may see: a locked ripple's, a stranger's, a former member's who
 * chose remove — none of it arrives.
 */

/**
 * Every reaction and reply on these ripples I may read; given a pool, only
 * that pool's thread and the owner's from no pool (0053).
 */
export async function getRippleResponses(
  supabase: DuringClient,
  rippleIds: string[],
  pool: string | null = null,
): Promise<RippleResponsesValue> {
  if (rippleIds.length === 0) return { reactions: [], replies: [] };
  const [reactions, replies] = await Promise.all([
    supabase
      .from('ripple_reactions')
      .select('ripple_id, user_id, emoji, created_at, thread_pool_id')
      .in('ripple_id', rippleIds)
      .order('created_at'),
    supabase.rpc('ripple_replies_in', { p_ripples: rippleIds }),
  ]);
  if (reactions.error) throw reactions.error;
  if (replies.error) throw replies.error;
  return inThread(
    { reactions: reactions.data as ReactionRow[], replies: replies.data as ReplyRow[] },
    pool,
  );
}

/**
 * Which of these ripples are locked (C8): a locked ripple takes no reaction
 * or reply (0030). The lock row is its author's alone to read, so only my
 * own come back — anyone else's locked ripple never reaches me at all.
 */
export async function getLockedIds(supabase: DuringClient, rippleIds: string[]): Promise<string[]> {
  if (rippleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('ripple_audience')
    .select('ripple_id')
    .eq('target_type', 'lock')
    .in('ripple_id', rippleIds);
  if (error) throw error;
  return (data ?? []).map((r) => r.ripple_id);
}

/**
 * The newest thing someone else left on each of my ripples in these
 * splashes, by splash then ripple: what the unseen dot compares with the
 * last time I opened the splash on this device (H25).
 */
export async function getResponsesOnMine(
  supabase: DuringClient,
  me: string,
  mine: { id: string; splashKey: string }[],
  pool: string | null = null,
): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  if (mine.length === 0) return out;
  const value = await getRippleResponses(
    supabase,
    mine.map((r) => r.id),
    pool,
  );
  const keyOf = new Map(mine.map((r) => [r.id, r.splashKey]));
  const note = (rippleId: string, who: string, at: string) => {
    const key = keyOf.get(rippleId);
    if (!key || who === me) return;
    const byRipple = (out[key] ??= {});
    if (!byRipple[rippleId] || at > byRipple[rippleId]) byRipple[rippleId] = at;
  };
  for (const r of value.reactions) note(r.ripple_id, r.user_id, r.created_at);
  for (const r of value.replies) note(r.ripple_id, r.author_id, r.created_at);
  return out;
}

/**
 * Every response by someone else on my ripples in these splashes, each with
 * the pool whose thread it is in (0053; null: from no pool): the pool dot's
 * other half (H25). A pool's dot counts only its own thread's — what the
 * pool's page shows — never one left in another pool, or on my Home.
 */
export async function responsesOnMine(
  supabase: DuringClient,
  me: string,
  splashIds: string[],
): Promise<{ splashId: string; pool: string | null; at: string }[]> {
  if (splashIds.length === 0) return [];
  const { data: ripples, error } = await supabase
    .from('ripples')
    .select('id, splash_id')
    .in('splash_id', splashIds)
    .eq('author_id', me);
  if (error) throw error;
  const splashOf = new Map(ripples.flatMap((r) => (r.splash_id ? [[r.id, r.splash_id]] : [])));
  const value = await getRippleResponses(supabase, [...splashOf.keys()]);
  const rows = [
    ...value.reactions.map((r) => ({ ripple: r.ripple_id, who: r.user_id, r })),
    ...value.replies.map((r) => ({ ripple: r.ripple_id, who: r.author_id, r })),
  ];
  return rows.flatMap(({ ripple, who, r }) => {
    const splashId = splashOf.get(ripple);
    return splashId && who !== me ? [{ splashId, pool: r.thread_pool_id, at: r.created_at }] : [];
  });
}
