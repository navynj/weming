// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock('@/lib/media', () => ({
  signBoardPhotos: (photos: { path: string }[]) =>
    Promise.resolve(Object.fromEntries(photos.map((p) => [p.path, `https://signed/${p.path}`]))),
}));

import { placeCard, type Card, type CardPhoto } from '@/features/home/grid';
import {
  CELL_PAD_PX,
  COLUMN_PX,
  DAY_NUMBER_PX,
  layoutMonthBoard,
  ROW_BASE_PX,
  type BoardLayout,
} from '@/features/month-board/layout';
import { MonthBoard } from '@/features/month-board/month-board';
import { summarizeSplash, type Splash, type SplashBlock } from '@/features/splash/summary';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const NOW = new Date('2026-10-26T20:00:00.000Z');
const LANES = [
  { id: 'c-food', name: 'Food', icon: '🍜' },
  { id: 'c-place', name: 'Place', icon: '⛰️' },
];

afterEach(cleanup);

function block(id: string, day: string, category = 'c-food'): SplashBlock {
  return {
    id,
    category_id: category,
    note: id,
    occurred_on: day,
    occurred_time: null,
    created_at: `${day}T18:00:00.000Z`,
  };
}

function card(
  id: string,
  title: string,
  day: string,
  { photos = 0, over = {} }: { photos?: number; over?: Partial<Splash> } = {},
): Card {
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
      ...over,
    }),
    [block(`${id}-b`, over.declared_start ?? day)],
    TZ,
    NOW,
  );
  const placed = placeCard(summary, '', TZ);
  const pictured: CardPhoto[] = Array.from({ length: photos }, (_, at) => ({
    rippleId: `${id}-b`,
    path: `a1/${id}-${at}.webp`,
  }));
  return photos > 0 ? { ...placed, photos: pictured } : placed;
}

const OCTOBER = [
  card('hoppers', 'Hoppers', '2026-10-03'),
  card('lynn', 'Lynn Canyon - Twin Falls Trail', '2026-10-03'),
  card('soup', 'Beef Short Rib Soup & Alfa Tea', '2026-10-03', { photos: 1 }),
  card('two', 'Two photos', '2026-10-09', { photos: 2 }),
  card('four', 'Four photos', '2026-10-14', { photos: 4 }),
  // Oct 3 to 13: three week rows (Sep 27–Oct 3, Oct 4–10, Oct 11–17).
  card('trip', 'Island trip', '2026-10-03', {
    over: { declared_start: '2026-10-03', declared_end: '2026-10-13' },
  }),
  card('sept', 'Not this month', '2026-09-20'),
];

function board(cards: Card[] = OCTOBER) {
  return render(<MonthBoard cards={cards} month="2026-10" onMonth={() => {}} lanes={LANES} />);
}

describe('the month board’s layout', () => {
  const layout = layoutMonthBoard(OCTOBER, '2026-10');

  it('places every splash of the month exactly once, and a range once per week row', () => {
    expect(layout.pieces.map((p) => p.id).sort()).toEqual(
      ['four', 'hoppers', 'lynn', 'soup', 'two'].sort(),
    );
    expect(layout.tapes.map((t) => [t.id, t.week])).toEqual([
      ['trip', 0],
      ['trip', 1],
      ['trip', 2],
    ]);
    expect(layout.title).toBe('2026 OCT');
    expect(layout.weekdays).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
  });

  it('picks photos when a record has them, a sticker otherwise, the same way every time', () => {
    const again = layoutMonthBoard([...OCTOBER].reverse(), '2026-10');
    for (const piece of layout.pieces) {
      expect(piece.variant).toBe((piece.card.photos?.length ?? 0) > 0 ? 'photo' : 'sticker');
      const twin = again.pieces.find((p) => p.id === piece.id)!;
      expect([twin.label, twin.rotate, twin.x, twin.y]).toEqual([
        piece.label,
        piece.rotate,
        piece.x,
        piece.y,
      ]);
      expect(Math.abs(piece.rotate)).toBeLessThanOrEqual(4);
    }
  });

  it('fans one, two or three photo cards, the rest counted on the top card', () => {
    const fan = (id: string) => layout.pieces.find((p) => p.id === id)!;
    expect([fan('soup').fan.length, fan('soup').morePhotos]).toEqual([1, 0]);
    expect([fan('two').fan.length, fan('two').morePhotos]).toEqual([2, 0]);
    expect([fan('four').fan.length, fan('four').morePhotos]).toEqual([3, 1]);
    // Different stable rotations, each card behind offset by 6 to 10px.
    const cards = fan('four').fan;
    expect(new Set(cards.map((c) => c.rotate)).size).toBe(3);
    for (let at = 1; at < cards.length; at += 1) {
      const step = cards[at - 1].dx - cards[at].dx;
      expect(step).toBeGreaterThanOrEqual(6);
      expect(step).toBeLessThanOrEqual(10);
    }
  });
});

/** A day with more than fits: its pieces stack down its own cell, and its row grows. */
const BUSY = [
  ...Array.from({ length: 6 }, (_, at) =>
    card(`busy-${at}`, `A busy day, number ${at}`, '2026-10-07', { photos: at % 2 }),
  ),
  card('quiet', 'Quiet', '2026-10-08'),
  card('later', 'Later', '2026-10-21'),
  card('range', 'A span', '2026-10-06', {
    over: { declared_start: '2026-10-06', declared_end: '2026-10-08' },
  }),
];

function within(layout: BoardLayout): void {
  for (const piece of layout.pieces) {
    const week = layout.weeks[piece.week];
    const cell = week.cells[piece.col];
    expect(cell.day).toBe(piece.day);
    expect(piece.x).toBeGreaterThanOrEqual(cell.x + CELL_PAD_PX);
    expect(piece.x + piece.w).toBeLessThanOrEqual(cell.x + COLUMN_PX - CELL_PAD_PX);
    // Never over the day number, never past the row's foot.
    expect(piece.y).toBeGreaterThanOrEqual(week.y + DAY_NUMBER_PX);
    expect(piece.y + piece.h).toBeLessThanOrEqual(week.y + week.h);
  }
}

describe('a day with overflow', () => {
  const layout = layoutMonthBoard(BUSY, '2026-10');

  it('keeps every piece inside its own day cell', () => {
    within(layout);
    within(layoutMonthBoard(OCTOBER, '2026-10'));
  });

  it('grows the week row to its tallest cell, the rest at the base height', () => {
    for (const week of layout.weeks) {
      const bottoms = layout.pieces
        .filter((p) => p.week === week.index)
        .map((p) => p.y + p.h - week.y + CELL_PAD_PX);
      expect(week.h).toBe(Math.max(ROW_BASE_PX, ...bottoms));
    }
    const busyRow = layout.weeks.find((w) => w.cells.some((c) => c.day === '2026-10-07'))!;
    expect(busyRow.h).toBeGreaterThan(ROW_BASE_PX);
    const quietRow = layout.weeks.find((w) => w.cells.some((c) => c.day === '2026-10-28'))!;
    expect(quietRow.h).toBe(ROW_BASE_PX);
  });

  it('stacks a day’s pieces by time, each overlapping the last by at most 12px', () => {
    const day = layout.pieces.filter((p) => p.day === '2026-10-07');
    expect(day.map((p) => p.id)).toEqual(Array.from({ length: 6 }, (_, at) => `busy-${at}`));
    for (let at = 1; at < day.length; at += 1) {
      const overlap = day[at - 1].y + day[at - 1].h - day[at].y;
      expect(overlap).toBeGreaterThanOrEqual(0);
      expect(overlap).toBeLessThanOrEqual(12);
    }
  });

  it('puts range tapes at the top of the row, the day pieces below them', () => {
    const tape = layout.tapes.find((t) => t.id === 'range')!;
    const below = layout.pieces.filter((p) => p.week === tape.week);
    for (const piece of below) expect(piece.y).toBeGreaterThanOrEqual(tape.y + tape.h);
  });

  it('shows every record, with no "+N" chip', () => {
    const { container } = board(BUSY);
    expect(container.querySelectorAll('[data-board-piece]')).toHaveLength(8);
    const counts = [...container.querySelectorAll('[data-month-board] *')].filter(
      (el) => /^\+\d+$/.test(el.textContent ?? '') && !el.hasAttribute('data-board-more-photos'),
    );
    expect(counts).toHaveLength(0);
  });
});

describe('the month board, drawn', () => {
  it('draws one, two and three photo cards, the last with "+1"', () => {
    const { container } = board();
    const cards = (id: string) =>
      container.querySelectorAll(`[data-board-piece="${id}"] [data-board-photo-card]`);
    expect(cards('soup')).toHaveLength(1);
    expect(cards('two')).toHaveLength(2);
    expect(cards('four')).toHaveLength(3);
    expect(
      container.querySelector('[data-board-piece="four"] [data-board-more-photos]')!.textContent,
    ).toBe('+1');
    expect(container.querySelector('[data-board-piece="two"] [data-board-more-photos]')).toBeNull();
  });

  it('gives every record a label; the icon is small with photos and a sticker without', () => {
    const { container } = board();
    const pieces = [...container.querySelectorAll('[data-board-piece]')];
    expect(pieces).toHaveLength(5);
    for (const piece of pieces) {
      expect(piece.querySelector('[data-board-label]')!.textContent).toContain(
        piece.getAttribute('aria-label')!,
      );
      const photo = piece.getAttribute('data-variant') === 'photo';
      expect(piece.querySelector('[data-board-icon]') !== null).toBe(photo);
      expect(piece.querySelector('[data-board-sticker]') !== null).toBe(!photo);
    }
    expect(
      container.querySelector('[data-board-piece="lynn"] [data-board-sticker]')!.textContent,
    ).toBe('🍜');
  });

  it('keeps label style and rotation across renders', () => {
    const read = () =>
      [...board().container.querySelectorAll('[data-board-piece]')].map((p) => [
        p.getAttribute('data-board-piece'),
        p.getAttribute('data-label'),
        p.getAttribute('data-rotate'),
      ]);
    const first = read();
    cleanup();
    expect(read()).toEqual(first);
  });

  it('opens a piece’s or a tape’s sheet on a tap: the post’s own page, or its pool’s', () => {
    const pooled = { ...OCTOBER[0], href: '/pool/p-a/splash/hoppers' };
    const { container } = board([pooled, ...OCTOBER.slice(1)]);
    expect(container.querySelector('[data-board-piece="hoppers"]')!.getAttribute('href')).toBe(
      '/pool/p-a/splash/hoppers',
    );
    expect(container.querySelector('[data-board-piece="lynn"]')!.getAttribute('href')).toBe(
      '/splash/lynn',
    );
    expect(container.querySelector('[data-board-tape="trip"]')!.getAttribute('href')).toBe(
      '/splash/trip',
    );
  });

  it('heads the month, names the weekdays, and mutes the days outside it', () => {
    const { container } = board();
    expect(container.querySelector('[data-board-title]')!.textContent).toBe('2026 OCT');
    expect(container.querySelectorAll('[data-board-weekday]')).toHaveLength(7);
    expect(
      container.querySelector('[data-board-cell="2026-09-27"]')!.hasAttribute('data-in-month'),
    ).toBe(false);
    expect(
      container.querySelector('[data-board-cell="2026-10-01"]')!.hasAttribute('data-in-month'),
    ).toBe(true);
  });

  it('says so when the month is empty', () => {
    const { container } = board([]);
    expect(container.querySelector('[data-board-empty]')!.textContent).toBe(
      'Nothing on the board for October yet.',
    );
  });
});
