import { describe, expect, it } from 'vitest';

import {
  byThread,
  inThread,
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
  return {
    ripple_id: ripple,
    user_id: user,
    emoji,
    created_at: `2026-10-26T10:${at}:00Z`,
    thread_pool_id: null,
  };
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
    thread_pool_id: null,
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

describe('one pool’s thread (0053)', () => {
  it('keeps that pool’s responses and the owner’s from no pool, never another pool’s', () => {
    const value = {
      reactions: [
        { ...reaction('r1', 'u-a', '❤️', '01'), thread_pool_id: 'p-a' },
        { ...reaction('r1', 'u-b', '🔥', '02'), thread_pool_id: 'p-b' },
        reaction('r1', ME, '👏', '03'),
      ],
      replies: [
        reply('in-a', 'r1', 'u-a', '04', { thread_pool_id: 'p-a' }),
        reply('in-b', 'r1', 'u-b', '05', { thread_pool_id: 'p-b' }),
        reply('owner', 'r1', ME, '06'),
      ],
    };
    const a = inThread(value, 'p-a');
    expect(a.reactions.map((r) => r.user_id)).toEqual(['u-a', ME]);
    expect(a.replies.map((r) => r.id)).toEqual(['in-a', 'owner']);
    expect(inThread(value, null)).toBe(value);
  });
});

describe('every thread on the owner’s Home card, each said where it came from (0053)', () => {
  it('groups mine first, unlabelled, then each pool by name, then a deleted pool’s', () => {
    const groups = byThread(
      {
        reactions: [
          { ...reaction('r1', 'u-a', '❤️', '01'), thread_pool_id: 'p-church' },
          reaction('r1', ME, '👏', '02'),
        ],
        replies: [
          reply('gone', 'r1', 'u-c', '03'),
          reply('in-b', 'r1', 'u-b', '04', { thread_pool_id: 'p-book' }),
          reply('in-a', 'r1', 'u-a', '05', { thread_pool_id: 'p-church' }),
        ],
      },
      { owner: ME, pools: { 'p-church': 'Church', 'p-book': 'Book club' } },
    );
    expect(groups.map((g) => g.label)).toEqual([
      null,
      'in Church',
      'in Book club',
      'in a deleted Pool',
    ]);
    expect(groups[0].value.reactions.map((r) => r.user_id)).toEqual([ME]);
    expect(groups[1].value.replies.map((r) => r.id)).toEqual(['in-a']);
    expect(groups[3].value.replies.map((r) => r.id)).toEqual(['gone']);
  });
});
