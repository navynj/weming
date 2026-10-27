import type {
  BoardResponses,
  ReactionRow,
  ReplyRow,
  RippleResponsesValue,
} from '@/features/responses/model';
import type { DuringClient } from '@/lib/queries/profile';

/**
 * Reactions and replies (H24, 0030). Every read goes through RLS or a
 * function that asks can_see_ripple, so a viewer only ever receives what
 * they may see: a locked ripple's, a stranger's, a former member's who
 * chose remove — none of it arrives.
 */

/** Every reaction and reply on these ripples I may read. */
export async function getRippleResponses(
  supabase: DuringClient,
  rippleIds: string[],
): Promise<RippleResponsesValue> {
  if (rippleIds.length === 0) return { reactions: [], replies: [] };
  const [reactions, replies] = await Promise.all([
    supabase
      .from('ripple_reactions')
      .select('ripple_id, user_id, emoji, created_at')
      .in('ripple_id', rippleIds)
      .order('created_at'),
    supabase.rpc('ripple_replies_for', { p_ripples: rippleIds }),
  ]);
  if (reactions.error) throw reactions.error;
  if (replies.error) throw replies.error;
  return {
    reactions: reactions.data as ReactionRow[],
    replies: replies.data as ReplyRow[],
  };
}

/** Each splash's badge and reply lines for the board, by splash id; absent when it has none. */
export async function getBoardResponses(
  supabase: DuringClient,
  splashIds: string[],
): Promise<Record<string, BoardResponses>> {
  if (splashIds.length === 0) return {};
  const [summary, preview] = await Promise.all([
    supabase.rpc('splash_reaction_summary', { p_splashes: splashIds }),
    supabase.rpc('splash_reply_preview', { p_splashes: splashIds }),
  ]);
  if (summary.error) throw summary.error;
  if (preview.error) throw preview.error;
  const out: Record<string, BoardResponses> = {};
  const entry = (id: string): BoardResponses =>
    (out[id] ??= { emoji: [], reactions: 0, replies: [], replyTotal: 0 });
  for (const row of summary.data) {
    const e = entry(row.splash_id);
    e.emoji = row.emoji ?? [];
    e.reactions = row.total ?? 0;
  }
  for (const row of preview.data) {
    const e = entry(row.splash_id);
    e.replyTotal = row.total ?? 0;
    e.replies.push({
      id: row.reply_id,
      rippleId: row.ripple_id,
      authorId: row.author_id,
      body: row.body,
    });
  }
  return out;
}

/**
 * The newest thing someone else left on each of my ripples in these
 * splashes, by splash then ripple: what the unseen dot compares with the
 * last time I opened the splash on this device (H24).
 */
export async function getResponsesOnMine(
  supabase: DuringClient,
  me: string,
  mine: { id: string; splashKey: string }[],
): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  if (mine.length === 0) return out;
  const value = await getRippleResponses(
    supabase,
    mine.map((r) => r.id),
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

/** The newest response by someone else on my ripples in these splashes: the pool dot's other half (H24). */
export async function latestResponseOnMine(
  supabase: DuringClient,
  me: string,
  splashIds: string[],
): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  if (splashIds.length === 0) return latest;
  const { data: ripples, error } = await supabase
    .from('ripples')
    .select('id, splash_id')
    .in('splash_id', splashIds)
    .eq('author_id', me);
  if (error) throw error;
  const times = await getResponsesOnMine(
    supabase,
    me,
    ripples.flatMap((r) => (r.splash_id ? [{ id: r.id, splashKey: r.splash_id }] : [])),
  );
  for (const [splashId, byRipple] of Object.entries(times)) {
    const newest = Object.values(byRipple).sort().at(-1);
    if (newest) latest.set(splashId, newest);
  }
  return latest;
}
