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

import { placeCard, type Card, type CardPhoto } from '@/features/home/grid';
import type { Ring } from '@/features/home/lane-grid';
import { WaveMark } from '@/components/ui/waves';
import {
  COLUMNS,
  HEADER_PX,
  layoutMonthBoard,
  layoutWeekBoard,
  STICKER_LARGE,
  weekTitle,
  type BoardLayout,
} from '@/features/month-board/layout';
import { MonthBoard } from '@/features/month-board/month-board';
import { PeopleProvider } from '@/features/people/people-provider';
import { summarizeSplash, type Splash, type SplashBlock } from '@/features/splash/summary';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const NOW = new Date('2026-10-26T20:00:00.000Z');
const TODAY = '2026-10-23';
const LANES = [
  { id: 'c-food', name: 'Food', icon: '🍜' },
  { id: 'c-place', name: 'Place', icon: '⛰️' },
];

function media(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}
beforeEach(() => {
  window.localStorage.clear();
  pushed.length = 0;
  media(false);
});
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

// The week of Oct 18–24 (today is the 23rd), and more of October around it.
const WEEK = [
  card('hoppers', 'Hoppers', '2026-10-20'),
  card('lynn', 'Lynn Canyon - Twin Falls Trail', '2026-10-20'),
  card('soup', 'Beef Short Rib Soup & Alfa Tea', '2026-10-20', { photos: 1 }),
  card('two', 'Two photos', '2026-10-22', { photos: 2 }),
  card('four', 'Four photos', '2026-10-23', { photos: 4 }),
  // Oct 20 to 27: this week and the next.
  card('trip', 'Island trip', '2026-10-20', {
    over: { declared_start: '2026-10-20', declared_end: '2026-10-27' },
  }),
];
const OCTOBER = [
  ...WEEK,
  card('early', 'Early in the month', '2026-10-03'),
  card('sept', 'Not this month', '2026-09-20'),
];

const ME = 'u-yl';
type Props = {
  onPick?: (id: string) => void;
  ring?: Ring | null;
  dropped?: string | null;
  month?: string;
  onMonth?: (month: string) => void;
};
function tree(
  cards: Card[],
  { onPick = () => {}, ring = null, dropped = null, month = '2026-10', onMonth = () => {} }: Props,
) {
  return (
    <PeopleProvider
      me={ME}
      people={{
        [ME]: { name: 'Yoonji Lee', photo: null },
        'u-mk': { name: 'Mina Kim', photo: null },
      }}
    >
      <MonthBoard
        cards={cards}
        month={month}
        onMonth={onMonth}
        today={TODAY}
        ring={ring}
        dropped={dropped}
        onPick={onPick}
        lanes={LANES}
      />
    </PeopleProvider>
  );
}
function board(cards: Card[] = OCTOBER, props: Props = {}) {
  return render(tree(cards, props));
}

/**
 * Every piece at its lane's line, its label the lane wide — flush, or
 * offset into the lane and over the next (the last lane's ends at the
 * board's edge) — under the header, within its row.
 */
function laned(layout: BoardLayout): void {
  const { column } = layout.metrics;
  for (const piece of layout.pieces) {
    const week = layout.weeks[piece.week];
    const cell = week.cells[piece.col];
    expect(cell.day).toBe(piece.day);
    expect(piece.x).toBe(cell.x);
    const label = piece.labelBox;
    if (piece.placement === 'flush') {
      expect(label.x).toBe(0);
      expect(label.w).toBe(column);
    } else {
      expect(label.x).toBeGreaterThanOrEqual(column * 0.25 - 1);
      expect(label.x).toBeLessThanOrEqual(column * 0.4 + 1);
      if (piece.col < COLUMNS - 1) {
        expect(label.w).toBe(column);
        // Over the right separator, onto the next lane.
        expect(label.x + label.w).toBeGreaterThan(column);
      } else {
        expect(label.x + label.w).toBe(column);
      }
    }
    expect(piece.w).toBe(label.x + label.w);
    expect(piece.y).toBeGreaterThanOrEqual(week.y);
    expect(piece.y + piece.h).toBeLessThanOrEqual(week.y + week.h);
  }
}

describe('the week board (the default)', () => {
  const layout = layoutWeekBoard(WEEK, TODAY, { width: 358 });

  it('is the week of the day given: seven lanes, Sunday first, each headed by its weekday and number', () => {
    expect(layout.key).toBe('2026-10-18');
    expect(layout.weeks).toHaveLength(1);
    expect(layout.headers.map((h) => `${h.weekday} ${h.number}`)).toEqual([
      'SUN 18',
      'MON 19',
      'TUE 20',
      'WED 21',
      'THU 22',
      'FRI 23',
      'SAT 24',
    ]);
    expect(layout.title).toBe('Oct 18 – 24');
    expect(weekTitle('2026-10-26')).toBe('Oct 25 – 31');
    expect(weekTitle('2026-09-28')).toBe('Sep 27 – Oct 3');
  });

  it('places every splash of the week once, in time order down its lane, and a range as one band', () => {
    expect(layout.pieces.map((p) => p.id)).toEqual(['hoppers', 'lynn', 'soup', 'two', 'four']);
    expect(layout.tapes.map((t) => [t.id, t.startCol, t.endCol, t.startsHere, t.endsHere])).toEqual(
      [['trip', 2, 6, true, false]],
    );
  });

  it('counts a day’s records for its waves, three lines at most', () => {
    expect(layout.weeks[0].cells.map((c) => c.count)).toEqual([0, 0, 4, 1, 2, 2, 1]);
  });

  it('fits seven lanes at a phone’s width, every label the lane wide, flush or offset', () => {
    expect(layout.width).toBe(358);
    expect(layout.metrics.column * COLUMNS).toBe(358);
    expect(layout.metrics.narrow).toBe(true);
    laned(layout);
    laned(layoutWeekBoard(WEEK, TODAY, { width: 728 }));
  });

  it('stacks a day’s items with no gap, directly under the header, one breath only after a photo card', () => {
    const tue = layout.pieces.filter((p) => p.day === '2026-10-20');
    expect(tue[0].y).toBe(HEADER_PX + layout.tapes.length * 26);
    expect(tue[1].y).toBe(tue[0].y + tue[0].h);
    expect(tue[2].y).toBe(tue[1].y + tue[1].h);
    // The same day with nothing ranged, and a post after the photo (ids order the ties).
    const noTapes = layoutWeekBoard(
      [WEEK[0], WEEK[1], WEEK[2], card('zz-after', 'After the photo', '2026-10-20')],
      TODAY,
      { width: 358 },
    );
    const [a, b, photo, after] = noTapes.pieces;
    expect(a.y).toBe(HEADER_PX);
    expect(b.y).toBe(a.y + a.h);
    expect(photo.variant).toBe('photo');
    expect(after.id).toBe('zz-after');
    expect(after.y).toBe(photo.y + photo.h + 6);
  });

  it('keeps every title at 10px', () => {
    expect(layout.metrics.caption.size).toBe(10);
    expect(layoutWeekBoard(WEEK, TODAY, { width: 980 }).metrics.caption.size).toBe(10);
  });
});

describe('the week board, drawn', () => {
  it('opens on this week, Week selected in white, headed weekday over number, and never scrolls sideways', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 358,
    });
    try {
      const { container } = board();
      expect(container.querySelector('[data-month-board]')!.getAttribute('data-month-board')).toBe(
        '2026-10-18',
      );
      const selected = container.querySelector('[data-board-span-option="week"]')!;
      expect(selected.getAttribute('aria-selected')).toBe('true');
      expect(selected.className).toContain('bg-white');
      expect(selected.className).not.toContain('bg-ink');
      expect(container.querySelector('[data-board-title]')!.textContent).toBe('Oct 18 – 24');
      expect(container.querySelector<HTMLElement>('[data-board-canvas]')!.style.width).toBe('100%');
      expect(container.querySelector('[data-board-scroller]')!.className).toContain(
        'overflow-x-hidden',
      );
      const header = container.querySelector('[data-board-header="2026-10-20"]')!;
      expect(header.textContent).toBe('TUE20');
      expect(header.querySelector('[data-board-waves]')!.getAttribute('data-lines')).toBe('3');
      expect(
        container.querySelector('[data-board-header="2026-10-19"] [data-board-waves]'),
      ).toBeNull();
      expect(container.querySelector('[data-board-tick]')).toBeNull();
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });

  it('turns one week on the arrows, and on a sideways swipe; a vertical drag turns nothing', () => {
    const { container } = board();
    const key = () =>
      container.querySelector('[data-month-board]')!.getAttribute('data-month-board');
    fireEvent.click(container.querySelector('[data-board-next]')!);
    expect(key()).toBe('2026-10-25');
    fireEvent.click(container.querySelector('[data-board-prev]')!);
    fireEvent.click(container.querySelector('[data-board-prev]')!);
    expect(key()).toBe('2026-10-11');
    const scroller = container.querySelector('[data-board-scroller]')!;
    const swipe = (from: [number, number], to: [number, number]): void => {
      fireEvent.touchStart(scroller, { touches: [{ clientX: from[0], clientY: from[1] }] });
      fireEvent.touchMove(scroller, { touches: [{ clientX: to[0], clientY: to[1] }] });
      fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
    };
    swipe([200, 300], [100, 310]);
    expect(key()).toBe('2026-10-18');
    swipe([100, 300], [220, 290]);
    expect(key()).toBe('2026-10-11');
    swipe([200, 300], [120, 420]);
    expect(key()).toBe('2026-10-11');
  });

  it('says so when the week is empty, and keeps its title small', () => {
    const { container } = board([]);
    expect(container.querySelector('[data-board-empty]')!.textContent).toBe(
      'Nothing this week yet.',
    );
    expect(container.querySelector('[data-board-title]')!.className).toContain('text-sm');
  });
});

describe('the month board', () => {
  const layout = layoutMonthBoard(OCTOBER, '2026-10', { width: 728 });

  it('places every splash of the month once, a range once per week row it crosses, lanes kept', () => {
    expect(layout.pieces.map((p) => p.id).sort()).toEqual(
      ['early', 'four', 'hoppers', 'lynn', 'soup', 'two'].sort(),
    );
    expect(layout.tapes.map((t) => [t.id, t.week, t.startsHere, t.endsHere])).toEqual([
      ['trip', 3, true, false],
      ['trip', 4, false, true],
    ]);
    expect(layout.title).toBe('2026 OCT');
    laned(layout);
    laned(layoutMonthBoard(OCTOBER, '2026-10', { width: 358 }));
  });

  it('grows a week row to its tallest lane, the rest at the base height', () => {
    const busy = layout.weeks.find((w) => w.cells.some((c) => c.day === '2026-10-20'))!;
    const quiet = layout.weeks.find((w) => w.cells.some((c) => c.day === '2026-10-28'))!;
    expect(busy.h).toBeGreaterThan(layout.metrics.rowBase);
    expect(quiet.h).toBe(layout.metrics.rowBase);
  });

  it('is chosen by the switch, remembered per device, deepens by the row, and a day opens its week', () => {
    const { container } = board();
    fireEvent.click(container.querySelector('[data-board-span-option="month"]')!);
    expect(container.querySelector('[data-month-board]')!.getAttribute('data-month-board')).toBe(
      '2026-10',
    );
    expect(window.localStorage.getItem('weming.board-span')).toBe('month');
    expect(container.querySelector('[data-board-span-option="month"]')!.className).toContain(
      'bg-white',
    );
    const rows = container.querySelectorAll<HTMLElement>('[data-board-week-row]');
    expect(rows[0].style.background).toBe('');
    expect(rows[2].style.background).toContain('rgb(');
    expect(rows[2].style.background).not.toBe(rows[1].style.background);
    const outside = container.querySelector('[data-board-cell="2026-09-27"]')!;
    expect(outside.hasAttribute('data-in-month')).toBe(false);
    expect(outside.querySelector('[data-board-day]')!.className).toContain('text-white/40');
    expect(
      container
        .querySelector('[data-board-day="2026-10-20"] [data-board-waves]')!
        .getAttribute('data-lines'),
    ).toBe('3');
    fireEvent.click(container.querySelector('[data-board-day="2026-10-07"]')!);
    expect(container.querySelector('[data-month-board]')!.getAttribute('data-board-span')).toBe(
      'week',
    );
    expect(container.querySelector('[data-month-board]')!.getAttribute('data-month-board')).toBe(
      '2026-10-04',
    );
  });

  it('turns one month on the arrows, through its owner', () => {
    window.localStorage.setItem('weming.board-span', 'month');
    const months: string[] = [];
    const { container } = board(OCTOBER, { onMonth: (m) => months.push(m) });
    fireEvent.click(container.querySelector('[data-board-next]')!);
    fireEvent.click(container.querySelector('[data-board-prev]')!);
    expect(months).toEqual(['2026-11', '2026-09']);
  });
});

describe('a day’s plan: rhythm, not meaning', () => {
  const MONTH = Array.from({ length: 60 }, (_, at) =>
    card(`p${at}`, `Post ${at}`, `2026-10-${String((at % 28) + 1).padStart(2, '0')}`, {
      photos: at % 9 === 0 ? 1 : 0,
    }),
  );
  const layout = layoutMonthBoard(MONTH, '2026-10', { width: 728 });
  const byDay = new Map<string, typeof layout.pieces>();
  for (const piece of layout.pieces) byDay.set(piece.day, [...(byDay.get(piece.day) ?? []), piece]);

  it('alternates flush and offset within a day, both used over a month', () => {
    expect(layout.pieces.some((p) => p.placement === 'flush')).toBe(true);
    expect(layout.pieces.some((p) => p.placement === 'offset')).toBe(true);
    for (const pieces of byDay.values()) {
      for (let at = 1; at < pieces.length; at += 1) {
        expect(pieces[at].placement).not.toBe(pieces[at - 1].placement);
      }
    }
  });

  it('alternates white and ink within a day; none is a photo caption’s alone', () => {
    for (const pieces of byDay.values()) {
      const labelled = pieces.filter((p) => p.variant !== 'photo');
      for (let at = 1; at < labelled.length; at += 1) {
        expect(labelled[at].label).not.toBe(labelled[at - 1].label);
      }
      for (const piece of pieces) {
        if (piece.variant === 'photo') expect(piece.label).toBe('none');
        else expect(['white', 'ink']).toContain(piece.label);
      }
    }
  });

  it('gives a day of two or more items at least one large sticker, never the first item', () => {
    for (const pieces of byDay.values()) {
      expect(pieces[0].sticker?.size).not.toBe('large');
      if (pieces.length >= 2 && pieces.some((p, i) => i > 0 && p.variant !== 'photo')) {
        expect(pieces.some((p) => p.sticker?.size === 'large')).toBe(true);
      }
    }
  });

  it('draws the same board every time', () => {
    const again = layoutMonthBoard([...MONTH].reverse(), '2026-10', { width: 728 });
    expect(again.pieces.map((p) => [p.label, p.placement, p.sticker, p.x, p.y])).toEqual(
      layout.pieces.map((p) => [p.label, p.placement, p.sticker, p.x, p.y]),
    );
  });
});

describe('labels, stickers, photo cards and bands (the mockup)', () => {
  it('draws every label the lane wide, square and straight; an offset one above the next lane', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 728,
    });
    try {
      const { container } = board();
      const column = 728 / 7;
      for (const piece of container.querySelectorAll<HTMLElement>('[data-board-piece]')) {
        expect(piece.style.transform).toBe('');
        const label = piece.querySelector<HTMLElement>('[data-board-label]')!;
        expect(parseFloat(label.style.width)).toBeCloseTo(column, 5);
        expect(label.style.borderRadius).toBe('');
        expect(label.className).not.toMatch(/rounded/);
        const offset = piece.getAttribute('data-placement') === 'offset';
        expect(piece.className.includes('z-10')).toBe(offset);
        if (offset) expect(parseFloat(label.style.left)).toBeGreaterThan(0);
      }
      const tue = [
        ...container.querySelectorAll('[data-board-piece][data-board-day="2026-10-20"]'),
      ];
      expect(tue.map((p) => p.getAttribute('data-placement'))).toHaveLength(3);
      expect(tue[0].getAttribute('data-placement')).not.toBe(tue[1].getAttribute('data-placement'));
      expect(tue[1].getAttribute('data-placement')).not.toBe(tue[2].getAttribute('data-placement'));
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });

  it('centres a large sticker on the label’s top corner, 1.8 label heights, above everything', () => {
    const { container } = board();
    const large = container.querySelector<HTMLElement>('[data-board-piece][data-sticker="large"]')!;
    expect(large).not.toBeNull();
    const sticker = large.querySelector<HTMLElement>('[data-board-sticker]')!;
    const label = large.querySelector<HTMLElement>('[data-board-label]')!;
    const labelH = parseFloat(label.style.height);
    const size = parseFloat(sticker.style.width);
    expect(size).toBe(Math.round(labelH * STICKER_LARGE));
    expect(parseFloat(sticker.style.top)).toBe(parseFloat(label.style.top) - size / 2);
    const labelX = parseFloat(label.style.left);
    const labelW = parseFloat(label.style.width);
    expect([labelX - size / 2, labelX + labelW - size / 2]).toContain(
      parseFloat(sticker.style.left),
    );
    expect(sticker.className).toContain('z-20');
    expect(large.querySelector('[data-board-icon]')).toBeNull();
    const small = container.querySelector<HTMLElement>('[data-board-piece][data-sticker="small"]')!;
    expect(small.querySelector('[data-board-icon]')).not.toBeNull();
    expect(small.querySelector('[data-board-sticker]')).toBeNull();
  });

  it('draws photo cards seven to eight and a half tenths of the lane, square, left or right, no frame, the caption directly under; one, two and three, the last with "+1"', () => {
    const { container } = board();
    const cards = (id: string) =>
      container.querySelectorAll<HTMLElement>(`[data-board-piece="${id}"] [data-board-photo-card]`);
    expect(cards('soup')).toHaveLength(1);
    expect(cards('two')).toHaveLength(2);
    expect(cards('four')).toHaveLength(3);
    expect(
      container.querySelector('[data-board-piece="four"] [data-board-more-photos]')!.textContent,
    ).toBe('+1');
    const column = 728 / 7;
    for (const id of ['soup', 'two', 'four']) {
      const laid = layoutWeekBoard(WEEK, TODAY, { width: 728 }).pieces.find((p) => p.id === id)!;
      expect(laid.photoBox!.w).toBeGreaterThanOrEqual(column * 0.7 - 1);
      expect(laid.photoBox!.w).toBeLessThanOrEqual(column * 0.85 + 1);
      expect([0, column - laid.photoBox!.w]).toContain(laid.photoBox!.x);
      expect(laid.labelBox.y).toBe(laid.photoBox!.h);
      expect(laid.label).toBe('none');
    }
    const one = cards('soup')[0];
    expect(one.style.width).toBe(one.style.height);
    expect(one.className).not.toMatch(/rounded|bg-white|shadow/);
  });

  it('runs a range band the full width of its lanes, square', () => {
    const { container } = board();
    const band = container.querySelector<HTMLElement>(
      '[data-board-tape="trip"] [data-board-band]',
    )!;
    expect(band.className).not.toMatch(/rounded/);
    const laid = layoutWeekBoard(WEEK, TODAY, { width: 728 }).tapes[0];
    expect(laid.x).toBe(2 * (728 / 7));
    expect(laid.w).toBe(5 * (728 / 7));
  });

  it('gives every record a label, and its icon once: small before the words, or large on a corner', () => {
    const { container } = board();
    for (const piece of container.querySelectorAll('[data-board-piece]')) {
      expect(piece.querySelector('[data-board-label]')!.textContent).toContain(
        piece.querySelector('[data-board-pick]')!.getAttribute('aria-label')!,
      );
      const inline = piece.querySelector('[data-board-icon]') !== null;
      const large = piece.querySelector('[data-board-sticker]') !== null;
      expect(inline !== large).toBe(true);
    }
  });

  it('draws the day’s waves with the pill’s own glyph, scaled to 24px, one per record, three at most', () => {
    const { container } = board();
    const header = container.querySelector('[data-board-header="2026-10-20"]')!;
    const waves = header.querySelectorAll('[data-board-wave]');
    expect(waves).toHaveLength(3);
    const pill = render(<WaveMark count={1} />).container.querySelector('svg path')!;
    for (const wave of waves) expect(wave.getAttribute('d')).toBe(pill.getAttribute('d'));
    const svg = waves[0].closest('svg')!;
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 14 4`);
    expect(waves[0].getAttribute('stroke-width')).toBe('2');
    expect(waves[0].getAttribute('stroke-opacity')).toBe('0.6');
    expect(header.querySelector('[data-board-waves]')!.className).toContain('gap-1');
  });
});

describe('a tap, and the post the stack is heading to (review)', () => {
  it('brings a tapped piece’s or band’s post to the top of the stack', () => {
    const picked: string[] = [];
    const { container } = board(OCTOBER, { onPick: (id) => picked.push(id) });
    fireEvent.click(container.querySelector('[data-board-pick="lynn"]')!);
    fireEvent.click(container.querySelector('[data-board-pick="trip"]')!);
    expect(picked).toEqual(['lynn', 'trip']);
  });

  it('bobs the heading post on the water, once per ring', () => {
    const { container, rerender } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    const heading = container.querySelector('[data-board-piece="lynn"]')!;
    expect(heading.hasAttribute('data-heading')).toBe(true);
    expect(heading.className).toContain('board-bob');
    expect(container.querySelector('[data-board-piece="hoppers"]')!.className).not.toContain(
      'board-bob',
    );
    rerender(tree(OCTOBER, { ring: { id: 'hoppers', seq: 1 } }));
    expect(container.querySelector('[data-board-piece="lynn"]')!.className).not.toContain(
      'board-bob',
    );
    expect(container.querySelector('[data-board-piece="hoppers"]')!.className).toContain(
      'board-bob',
    );
  });

  it('turns to the week the heading post is on when it is on another page', () => {
    const { container, rerender } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    rerender(tree(OCTOBER, { ring: { id: 'early', seq: 1 } }));
    expect(container.querySelector('[data-month-board]')!.getAttribute('data-month-board')).toBe(
      '2026-09-27',
    );
    expect(container.querySelector('[data-board-piece="early"]')!.className).toContain('board-bob');
  });

  it('turns to the heading post’s month, through its owner, when Month is showing', () => {
    window.localStorage.setItem('weming.board-span', 'month');
    const months: string[] = [];
    const onMonth = (m: string) => months.push(m);
    const { rerender } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 }, onMonth });
    rerender(tree(OCTOBER, { ring: { id: 'sept', seq: 1 }, onMonth }));
    expect(months).toEqual(['2026-09']);
  });

  it('plunges a post just dropped into the water', () => {
    const { container } = board(OCTOBER, { ring: { id: 'four', seq: 1 }, dropped: 'four' });
    const dropped = container.querySelector('[data-board-piece="four"]')!;
    expect(dropped.hasAttribute('data-dropped')).toBe(true);
    expect(dropped.className).toContain('board-plunge');
    expect(dropped.className).not.toContain('board-bob');
  });

  it('holds still under reduced motion', () => {
    media(true);
    const { container } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    expect(container.querySelector('[data-board-piece="lynn"]')!.className).not.toContain(
      'board-bob',
    );
  });
});

describe('an open joint splash (meaning is shape)', () => {
  const joint = (awaiting: { authorId: string; initials: string }[]): Card => ({
    ...card('jam', 'Jam session', '2026-10-21'),
    joint: true,
    href: '/pool/p-a/splash/jam',
    writers: [{ authorId: 'u-mk', initials: 'MK' }],
    awaiting,
  });

  it('carries an empty slot to the label’s right, with the faded faces of who has not written', () => {
    const { container } = board([joint([{ authorId: 'u-jo', initials: 'JO' }])]);
    const slot = container.querySelector<HTMLElement>('[data-board-slot="jam"]')!;
    expect(slot.className).toContain('border-dashed');
    expect(slot.textContent).toBe('JO');
    expect(slot.querySelector('.opacity-50')).not.toBeNull();
    expect(slot.tagName).toBe('SPAN');
    const laid = layoutWeekBoard([joint([{ authorId: 'u-jo', initials: 'JO' }])], TODAY, {
      width: 980,
    }).pieces[0];
    expect(laid.slot).toBe(true);
    expect(parseFloat(slot.style.left)).toBeGreaterThanOrEqual(laid.labelBox.w);
  });

  it('reads "Add your side" when I am missing, and opens the splash to write', () => {
    const { container } = board([joint([{ authorId: ME, initials: 'YL' }])]);
    const slot = container.querySelector('[data-board-slot="jam"]')!;
    expect(slot.getAttribute('aria-label')).toBe('Add your side to Jam session');
    fireEvent.click(slot);
    expect(pushed).toEqual(['/pool/p-a/splash/jam?write=1']);
  });

  it('is gone once every current member has written, the faces staying', () => {
    const { container } = board([joint([])]);
    expect(container.querySelector('[data-board-slot]')).toBeNull();
    expect(container.querySelector('[data-board-piece="jam"] [data-board-faces]')).not.toBeNull();
  });
});
