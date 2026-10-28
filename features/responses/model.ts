/**
 * Reactions and replies on a ripple (H25): what a reader leaves under a
 * block. Neither is a ripple — no lane, no date, never a record on the
 * board, never a side written on a joint splash. Pure: the shapes and the
 * arithmetic every surface shares, so the post page and the top card agree
 * on what there is. The calendar board shows none of it.
 */

/** The six the picker offers before the keyboard (H25). */
export const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '👏', '🔥'] as const;

/** A reply's longest text (0030). */
export const REPLY_MAX = 500;

/** Replies shown under a block, on its page and on the top card, before "+n" (H25). */
export const REPLIES_SHOWN = 2;

export type ReactionRow = {
  ripple_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  /** The pool it was left in (0053); null for the record's owner from no pool. */
  thread_pool_id: string | null;
};

export type ReplyRow = {
  id: string;
  ripple_id: string;
  author_id: string;
  /** Null when hidden by the ripple's author, unless I wrote it or the ripple is mine. */
  body: string | null;
  created_at: string;
  edited_at: string | null;
  hidden: boolean;
  /** Left every pool the ripple lives in, keeping their records ("Former member"). */
  former: boolean;
  /** The pool it was written in (0053); null for the record's owner from no pool. */
  thread_pool_id: string | null;
};

/**
 * One pool's thread (0053): its responses and the owner's from no pool. A
 * pool shows only its own; the owner reads another pool's only in that
 * pool's tab. Null: no pool to narrow to, everything readable shows.
 */
export function inThread(value: RippleResponsesValue, pool: string | null): RippleResponsesValue {
  if (pool === null) return value;
  const ours = (row: { thread_pool_id: string | null }): boolean =>
    row.thread_pool_id === null || row.thread_pool_id === pool;
  return { reactions: value.reactions.filter(ours), replies: value.replies.filter(ours) };
}

/** One reaction chip: an emoji, how many, whether one is mine, and who (oldest first). */
export type ReactionChip = { emoji: string; count: number; mine: boolean; who: string[] };

/** A block's responses, as its section holds them. */
export type RippleResponsesValue = { reactions: ReactionRow[]; replies: ReplyRow[] };

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** The graphemes of a text: a flag or a family is one. */
export function graphemes(text: string): string[] {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment);
  return [...text];
}

/**
 * One emoji, as the picker's field may take it (H25): one grapheme, no
 * letters, digits or space, at most sixteen code units (0030's bound).
 */
export function isOneEmoji(text: string): boolean {
  const value = text.trim();
  if (value.length === 0 || value.length > 16 || graphemes(value).length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}

/** The last grapheme typed: the field keeps one, the newest. */
export function lastGrapheme(text: string): string {
  const all = graphemes(text.trim());
  return all.length > 0 ? all[all.length - 1] : '';
}

/** A block's chips: one per emoji, in the order each was first left. */
export function chipsOf(rows: ReactionRow[], rippleId: string, me: string): ReactionChip[] {
  const chips = new Map<string, ReactionChip>();
  const ordered = rows
    .filter((r) => r.ripple_id === rippleId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const row of ordered) {
    const chip = chips.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false, who: [] };
    chip.count += 1;
    chip.mine ||= row.user_id === me;
    chip.who.push(row.user_id);
    chips.set(row.emoji, chip);
  }
  return [...chips.values()];
}

/** A tap on a chip: mine with that emoji goes if it is there, else it is added. */
export function toggled(
  rows: ReactionRow[],
  rippleId: string,
  me: string,
  emoji: string,
  at: string = new Date().toISOString(),
  pool: string | null = null,
): { rows: ReactionRow[]; on: boolean } {
  const mine = (r: ReactionRow) =>
    r.ripple_id === rippleId && r.user_id === me && r.emoji === emoji;
  if (rows.some(mine)) return { rows: rows.filter((r) => !mine(r)), on: false };
  return {
    rows: [
      ...rows,
      { ripple_id: rippleId, user_id: me, emoji, created_at: at, thread_pool_id: pool },
    ],
    on: true,
  };
}

/** A block's replies, oldest first: the first two, and how many more wait behind "+n more replies". */
export function repliesShown(
  replies: ReplyRow[],
  rippleId: string,
  expanded: boolean,
): { shown: ReplyRow[]; more: number } {
  const all = replies
    .filter((r) => r.ripple_id === rippleId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (expanded || all.length <= REPLIES_SHOWN) return { shown: all, more: 0 };
  return { shown: all.slice(0, REPLIES_SHOWN), more: all.length - REPLIES_SHOWN };
}

/**
 * The newest thing someone else left on each of my ripples: what the unseen
 * dot compares with the last time I opened the splash (H25).
 */
export function latestFromOthers(
  value: RippleResponsesValue,
  me: string,
  mine: (rippleId: string) => boolean,
): Record<string, string> {
  const latest: Record<string, string> = {};
  const note = (rippleId: string, who: string, at: string) => {
    if (who === me || !mine(rippleId)) return;
    if (!latest[rippleId] || at > latest[rippleId]) latest[rippleId] = at;
  };
  for (const r of value.reactions) note(r.ripple_id, r.user_id, r.created_at);
  for (const r of value.replies) note(r.ripple_id, r.author_id, r.created_at);
  return latest;
}

/** "3m", "2h", "5d", else the date: a reply's age, short. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
