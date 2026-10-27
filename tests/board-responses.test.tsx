// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: (to: string) => pushed.push(to),
    replace: () => {},
    refresh: () => {},
  }),
}));
vi.mock('@/lib/media', () => ({
  signBoardPhotos: (photos: { path: string }[]) =>
    Promise.resolve(Object.fromEntries(photos.map((p) => [p.path, `https://signed/${p.path}`]))),
}));

import { placeCard, type Card } from '@/features/home/grid';
import {
  intersects,
  layoutMonthBoard,
  layoutWeekBoard,
  onBoard,
  type BoardLayout,
  type BoardPiece,
} from '@/features/month-board/layout';
import { MonthBoard } from '@/features/month-board/month-board';
import { PeopleProvider } from '@/features/people/people-provider';
import type { BoardResponses } from '@/features/responses/model';
import { summarizeSplash } from '@/features/splash/summary';
import { written } from './written-on';

/**
 * Reactions and replies on the board (H24): the badge on the label's
 * top-right corner, the first two replies as lines under it and "+n";
 * part of the item, never over anyone's words.
 */

const TZ = 'America/Vancouver';
const NOW = new Date('2026-10-26T20:00:00.000Z');
const TODAY = '2026-10-23';
const LANES = [{ id: 'c-food', name: 'Food', icon: '🍜' }];
const ME = 'u-yl';

beforeEach(() => {
  window.localStorage.clear();
  pushed.length = 0;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
});
afterEach(cleanup);

function card(id: string, title: string, day: string, photos = 0): Card {
  const summary = summarizeSplash(
    written({
      id,
      owner_id: 'a1',
      title,
      declared_start: null,
      declared_end: null,
      declared_lane_id: null,
      session_id: null,
      icon: null,
      pinned_at: null,
      pool_id: null,
      pool_lane_id: null,
      own_pool_id: null,
      created_by: null,
      type: 'free',
      prompt: null,
      ends_at: null,
      created_at: `${day}T18:00:00.000Z`,
    }),
    [
      {
        id: `${id}-b`,
        category_id: 'c-food',
        note: id,
        occurred_on: day,
        occurred_time: null,
        created_at: `${day}T18:00:00.000Z`,
      },
    ],
    TZ,
    NOW,
  );
  const placed = { ...placeCard(summary, '', TZ), href: `/splash/${id}` };
  return photos > 0
    ? {
        ...placed,
        photos: Array.from({ length: photos }, (_, at) => ({
          rippleId: `${id}-b`,
          path: `a1/${id}-${at}.webp`,
        })),
      }
    : placed;
}

/** Replies by count: as splash_reply_preview returns them, two to show and a third. */
function responses(replyTotal: number, reactions = 0): BoardResponses {
  return {
    emoji: reactions > 0 ? ['❤️', '😂', '🔥'].slice(0, Math.min(3, reactions)) : [],
    reactions,
    replies: Array.from({ length: Math.min(3, replyTotal) }, (_, at) => ({
      id: `reply-${at}`,
      rippleId: 'r',
      authorId: at % 2 === 0 ? ME : 'u-mk',
      body: `reply number ${at + 1}, a little long so it has to be cut at the label’s edge`,
    })),
    replyTotal,
  };
}

function with_(c: Card, r: BoardResponses | undefined): Card {
  return r ? { ...c, responses: r } : c;
}

function board(cards: Card[]) {
  return render(
    <PeopleProvider
      me={ME}
      people={{
        [ME]: { name: 'Yoonji Lee', photo: null },
        'u-mk': { name: 'Mina Kim', photo: null },
      }}
    >
      <MonthBoard
        cards={cards}
        month="2026-10"
        onMonth={() => {}}
        today={TODAY}
        onPick={() => {}}
        lanes={LANES}
      />
    </PeopleProvider>,
  );
}

function pieceOf(layout: BoardLayout, id: string): BoardPiece {
  return layout.pieces.find((p) => p.id === id)!;
}

describe('reply lines (H24)', () => {
  it('with 5 replies: 2 lines and "+3"; with 2: both and no "+n"; with none: nothing', () => {
    const { container } = board([
      with_(card('five', 'Five replies', '2026-10-20'), responses(5)),
      with_(card('two', 'Two replies', '2026-10-21'), responses(2)),
      card('none', 'No replies', '2026-10-22'),
    ]);
    const lines = (id: string) =>
      container.querySelectorAll(`[data-board-responses="${id}"] [data-board-reply]`);
    const more = (id: string) =>
      container.querySelector(`[data-board-responses="${id}"] [data-board-reply-more]`);
    expect(lines('five')).toHaveLength(2);
    expect(more('five')?.textContent).toBe('+3');
    expect(lines('two')).toHaveLength(2);
    expect(more('two')).toBeNull();
    expect(container.querySelector('[data-board-responses="none"]')).toBeNull();
  });

  it('opens the splash at the reply tapped, and "+n" at the first reply not shown', () => {
    const { container } = board([with_(card('five', 'Five replies', '2026-10-20'), responses(5))]);
    fireEvent.click(container.querySelector('[data-board-reply="reply-1"]')!);
    fireEvent.click(container.querySelector('[data-board-reply-more]')!);
    expect(pushed).toEqual(['/splash/five#reply-reply-1', '/splash/five#reply-reply-2']);
  });

  it('are part of the item: its height holds them, and the next item starts under them', () => {
    for (const width of [358, 980]) {
      const layout = layoutWeekBoard(
        [
          with_(card('first', 'Hoppers', '2026-10-20'), responses(5, 2)),
          card('second', 'Lynn Canyon - Twin Falls Trail', '2026-10-20'),
        ],
        '2026-10-20',
        { width },
      );
      const first = pieceOf(layout, 'first');
      const last = first.replyLines.at(-1)!;
      expect(first.replyLines).toHaveLength(3);
      expect(first.h).toBeGreaterThanOrEqual(last.y + last.h);
      const second = pieceOf(layout, 'second');
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.h - second.tuck);
      // Under the label, indented, as wide as it allows.
      expect(first.replyLines[0].y).toBeGreaterThanOrEqual(first.labelBox.y + first.labelBox.h);
      expect(first.replyLines[0].x).toBe(first.labelBox.x + 8);
    }
  });
});

describe('the badge (H24)', () => {
  it('shows the emoji (one on a phone) and the reaction count only; absent when there are none', () => {
    const cards = [
      with_(card('loved', 'Loved', '2026-10-20'), responses(2, 7)),
      with_(card('quiet', 'Only replies', '2026-10-21'), responses(2, 0)),
    ];
    const { container } = board(cards);
    const badge = container.querySelector('[data-board-badge="loved"]')!;
    expect(badge.textContent).toBe('❤️😂🔥7');
    expect(badge.textContent).not.toContain('💬');
    expect(container.querySelector('[data-board-badge="quiet"]')).toBeNull();
    fireEvent.click(badge);
    expect(pushed).toEqual(['/splash/loved#responded']);

    const phone = layoutWeekBoard(cards, '2026-10-20', { width: 358 });
    const wide = layoutWeekBoard(cards, '2026-10-20', { width: 980 });
    expect(phone.metrics.badge).toMatchObject({ h: 14, emoji: 1 });
    expect(wide.metrics.badge).toMatchObject({ h: 18, emoji: 3 });
    // Never under 10px (CLAUDE.md; Yoonji: "10px on phone, no exception").
    expect(phone.metrics.badge.size).toBeGreaterThanOrEqual(10);
    expect(phone.metrics.reply.size).toBeGreaterThanOrEqual(10);
  });

  it('sits on the label’s top-right corner, over its edge by half its height', () => {
    const layout = layoutWeekBoard(
      [with_(card('loved', 'Loved', '2026-10-20'), responses(0, 3))],
      '2026-10-20',
      { width: 980 },
    );
    const piece = pieceOf(layout, 'loved');
    const badge = piece.badgeBox!;
    expect(piece.badgeAt).toBe('right');
    expect(badge.x + badge.w).toBe(piece.labelBox.x + piece.labelBox.w);
    expect(badge.y).toBe(piece.labelBox.y - badge.h / 2);
    // Never out of its own item.
    expect(badge.y).toBeGreaterThanOrEqual(0);
  });

  it('moves to the top-left, after the sticker, where a sticker is set by hand on the top-right', () => {
    // A day of two or more always has a B: the one with the sticker.
    const day = [
      with_(card('one', 'Lynn Canyon - Twin Falls Trail', '2026-10-20'), responses(0, 3)),
      with_(card('two', 'Hoppers at the market', '2026-10-20'), responses(0, 3)),
    ];
    const first = layoutWeekBoard(day, '2026-10-20', { width: 980 });
    const drawn = first.pieces.find((p) => p.stickerBox)!;
    expect(drawn).toBeDefined();
    expect(drawn.badgeAt).toBe('right');
    // Its sticker set by hand over the label's top-right corner.
    const sticker = drawn.stickerBox!;
    const x = (drawn.labelBox.x + drawn.labelBox.w - sticker.w - sticker.x) / first.metrics.column;
    const y = (drawn.labelBox.y - sticker.h / 2 - sticker.y) / first.metrics.caption.line;
    const moved = day.map((c) =>
      c.splash.id === drawn.id ? { ...c, layout: { icon: { x, y } } } : c,
    );
    const piece = pieceOf(layoutWeekBoard(moved, '2026-10-20', { width: 980 }), drawn.id);
    expect(piece.badgeAt).toBe('left');
    expect(piece.badgeBox!.x).toBeLessThan(piece.labelBox.x + piece.labelBox.w / 2);
  });

  it('never covers words, its own or anyone’s, nor do the reply lines — week and month, phone and desktop', () => {
    const titles = [
      'Hoppers',
      'Lynn Canyon - Twin Falls Trail',
      'coffee went cold while I read the whole thing',
      'x',
    ];
    const busy = Array.from({ length: 24 }, (_, at) => {
      const day = `2026-10-${String(1 + (at % 8)).padStart(2, '0')}`;
      const c = card(`p${at}`, titles[at % 4], day, at % 5 === 2 ? 2 : 0);
      return with_(c, at % 3 === 2 ? undefined : responses(at % 6, at % 4 === 0 ? 0 : at));
    });
    for (const width of [358, 728, 980]) {
      for (const layout of [
        layoutMonthBoard(busy, '2026-10', { width }),
        layoutWeekBoard(busy, '2026-10-01', { width }),
      ]) {
        const words = layout.pieces.flatMap((p) => p.textBoxes.map((b) => onBoard(p, b)));
        for (const piece of layout.pieces) {
          if (piece.badgeBox) {
            const badge = onBoard(piece, piece.badgeBox);
            for (const w of words) expect(intersects(badge, w), `${piece.id} badge`).toBe(false);
          }
          for (const line of piece.replyLines.map((b) => onBoard(piece, b))) {
            for (const w of words)
              expect(intersects(line, w), `${piece.id} reply line`).toBe(false);
          }
        }
      }
    }
  });
});
