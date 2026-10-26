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
import { WaveMark, WAVE_GLYPH_PATH } from '@/components/ui/waves';
import {
  COLUMNS,
  C_TUCK_PX,
  extentOf,
  HEADER_PX,
  intersects,
  layoutMonthBoard,
  layoutWeekBoard,
  onBoard,
  weekTitle,
  type BoardLayout,
  type Box,
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
 * The hard checks (review), on a whole layout: every label hugs its words;
 * no words are touched by anything else — another label, a photo, a
 * sticker, a band; labels never meet; the only overlaps are B's sticker
 * and C's tuck, and those land on padding or water; every piece in its
 * lane, under the header, within its row.
 */
function readable(layout: BoardLayout): void {
  const { column, caption } = layout.metrics;
  for (const piece of layout.pieces) {
    const week = layout.weeks[piece.week];
    const cell = week.cells[piece.col];
    expect(cell.day).toBe(piece.day);
    expect(piece.x).toBe(cell.x);
    const label = piece.labelBox;
    expect(label.h).toBe(piece.pad.top + piece.captionLines * caption.line + piece.pad.bottom);
    if (piece.recipe === 'A') {
      expect(label.x + label.w).toBe(piece.overhang ? column + label.x : column);
    }
    if (piece.recipe === 'B') expect(label.x + label.w).toBe(column);
    if (piece.recipe === 'C') expect(label.x + label.w).toBeLessThanOrEqual(column);
    expect(piece.y + piece.h).toBeLessThanOrEqual(week.y + week.h);
  }
  const elements: { id: string; kind: string; box: Box }[] = [];
  for (const piece of layout.pieces) {
    elements.push({ id: piece.id, kind: 'label', box: onBoard(piece, piece.labelBox) });
    if (piece.photoBox)
      elements.push({ id: piece.id, kind: 'photo', box: onBoard(piece, piece.photoBox) });
    if (piece.stickerBox)
      elements.push({ id: piece.id, kind: 'sticker', box: onBoard(piece, piece.stickerBox) });
  }
  for (const tape of layout.tapes) elements.push({ id: tape.key, kind: 'band', box: tape });
  for (const piece of layout.pieces) {
    const words = onBoard(piece, piece.textBox);
    for (const el of elements) {
      // A label holds its own words, and its own sticker sits beside them.
      if (el.id === piece.id && el.kind === 'label') continue;
      expect(intersects(words, el.box), `${piece.id} words × ${el.id} ${el.kind}`).toBe(false);
    }
  }
  const labels = elements.filter((e) => e.kind === 'label');
  for (let a = 0; a < labels.length; a += 1) {
    for (let b = a + 1; b < labels.length; b += 1) {
      expect(intersects(labels[a].box, labels[b].box), `${labels[a].id} × ${labels[b].id}`).toBe(
        false,
      );
    }
  }
  for (const piece of layout.pieces.filter((p) => p.tuck > 0)) {
    expect(piece.tuck).toBe(C_TUCK_PX);
    expect(C_TUCK_PX).toBeLessThan(layout.metrics.pad.bottom);
  }
  if (layout.pieces.some((p) => p.stickerBox)) {
    expect(layout.metrics.sticker / 2).toBeLessThanOrEqual(layout.metrics.pad.bottom);
    expect(layout.metrics.sticker / 2).toBeLessThanOrEqual(layout.metrics.pad.right);
  }
}

/** A busy fortnight: several posts a day, long and short titles, photos, joint ones, ranges. */
const BUSY: Card[] = [
  ...Array.from({ length: 30 }, (_, at) => {
    const day = `2026-10-${String(1 + (at % 10)).padStart(2, '0')}`;
    const title = [
      'Hoppers',
      'Lynn Canyon - Twin Falls Trail',
      'coffee went cold while I read the whole thing',
      'call from mom, halfway through',
      'x',
    ][at % 5];
    const c = card(`b${String(at).padStart(2, '0')}`, title, day, { photos: at % 7 === 3 ? 2 : 0 });
    return at % 4 === 1 ? { ...c, joint: true } : c;
  }),
  card('span1', 'A long weekend', '2026-10-02', {
    over: { declared_start: '2026-10-02', declared_end: '2026-10-06' },
  }),
  card('span2', 'Conference', '2026-10-05', {
    over: { declared_start: '2026-10-05', declared_end: '2026-10-08' },
  }),
];

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
    readable(layout);
    readable(layoutWeekBoard(WEEK, TODAY, { width: 728 }));
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
    readable(layout);
    readable(layoutMonthBoard(OCTOBER, '2026-10', { width: 358 }));
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

describe('three recipes, always readable (review)', () => {
  it('holds the hard checks on a busy fortnight, week and month, at a phone’s width and a desktop’s', () => {
    for (const width of [358, 728, 980]) {
      for (const day of ['2026-10-01', '2026-10-06'])
        readable(layoutWeekBoard(BUSY, day, { width }));
      readable(layoutMonthBoard(BUSY, '2026-10', { width }));
    }
  });

  it('draws photos as C, the rest A or B, never the same twice in a row; a day of two or more has a B', () => {
    const layout = layoutMonthBoard(BUSY, '2026-10', { width: 728 });
    const byDay = new Map<string, typeof layout.pieces>();
    for (const p of layout.pieces) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
    expect(new Set(layout.pieces.map((p) => p.recipe))).toEqual(new Set(['A', 'B', 'C']));
    for (const pieces of byDay.values()) {
      for (const p of pieces) expect(p.recipe === 'C').toBe((p.card.photos?.length ?? 0) > 0);
      for (let at = 1; at < pieces.length; at += 1) {
        if (pieces[at].recipe !== 'C') expect(pieces[at].recipe).not.toBe(pieces[at - 1].recipe);
      }
      if (pieces.length >= 2 && pieces.some((p) => p.recipe !== 'C')) {
        expect(pieces.some((p) => p.recipe === 'B')).toBe(true);
      }
    }
  });

  it('overhangs an A label only into an empty band of the next lane, else starts at 15% and ends at the line', () => {
    const layout = layoutWeekBoard(BUSY, '2026-10-06', { width: 728 });
    const column = layout.metrics.column;
    const as = layout.pieces.filter((p) => p.recipe === 'A');
    expect(as.some((p) => p.overhang)).toBe(true);
    for (const piece of as) {
      const label = onBoard(piece, piece.labelBox);
      if (piece.overhang) {
        expect(piece.labelBox.x).toBeGreaterThanOrEqual(Math.round(column * 0.35));
        expect(piece.labelBox.x).toBeLessThanOrEqual(Math.round(column * 0.45));
        const reach = { x: piece.x + column, y: label.y, w: piece.labelBox.x, h: label.h };
        for (const next of layout.pieces.filter((p) => p.col === piece.col + 1)) {
          for (const box of extentOf(next)) expect(intersects(reach, box)).toBe(false);
        }
      } else {
        expect(piece.labelBox.x).toBe(Math.round(column * 0.15));
      }
    }
  });

  it('centres B’s sticker on the label’s top-left corner, the words past its inner half', () => {
    const layout = layoutMonthBoard(BUSY, '2026-10', { width: 728 });
    const s = layout.metrics.sticker;
    for (const piece of layout.pieces.filter((p) => p.recipe === 'B')) {
      const sticker = piece.stickerBox!;
      expect(sticker.x + s / 2).toBe(piece.labelBox.x);
      expect(sticker.y + s / 2).toBe(piece.labelBox.y);
      expect(piece.textBox.x).toBeGreaterThanOrEqual(sticker.x + s);
      expect(piece.x + sticker.x).toBeGreaterThanOrEqual(0);
    }
  });

  it('sizes C’s card at 55–70% of the lane, left or right, tucked 10px into the padding above, caption centred', () => {
    const layout = layoutMonthBoard(BUSY, '2026-10', { width: 728 });
    const column = layout.metrics.column;
    const cs = layout.pieces.filter((p) => p.recipe === 'C');
    expect(cs.length).toBeGreaterThan(0);
    for (const piece of cs) {
      expect(piece.photoBox!.w).toBeGreaterThanOrEqual(Math.round(column * 0.55));
      expect(piece.photoBox!.w).toBeLessThanOrEqual(Math.round(column * 0.7));
      expect([0, Math.floor(column - piece.photoBox!.w)]).toContain(piece.photoBox!.x);
      expect(piece.labelBox.x).toBe(piece.photoBox!.x);
      expect(piece.labelBox.y).toBe(piece.photoBox!.h);
      expect(piece.center).toBe(true);
      expect(piece.inlineIcon).toBe(true);
      const above = layout.pieces.find(
        (p) =>
          p.col === piece.col &&
          p.week === piece.week &&
          p.y + p.h === piece.y + piece.tuck &&
          p !== piece,
      );
      expect(piece.tuck).toBe(above ? C_TUCK_PX : 0);
    }
  });

  it('stacks a day’s items in time order with no gap, but for C’s tuck, directly under the header', () => {
    const days = BUSY.filter((c) => !c.splash.range || c.splash.range.start === c.splash.range.end);
    const layout = layoutWeekBoard(days, '2026-10-01', { width: 358 });
    const thu = layout.pieces.filter((p) => p.day === '2026-10-01');
    expect(thu.length).toBeGreaterThan(2);
    expect(thu[0].y).toBe(HEADER_PX);
    for (let at = 1; at < thu.length; at += 1) {
      expect(thu[at].y).toBe(thu[at - 1].y + thu[at - 1].h - thu[at].tuck);
    }
  });
});

describe('fills: what is the pool’s own (review)', () => {
  const MINE = {
    ...card('mine', 'Just mine', '2026-10-21'),
    splash: { ...card('mine', 'Just mine', '2026-10-21').splash, ownPoolId: 'p-a' },
  };
  const JOINTS = ['j1', 'j2', 'j3'].map((id) => ({
    ...card(id, `Joint ${id}`, '2026-10-21'),
    joint: true,
  }));

  it('never fills a splash that is not joint — Just mine, shared, photo captions — and always fills a joint one', () => {
    const layout = layoutWeekBoard([MINE, ...JOINTS, WEEK[2]], TODAY, { width: 728 });
    expect(layout.pieces.find((p) => p.id === 'mine')!.label).toBe('none');
    expect(layout.pieces.find((p) => p.id === 'soup')!.label).toBe('none');
    const joint = layout.pieces.filter((p) => p.card.joint);
    for (const p of joint) expect(['white', 'ink']).toContain(p.label);
    for (let at = 1; at < joint.length; at += 1)
      expect(joint[at].label).not.toBe(joint[at - 1].label);
    const { container } = board([MINE, ...JOINTS]);
    expect(
      container.querySelector('[data-board-piece="mine"] [data-board-label]')!.className,
    ).not.toMatch(/bg-/);
    expect(
      container.querySelector('[data-board-piece="j1"] [data-board-label]')!.className,
    ).toMatch(/bg-(white|ink)/);
  });

  it('fills a joint splash with a single ripple, and one waiting on a member, wherever it is drawn (Home included)', () => {
    // The pool's own, one ripple by someone else, me not yet written: Add your side.
    const lone: Card = {
      ...card('test', 'Test', '2026-10-19'),
      joint: true,
      href: '/pool/p-a/splash/test',
      writers: [{ authorId: 'u-mk', initials: 'MK' }],
      awaiting: [{ authorId: ME, initials: 'YL' }],
    };
    expect(lone.splash.count).toBe(1);
    const { container } = board([lone]);
    const piece = container.querySelector('[data-board-piece="test"]')!;
    expect(['white', 'ink']).toContain(piece.getAttribute('data-label'));
    expect(piece.querySelector('[data-board-label]')!.className).toMatch(/bg-(white|ink)/);
    expect(piece.querySelector('[data-board-slot]')).not.toBeNull();
  });
});

describe('labels, photos and bands, drawn', () => {
  it('draws every label square and straight, its padding as laid out', () => {
    const { container } = board();
    for (const piece of container.querySelectorAll<HTMLElement>('[data-board-piece]')) {
      expect(piece.style.transform).toBe('');
      const label = piece.querySelector<HTMLElement>('[data-board-label]')!;
      expect(label.className).not.toMatch(/rounded/);
      expect(parseFloat(label.style.height)).toBeGreaterThan(0);
      const text = piece.querySelector<HTMLElement>('[data-board-text]')!;
      const lines = Number(
        text.style.webkitLineClamp || text.style.getPropertyValue('-webkit-line-clamp'),
      );
      expect(lines).toBeGreaterThanOrEqual(1);
      expect(lines).toBeLessThanOrEqual(3);
      expect(parseFloat(text.style.maxHeight)).toBe(lines * 13);
    }
  });

  it('draws a photo card square, no frame, the caption under it with a small icon and no sticker', () => {
    const { container } = board();
    const one = container.querySelector<HTMLElement>(
      '[data-board-piece="soup"] [data-board-photo-card]',
    )!;
    expect(one.style.width).toBe(one.style.height);
    expect(one.className).not.toMatch(/rounded|bg-white|shadow/);
    expect(container.querySelector('[data-board-piece="soup"]')!.getAttribute('data-recipe')).toBe(
      'C',
    );
    expect(container.querySelector('[data-board-piece="soup"] [data-board-icon]')).not.toBeNull();
    expect(container.querySelector('[data-board-piece="soup"] [data-board-sticker]')).toBeNull();
    expect(
      container.querySelector('[data-board-piece="soup"] [data-board-text]')!.className,
    ).toContain('text-center');
    expect(
      container.querySelectorAll('[data-board-piece="four"] [data-board-photo-card]'),
    ).toHaveLength(3);
    expect(
      container.querySelector('[data-board-piece="four"] [data-board-more-photos]')!.textContent,
    ).toBe('+1');
  });

  it('runs a range band the full width of its lanes, translucent, no outline, square', () => {
    const { container } = board();
    const band = container.querySelector<HTMLElement>(
      '[data-board-tape="trip"] [data-board-band]',
    )!;
    expect(band.className).not.toMatch(/border/);
    expect(band.className).toContain('bg-white/20');
    expect(band.className).not.toMatch(/rounded/);
    const laid = layoutWeekBoard(WEEK, TODAY, { width: 728 }).tapes[0];
    expect(laid.x).toBe(2 * (728 / 7));
    expect(laid.w).toBe(5 * (728 / 7));
  });

  it('draws the day’s waves with the pill’s own glyph — the given path — at the reference’s size, one per record, three at most', () => {
    const { container } = board();
    const header = container.querySelector('[data-board-header="2026-10-20"]')!;
    const glyphs = header.querySelectorAll('[data-wave-glyph]');
    expect(glyphs).toHaveLength(3);
    const pill = render(<WaveMark count={1} />).container.querySelector('[data-wave-glyph] path')!;
    expect(pill.getAttribute('d')).toBe(
      'M0.75 1.79321C2.02503 3.18416 3.30007 3.18416 4.5751 1.79321C5.85014 0.402263 7.12517 0.402263 8.40021 1.79321C9.67524 3.18416 10.9503 3.18416 12.2253 1.79321C13.5003 0.402263 14.7754 0.402263 16.0504 1.79321',
    );
    for (const glyph of glyphs) {
      expect(glyph.querySelector('path')!.getAttribute('d')).toBe(pill.getAttribute('d'));
      // 26px on a desktop (22 on a phone), the export's box, a finer pen, white at 80%.
      expect(glyph.getAttribute('width')).toBe('26');
      expect(glyph.getAttribute('viewBox')).toBe('0 0 17 4');
    }
    const path = glyphs[0].querySelector('path')!;
    expect(path.getAttribute('d')).toBe(WAVE_GLYPH_PATH);
    expect(path.getAttribute('stroke-width')).toBe('1.2');
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    expect(path.getAttribute('stroke-opacity')).toBe('0.8');
    // Stacked with no gap (review).
    expect(header.querySelector('[data-board-waves]')!.className).not.toMatch(/gap-/);
    cleanup();
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 358,
    });
    try {
      const phone = board().container.querySelector(
        '[data-board-header="2026-10-20"] [data-wave-glyph]',
      )!;
      expect(phone.getAttribute('width')).toBe('22');
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
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

  it('carries an empty slot inline after its words, with the faded faces of who has not written', () => {
    const { container } = board([joint([{ authorId: 'u-jo', initials: 'JO' }])]);
    const slot = container.querySelector<HTMLElement>('[data-board-slot="jam"]')!;
    expect(slot.className).toContain('border-dashed');
    expect(slot.textContent).toBe('JO');
    expect(slot.querySelector('.opacity-50')).not.toBeNull();
    expect(slot.tagName).toBe('SPAN');
    // Inline after the words, in the same line box: it wraps under only when the line is full.
    expect(slot.closest('[data-board-text]')).not.toBeNull();
    expect(slot.className).toContain('inline-flex');
    expect(slot.className).toContain('h-[13px]');
    const laid = layoutWeekBoard([joint([{ authorId: 'u-jo', initials: 'JO' }])], TODAY, {
      width: 980,
    }).pieces[0];
    expect(laid.slot).toBe(true);
    // Its room is counted: the label is sized for the words and the slot together.
    const closed = layoutWeekBoard([joint([])], TODAY, { width: 980 }).pieces[0];
    expect(laid.captionLines).toBeGreaterThanOrEqual(closed.captionLines);
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
