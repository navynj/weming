/**
 * Reactions and replies on a ripple (H24): what a reader leaves under a
 * block. Neither is a ripple — no lane, no date, never a record on the
 * board, never a side written on a joint splash. Pure: the shapes and the
 * arithmetic every surface shares, so the post page, the stack card and the
 * board agree on what there is.
 */

/** The six the picker offers before the keyboard (H24). */
export const QUICK_EMOJI = ['❤️', '😂', '😮', '😢', '👏', '🔥'] as const;

/** A reply's longest text (0030). */
export const REPLY_MAX = 500;

/** Replies shown under a block, and on the board, before "+n" (H24). */
export const REPLIES_SHOWN = 2;

/** Emoji at most on the board's badge, most used first (H24). */
export const BADGE_EMOJI = 3;

export type ReactionRow = {
  ripple_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
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
};

/** One reaction chip: an emoji, how many, whether one is mine, and who (oldest first). */
export type ReactionChip = { emoji: string; count: number; mine: boolean; who: string[] };

/** What the board shows of a splash's responses (0030: splash_reaction_summary, splash_reply_preview). */
export type ReplyPreview = { id: string; rippleId: string; authorId: string; body: string };
export type BoardResponses = {
  /** Up to three, most used first. */
  emoji: string[];
  reactions: number;
  /** The first replies, oldest first, across all its ripples, hidden ones skipped: two shown, the third where "+n" opens. */
  replies: ReplyPreview[];
  replyTotal: number;
};

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
 * One emoji, as the picker's field may take it (H24): one grapheme, no
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
): { rows: ReactionRow[]; on: boolean } {
  const mine = (r: ReactionRow) =>
    r.ripple_id === rippleId && r.user_id === me && r.emoji === emoji;
  if (rows.some(mine)) return { rows: rows.filter((r) => !mine(r)), on: false };
  return { rows: [...rows, { ripple_id: rippleId, user_id: me, emoji, created_at: at }], on: true };
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
 * dot compares with the last time I opened the splash (H24).
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

/** Whether a splash has anything for the board to show. */
export function hasResponses(board: BoardResponses | undefined): board is BoardResponses {
  return !!board && (board.reactions > 0 || board.replyTotal > 0);
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

/**
 * A splash's board numbers from everything its page holds: the same rule as
 * 0030's splash_reaction_summary and splash_reply_preview, so the page can
 * show the board the change it just made before the server re-reads.
 */
export function boardFrom(value: RippleResponsesValue): BoardResponses {
  const counts = new Map<string, { n: number; first: string }>();
  for (const r of value.reactions) {
    const seen = counts.get(r.emoji);
    if (seen) {
      seen.n += 1;
      if (r.created_at < seen.first) seen.first = r.created_at;
    } else counts.set(r.emoji, { n: 1, first: r.created_at });
  }
  const emoji = [...counts.entries()]
    .sort(
      (a, b) => b[1].n - a[1].n || a[1].first.localeCompare(b[1].first) || a[0].localeCompare(b[0]),
    )
    .slice(0, BADGE_EMOJI)
    .map(([e]) => e);
  const open = value.replies
    .filter((r) => !r.hidden && r.body !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return {
    emoji,
    reactions: value.reactions.length,
    replies: open
      .slice(0, REPLIES_SHOWN + 1)
      .map((r) => ({ id: r.id, rippleId: r.ripple_id, authorId: r.author_id, body: r.body! })),
    replyTotal: open.length,
  };
}
