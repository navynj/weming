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
  HEADER_PX,
  intersects,
  LABEL_MIN_PX,
  layoutMonthBoard,
  layoutWeekBoard,
  OFFSET_STEPS,
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
  fills?: boolean;
};
function tree(
  cards: Card[],
  {
    onPick = () => {},
    ring = null,
    dropped = null,
    month = '2026-10',
    onMonth = () => {},
    fills = false,
  }: Props,
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
        fills={fills}
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
 * The hard rules (review), on a whole layout: every piece at its lane's
 * line, its label from its offset to the lane's right line (or past it by
 * the offset, into an empty band), at least 32px tall; no two items'
 * boxes intersect; no sticker touches any words; under the header.
 */
function readable(layout: BoardLayout): void {
  const { column } = layout.metrics;
  const boxes: { id: string; box: Box }[] = [];
  const words: { id: string; box: Box }[] = [];
  const stickers: { id: string; box: Box }[] = [];
  for (const piece of layout.pieces) {
    const week = layout.weeks[piece.week];
    const cell = week.cells[piece.col];
    expect(cell.day).toBe(piece.day);
    expect(piece.x).toBe(cell.x);
    const label = piece.labelBox;
    expect(label.h).toBeGreaterThanOrEqual(LABEL_MIN_PX);
    expect(label.x + label.w).toBe(piece.overhang ? column + label.x : column);
    expect(piece.y).toBeGreaterThanOrEqual(week.y);
    expect(piece.y + piece.h).toBeLessThanOrEqual(week.y + week.h);
    for (const box of [piece.labelBox, piece.photoBox, piece.slotBox]) {
      if (box) boxes.push({ id: piece.id, box: onBoard(piece, box) });
    }
    words.push({ id: piece.id, box: onBoard(piece, piece.textBox) });
    if (piece.stickerBox) stickers.push({ id: piece.id, box: onBoard(piece, piece.stickerBox) });
  }
  for (const tape of layout.tapes) {
    boxes.push({ id: tape.key, box: tape });
    words.push({ id: tape.key, box: tape });
  }
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      if (boxes[a].id === boxes[b].id) continue;
      expect(intersects(boxes[a].box, boxes[b].box), `${boxes[a].id} × ${boxes[b].id}`).toBe(false);
    }
  }
  for (const sticker of stickers) {
    for (const text of words) {
      expect(intersects(sticker.box, text.box), `${sticker.id} sticker × ${text.id} words`).toBe(
        false,
      );
    }
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

describe('readable first: the hard rules (review)', () => {
  it('holds on a busy fortnight, week and month, at a phone’s width and a desktop’s', () => {
    for (const width of [358, 728, 980]) {
      for (const day of ['2026-10-01', '2026-10-06']) {
        readable(layoutWeekBoard(BUSY, day, { width, fills: true }));
      }
      readable(layoutMonthBoard(BUSY, '2026-10', { width, fills: true }));
    }
  });

  it('overhangs only into an empty band of the next lane, never over its items', () => {
    const layout = layoutWeekBoard(BUSY, '2026-10-06', { width: 728 });
    const overhung = layout.pieces.filter((p) => p.overhang);
    expect(overhung.length).toBeGreaterThan(0);
    for (const piece of overhung) {
      const label = onBoard(piece, piece.labelBox);
      const reach = {
        x: piece.x + layout.metrics.column,
        y: label.y,
        w: piece.labelBox.x,
        h: label.h,
      };
      for (const next of layout.pieces.filter((p) => p.col === piece.col + 1)) {
        expect(intersects(reach, { x: next.x, y: next.y, w: next.w, h: next.h })).toBe(false);
      }
    }
    // And where the next lane is busy at that height, a label keeps to its line.
    const kept = layout.pieces.filter(
      (p) => !p.overhang && p.labelBox.x > 0 && p.col < COLUMNS - 1,
    );
    expect(kept.length).toBeGreaterThan(0);
  });

  it('steps the start offset through 0, 12, 24 and 36%, never the same twice in a row within a day', () => {
    const layout = layoutMonthBoard(BUSY, '2026-10', { width: 728 });
    const byDay = new Map<string, number[]>();
    for (const p of layout.pieces) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p.step]);
    expect(new Set(layout.pieces.map((p) => p.step)).size).toBe(OFFSET_STEPS.length);
    for (const steps of byDay.values()) {
      for (let at = 1; at < steps.length; at += 1) expect(steps[at]).not.toBe(steps[at - 1]);
    }
  });

  it('stacks a day’s items in time order with no gap, directly under the header', () => {
    // A row with no bands: they would sit above the items, pushing them down.
    const days = BUSY.filter((c) => !c.splash.range || c.splash.range.start === c.splash.range.end);
    const layout = layoutWeekBoard(days, '2026-10-01', { width: 358 });
    const thu = layout.pieces.filter((p) => p.day === '2026-10-01');
    expect(thu.length).toBeGreaterThan(2);
    expect(thu[0].y).toBe(HEADER_PX);
    for (let at = 1; at < thu.length; at += 1)
      expect(thu[at].y).toBe(thu[at - 1].y + thu[at - 1].h);
  });

  it('hangs a sticker off the label’s top-left corner, half outside, its inner half in a padding of its own', () => {
    const layout = layoutWeekBoard(WEEK, TODAY, { width: 728 });
    const s = layout.metrics.sticker;
    expect(s).toBe(Math.round(layout.metrics.caption.line * 1.4));
    for (const piece of layout.pieces.filter((p) => p.variant === 'sticker')) {
      const sticker = piece.stickerBox!;
      expect(sticker.x + s / 2).toBe(piece.labelBox.x);
      expect(sticker.y + s / 2).toBe(piece.labelBox.y);
      expect(piece.textBox.x).toBeGreaterThanOrEqual(sticker.x + s);
      // Never across the lane's line into the day before.
      expect(sticker.x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('fills: what is shared (review)', () => {
  const MINE = {
    ...card('mine', 'Just mine', '2026-10-21'),
    splash: { ...card('mine', 'Just mine', '2026-10-21').splash, ownPoolId: 'p-a' },
  };
  const JOINTS = ['j1', 'j2', 'j3'].map((id) => ({
    ...card(id, `Joint ${id}`, '2026-10-21'),
    joint: true,
  }));

  it('never fills a splash that is not joint — Just mine, shared, photo captions — and always fills a joint one', () => {
    const layout = layoutWeekBoard([MINE, ...JOINTS, WEEK[2]], TODAY, { width: 728, fills: true });
    expect(layout.pieces.find((p) => p.id === 'mine')!.label).toBe('none');
    expect(layout.pieces.find((p) => p.id === 'soup')!.label).toBe('none');
    const joint = layout.pieces.filter((p) => p.card.joint);
    for (const p of joint) expect(['white', 'ink']).toContain(p.label);
    for (let at = 1; at < joint.length; at += 1)
      expect(joint[at].label).not.toBe(joint[at - 1].label);
    const { container } = board([MINE, ...JOINTS], { fills: true });
    expect(
      container.querySelector('[data-board-piece="mine"] [data-board-label]')!.className,
    ).not.toMatch(/bg-/);
    expect(
      container.querySelector('[data-board-piece="j1"] [data-board-label]')!.className,
    ).toMatch(/bg-(white|ink)/);
  });

  it('draws no fills at all on Home, or in a pool of one', () => {
    const layout = layoutWeekBoard([MINE, ...JOINTS], TODAY, { width: 728 });
    for (const p of layout.pieces) expect(p.label).toBe('none');
  });
});

describe('labels, photos and bands, drawn', () => {
  it('draws every label square and straight, its padding as laid out', () => {
    const { container } = board();
    for (const piece of container.querySelectorAll<HTMLElement>('[data-board-piece]')) {
      expect(piece.style.transform).toBe('');
      const label = piece.querySelector<HTMLElement>('[data-board-label]')!;
      expect(label.className).not.toMatch(/rounded/);
      expect(parseFloat(label.style.height)).toBeGreaterThanOrEqual(LABEL_MIN_PX);
      const text = piece.querySelector<HTMLElement>('[data-board-text]')!;
      const lines = Number(
        text.style.webkitLineClamp || text.style.getPropertyValue('-webkit-line-clamp'),
      );
      expect(lines).toBeGreaterThanOrEqual(1);
      expect(lines).toBeLessThanOrEqual(3);
      expect(parseFloat(text.style.maxHeight)).toBe(lines * 13);
    }
  });

  it('gives a photo card the lane from its offset, square, no frame, the caption directly under with a small icon', () => {
    const layout = layoutWeekBoard(WEEK, TODAY, { width: 728 });
    for (const piece of layout.pieces.filter((p) => p.variant === 'photo')) {
      expect(piece.photoBox!.x).toBe(piece.labelBox.x);
      expect(piece.photoBox!.w).toBe(layout.metrics.column - piece.labelBox.x);
      expect(piece.labelBox.y).toBe(piece.photoBox!.h);
      expect(piece.stickerBox).toBeNull();
      expect(piece.label).toBe('none');
    }
    const { container } = board();
    const one = container.querySelector<HTMLElement>(
      '[data-board-piece="soup"] [data-board-photo-card]',
    )!;
    expect(one.style.width).toBe(one.style.height);
    expect(one.className).not.toMatch(/rounded|bg-white|shadow/);
    expect(container.querySelector('[data-board-piece="soup"] [data-board-icon]')).not.toBeNull();
    expect(container.querySelector('[data-board-piece="soup"] [data-board-sticker]')).toBeNull();
    expect(
      container.querySelectorAll('[data-board-piece="four"] [data-board-photo-card]'),
    ).toHaveLength(3);
    expect(
      container.querySelector('[data-board-piece="four"] [data-board-more-photos]')!.textContent,
    ).toBe('+1');
  });

  it('runs a range band the full width of its lanes, translucent, outlined, square', () => {
    const { container } = board();
    const band = container.querySelector<HTMLElement>(
      '[data-board-tape="trip"] [data-board-band]',
    )!;
    expect(band.className).toContain('border-white/50');
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
    expect(pill.getAttribute('d')).toBe('M1 6 C4 6 5 2 8 2 S12 6 15 6 S19 2 23 2');
    for (const glyph of glyphs) {
      expect(glyph.querySelector('path')!.getAttribute('d')).toBe(pill.getAttribute('d'));
      // The reference: 32px on a desktop (26 on a phone), a 3px round pen, white at 80%.
      expect(glyph.getAttribute('width')).toBe('32');
      expect(glyph.getAttribute('viewBox')).toBe('0 0 24 8');
    }
    const path = glyphs[0].querySelector('path')!;
    expect(path.getAttribute('d')).toBe(WAVE_GLYPH_PATH);
    expect(path.getAttribute('stroke-width')).toBe('3');
    expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    expect(path.getAttribute('stroke-opacity')).toBe('0.8');
    expect(header.querySelector('[data-board-waves]')!.className).toContain('gap-[5px]');
    cleanup();
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 358,
    });
    try {
      const phone = board().container.querySelector(
        '[data-board-header="2026-10-20"] [data-wave-glyph]',
      )!;
      expect(phone.getAttribute('width')).toBe('26');
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
    expect(path.getAttribute('fill')).toBe('none');
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

  it('carries an empty slot under its label, with the faded faces of who has not written', () => {
    const { container } = board([joint([{ authorId: 'u-jo', initials: 'JO' }])]);
    const slot = container.querySelector<HTMLElement>('[data-board-slot="jam"]')!;
    expect(slot.className).toContain('border-dashed');
    expect(slot.textContent).toBe('JO');
    expect(slot.querySelector('.opacity-50')).not.toBeNull();
    expect(slot.tagName).toBe('SPAN');
    const laid = layoutWeekBoard([joint([{ authorId: 'u-jo', initials: 'JO' }])], TODAY, {
      width: 980,
    }).pieces[0];
    // Under its label, in its own lane: never over the next lane's words.
    // Its own lane from the label's start, even when the label overhangs the next.
    expect(laid.slotBox).toEqual({
      x: laid.labelBox.x,
      y: laid.labelBox.y + laid.labelBox.h,
      w: 980 / 7 - laid.labelBox.x,
      h: 22,
    });
    expect(parseFloat(slot.style.top)).toBe(laid.labelBox.y + laid.labelBox.h);
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
