import { describe, expect, it } from 'vitest';

import {
  boardFrom,
  chipsOf,
  isOneEmoji,
  lastGrapheme,
  latestFromOthers,
  repliesShown,
  toggled,
  type ReactionRow,
  type ReplyRow,
} from '@/features/responses/model';
import { isUnseen } from '@/features/responses/seen';

const ME = 'u-me';

function reaction(ripple: string, user: string, emoji: string, at: string): ReactionRow {
  return { ripple_id: ripple, user_id: user, emoji, created_at: `2026-10-26T10:${at}:00Z` };
}

function reply(
  id: string,
  ripple: string,
  author: string,
  at: string,
  over: Partial<ReplyRow> = {},
): ReplyRow {
  return {
    id,
    ripple_id: ripple,
    author_id: author,
    body: id,
    created_at: `2026-10-26T10:${at}:00Z`,
    edited_at: null,
    hidden: false,
    former: false,
    ...over,
  };
}

describe('reactions (H25)', () => {
  const rows = [
    reaction('r1', 'u-a', '❤️', '01'),
    reaction('r1', ME, '😂', '02'),
    reaction('r1', ME, '❤️', '03'),
    reaction('r2', 'u-a', '🔥', '04'),
  ];

  it('groups a block’s reactions by emoji, in the order each was first left, mine marked', () => {
    expect(chipsOf(rows, 'r1', ME)).toEqual([
      { emoji: '❤️', count: 2, mine: true, who: ['u-a', ME] },
      { emoji: '😂', count: 1, mine: true, who: [ME] },
    ]);
  });

  it('a toggle adds one of mine, and a second takes exactly that one back', () => {
    const added = toggled(rows, 'r2', ME, '🔥', '2026-10-26T11:00:00Z');
    expect(added.on).toBe(true);
    expect(chipsOf(added.rows, 'r2', ME)).toEqual([
      { emoji: '🔥', count: 2, mine: true, who: ['u-a', ME] },
    ]);
    const removed = toggled(added.rows, 'r2', ME, '🔥');
    expect(removed.on).toBe(false);
    expect(removed.rows).toEqual(rows);
  });

  it('takes one emoji only: a grapheme, never words', () => {
    for (const ok of ['❤️', '👍🏽', '🇰🇷', '👩‍👩‍👧']) expect(isOneEmoji(ok), ok).toBe(true);
    for (const no of ['', 'a', 'ok', '❤️❤️', '1', ' ']) expect(isOneEmoji(no), no).toBe(false);
    expect(lastGrapheme('🙂👩‍👩‍👧')).toBe('👩‍👩‍👧');
  });
});

describe('replies (H25)', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((id, at) => reply(id, 'r1', 'u-a', `0${at}`));

  it('shows the first two, oldest first, and counts the rest for "+n more replies"', () => {
    const { shown, more } = repliesShown([...five].reverse(), 'r1', false);
    expect(shown.map((r) => r.id)).toEqual(['a', 'b']);
    expect(more).toBe(3);
    expect(repliesShown(five, 'r1', true)).toEqual({ shown: five, more: 0 });
    expect(repliesShown(five.slice(0, 2), 'r1', false).more).toBe(0);
  });
});

describe('the board’s numbers, from a page (H25)', () => {
  it('aggregates every ripple of the splash: top three emoji by use, the total, the first replies', () => {
    const board = boardFrom({
      reactions: [
        reaction('r1', 'u-a', '😂', '01'),
        reaction('r2', 'u-b', '❤️', '02'),
        reaction('r1', 'u-c', '❤️', '03'),
        reaction('r2', 'u-a', '🔥', '04'),
        reaction('r2', 'u-c', '👏', '05'),
      ],
      replies: [
        reply('x', 'r2', 'u-a', '09'),
        reply('h', 'r1', 'u-b', '01', { hidden: true, body: null }),
        reply('y', 'r1', 'u-b', '03'),
        reply('z', 'r2', 'u-c', '05'),
        reply('w', 'r1', 'u-c', '07'),
      ],
    });
    expect(board.emoji).toEqual(['❤️', '😂', '🔥']);
    expect(board.reactions).toBe(5);
    // Hidden skipped and not counted; two shown and the third where "+n" opens.
    expect(board.replies.map((r) => r.id)).toEqual(['y', 'z', 'w']);
    expect(board.replyTotal).toBe(4);
  });

  it('is empty when nobody left anything', () => {
    expect(boardFrom({ reactions: [], replies: [] })).toEqual({
      emoji: [],
      reactions: 0,
      replies: [],
      replyTotal: 0,
    });
  });
});

describe('the unseen dot (H25)', () => {
  it('marks what someone else left on my ripples after my last open; never opened counts as new', () => {
    const latest = latestFromOthers(
      {
        reactions: [reaction('mine', 'u-a', '❤️', '05'), reaction('mine', ME, '😂', '09')],
        replies: [reply('q', 'theirs', 'u-a', '07')],
      },
      ME,
      (id) => id === 'mine',
    );
    expect(latest).toEqual({ mine: '2026-10-26T10:05:00Z' });
    expect(isUnseen(latest.mine, '2026-10-26T10:00:00Z')).toBe(true);
    expect(isUnseen(latest.mine, '2026-10-26T10:06:00Z')).toBe(false);
    expect(isUnseen(latest.mine, null)).toBe(true);
    // Before the browser knows this device: no dot.
    expect(isUnseen(latest.mine, undefined)).toBe(false);
    expect(isUnseen(undefined, null)).toBe(false);
  });
});
