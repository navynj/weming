// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
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
  halfOf,
  HEADER_PX,
  intersects,
  layoutMonthBoard,
  measureKey,
  layoutWeekBoard,
  layoutLaneBoard,
  laneCell,
  onBoard,
  rangeTitle,
  stepHalf,
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

function block(id: string, day: string): SplashBlock {
  return {
    id,
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
      // A post owns its date and lane (H24); its block takes them.
      declared_start: day,
      declared_end: null,
      declared_lane_id: 'c-food',
      session_id: null,
      icon: null,
      pinned_at: null,
      pool_id: null,
      pool_lane_id: null,
      own_pool_id: null,
      joint_invite_all: false,
      description: null,
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
    // A label ends at its lane's line, or past it into empty lanes (A's shift, a phone's span).
    const end = label.x + label.w;
    if (piece.span > 0) expect(end).toBeCloseTo(column * (1 + piece.span), 5);
    else if (piece.recipe === 'A' && piece.overhang) expect(end).toBe(column + label.x);
    else if (piece.recipe === 'C') expect(end).toBeLessThanOrEqual(column + 0.01);
    else expect(end).toBeCloseTo(column, 5);
    // No fill, no box: 4px above and below; a filled one 6 and 6 (a sticker hanging low may deepen it).
    const v = piece.label === 'none' ? { top: 4, bottom: 4 } : { top: 6, bottom: 6 };
    expect(piece.pad.top).toBe(v.top);
    expect(piece.pad.bottom).toBeGreaterThanOrEqual(v.bottom);
    expect(piece.y + piece.h).toBeLessThanOrEqual(week.y + week.h);
  }
  const elements: { id: string; kind: string; box: Box }[] = [];
  for (const piece of layout.pieces) {
    elements.push({ id: piece.id, kind: 'label', box: onBoard(piece, piece.labelBox) });
    if (piece.photoBox)
      elements.push({ id: piece.id, kind: 'photo', box: onBoard(piece, piece.photoBox) });
    if (piece.stickerBox)
      elements.push({ id: piece.id, kind: 'sticker', box: onBoard(piece, piece.stickerBox) });
    if (piece.slotBounds)
      elements.push({ id: piece.id, kind: 'slot', box: onBoard(piece, piece.slotBounds) });
  }
  for (const tape of layout.tapes) elements.push({ id: tape.key, kind: 'band', box: tape });
  for (const piece of layout.pieces) {
    for (const words of piece.textBoxes.map((b) => onBoard(piece, b))) {
      for (const el of elements) {
        // A label holds its own words; its own sticker and slot sit beside them, never on them.
        if (el.id === piece.id && el.kind === 'label') continue;
        expect(intersects(words, el.box), `${piece.id} words × ${el.id} ${el.kind}`).toBe(false);
      }
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
    expect(piece.tuck).toBeLessThanOrEqual(C_TUCK_PX);
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
    return at % 4 === 1 ? { ...c, joint: true, together: true } : c;
  }),
  card('span1', 'A long weekend', '2026-10-02', {
    over: { declared_start: '2026-10-02', declared_end: '2026-10-06' },
  }),
  card('span2', 'Conference', '2026-10-05', {
    over: { declared_start: '2026-10-05', declared_end: '2026-10-08' },
  }),
];

describe('the board shows no reactions or replies (review)', () => {
  it('renders no reaction or reply elements on any item, whatever readers left', () => {
    // Each post with a ripple, and on it a reaction and a reply someone else left.
    const answered = OCTOBER.map((post) => ({
      ...post,
      ripples: [{ id: `${post.splash.id}-r`, note: 'words', createdAt: '2026-10-20T01:00:00Z' }],
    })).map((c) => ({
      ...c,
      responded: {
        value: {
          reactions: c.ripples.map((r) => ({
            ripple_id: r.id,
            user_id: 'u-mina',
            emoji: '❤️',
            created_at: '2026-10-21T01:00:00Z',
          })),
          replies: c.ripples.map((r) => ({
            id: `reply-${r.id}`,
            ripple_id: r.id,
            author_id: 'u-mina',
            body: 'so good',
            created_at: '2026-10-21T02:00:00Z',
            edited_at: null,
            hidden: false,
            former: false,
          })),
        },
        locked: [],
      },
      respondedAt: Object.fromEntries(c.ripples.map((r) => [r.id, '2026-10-21T02:00:00Z'])),
    }));
    expect(answered.every((c) => c.responded.value.reactions.length === 1)).toBe(true);
    const { container } = board(answered);
    expect(container.querySelectorAll('[data-board-label]').length).toBeGreaterThan(0);
    for (const selector of [
      '[data-reactions]',
      '[data-reaction]',
      '[data-card-responses]',
      '[data-card-replies]',
      '[data-replies]',
      '[data-board-responses]',
      '[data-board-badge]',
      '[data-board-reply]',
    ]) {
      expect(container.querySelector(selector)).toBeNull();
    }
    expect(container.textContent).not.toContain('so good');
  });
});

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
    // A tablet's board keeps all seven days (review).
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 728,
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
      // Nothing pushed past an edge: no room added, so nothing to scroll sideways (0044).
      expect(container.querySelector<HTMLElement>('[data-board-bleed]')!.style.width).toBe(
        'calc(100% + 0px)',
      );
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

describe('half weeks on a phone (review)', () => {
  // A 390px phone, less its 16px gutters.
  const PHONE = 358;
  const atWidth = (px: number): (() => void) => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => px,
    });
    return () => delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  };
  const shown = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('[data-board-header]')].map((h) =>
      h.getAttribute('data-board-header')!,
    );

  it('steps Sun–Wed → Wed–Sat → next Sun–Wed and back, Wednesday in both halves', () => {
    expect(halfOf('2026-10-25')).toBe('2026-10-25');
    expect(halfOf('2026-10-28')).toBe('2026-10-25');
    expect(halfOf('2026-10-29')).toBe('2026-10-28');
    expect(halfOf('2026-10-31')).toBe('2026-10-28');
    expect(stepHalf('2026-10-25', 1)).toBe('2026-10-28');
    expect(stepHalf('2026-10-28', 1)).toBe('2026-11-01');
    expect(stepHalf('2026-11-01', -1)).toBe('2026-10-28');
    expect(stepHalf('2026-10-28', -1)).toBe('2026-10-25');
    expect(rangeTitle('2026-10-25', '2026-10-28')).toBe('Oct 25 – 28');
    expect(rangeTitle('2026-09-30', '2026-10-03')).toBe('Sep 30 – Oct 3');
  });

  it('lays out four columns a quarter of the board wide, a range clipped to the half', () => {
    const layout = layoutWeekBoard(WEEK, '2026-10-21', { width: PHONE, half: true });
    expect(layout.metrics.columns).toBe(4);
    expect(layout.metrics.column).toBe(PHONE / 4);
    expect(layout.headers.map((h) => `${h.weekday} ${h.number}`)).toEqual([
      'WED 21',
      'THU 22',
      'FRI 23',
      'SAT 24',
    ]);
    expect(layout.title).toBe('Oct 21 – 24');
    expect(layout.pieces.map((p) => p.id)).toEqual(['two', 'four']);
    expect(layout.tapes.map((t) => [t.id, t.startCol, t.endCol, t.startsHere])).toEqual([
      ['trip', 0, 3, false],
    ]);
    readable(layout);
  });

  it('renders four columns at 390px, opening on the half that holds today', () => {
    const restore = atWidth(PHONE);
    try {
      const { container } = board();
      expect(shown(container)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
      expect(container.querySelector('[data-board-title]')!.textContent).toBe('Oct 21 – 24');
      expect(container.querySelectorAll('[data-board-rule]')).toHaveLength(3);
      expect(container.querySelector('[data-board-next]')!.getAttribute('aria-label')).toBe(
        'Next half week',
      );
    } finally {
      restore();
    }
  });

  it('steps half a week on the arrows and on a sideways swipe, Wednesday shared', () => {
    const restore = atWidth(PHONE);
    try {
      const { container } = board();
      const title = () => container.querySelector('[data-board-title]')!.textContent;
      fireEvent.click(container.querySelector('[data-board-next]')!);
      expect(shown(container)[0]).toBe('2026-10-25');
      expect(title()).toBe('Oct 25 – 28');
      fireEvent.click(container.querySelector('[data-board-next]')!);
      expect(shown(container)[0]).toBe('2026-10-28');
      expect(title()).toBe('Oct 28 – 31');
      const scroller = container.querySelector('[data-board-scroller]')!;
      const swipe = (from: [number, number], to: [number, number]): void => {
        fireEvent.touchStart(scroller, { touches: [{ clientX: from[0], clientY: from[1] }] });
        fireEvent.touchMove(scroller, { touches: [{ clientX: to[0], clientY: to[1] }] });
        fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
      };
      // Back a half: Sun 25 – Wed 28, Wednesday the day both share.
      swipe([100, 300], [220, 290]);
      expect(shown(container)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']);
      swipe([220, 300], [100, 310]);
      expect(shown(container)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
      // A vertical drag turns nothing.
      swipe([200, 300], [120, 420]);
      expect(shown(container)[0]).toBe('2026-10-28');
    } finally {
      restore();
    }
  });

  it('keeps all seven days from 600px', () => {
    const restore = atWidth(600);
    try {
      expect(shown(board().container)).toHaveLength(7);
    } finally {
      restore();
    }
  });

  it('draws Month compact at 390px: stickers and thumbnails, no labels, no faces', () => {
    window.localStorage.setItem('weming.board-span', 'month');
    const restore = atWidth(PHONE);
    try {
      const { container } = board();
      expect(container.querySelectorAll('[data-board-header]')).toHaveLength(7);
      expect(container.querySelector('[data-board-label]')).toBeNull();
      expect(container.querySelector('[data-board-text]')).toBeNull();
      expect(container.querySelector('[data-board-faces]')).toBeNull();
      expect(container.querySelector('[data-board-slot]')).toBeNull();
      expect(
        container.querySelector('[data-board-piece="hoppers"] [data-board-sticker]'),
      ).not.toBeNull();
      expect(
        container.querySelectorAll('[data-board-piece="four"] [data-board-photo-card]'),
      ).toHaveLength(1);
      // A band keeps its icon, not its words.
      expect(container.querySelector('[data-board-tape="trip"]')!.textContent).not.toContain(
        'Island trip',
      );
      // A day opens Week on the half holding it.
      fireEvent.click(container.querySelector('[data-board-day="2026-10-29"]')!);
      expect(shown(container)[0]).toBe('2026-10-28');
    } finally {
      restore();
    }
  });

  it('keeps a hand-set wave on a compact piece', () => {
    const waved = WEEK.map((c) =>
      c.splash.id === 'hoppers' ? { ...c, layout: { wave: { on: true } } } : c,
    );
    const layout = layoutMonthBoard(waved, '2026-10', { width: PHONE, compact: true });
    for (const piece of layout.pieces) {
      expect(piece.compact).toBe(true);
      expect(piece.captionLines).toBe(0);
      expect(piece.x + piece.w).toBeLessThanOrEqual(piece.x + layout.metrics.column);
    }
    window.localStorage.setItem('weming.board-span', 'month');
    const restore = atWidth(PHONE);
    try {
      const { container } = board(waved);
      expect(
        container.querySelector('[data-board-piece="hoppers"] [data-board-wave]'),
      ).not.toBeNull();
    } finally {
      restore();
    }
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
    // A week with no records and no band across it.
    const quiet = layout.weeks.find((w) => w.cells.some((c) => c.day === '2026-10-07'))!;
    expect(busy.h).toBeGreaterThan(layout.metrics.rowBase);
    expect(quiet.h).toBe(layout.metrics.rowBase);
  });

  it('is chosen by the switch, remembered per device, transparent by the row, and a day opens its week', () => {
    const { container } = board();
    fireEvent.click(container.querySelector('[data-board-span-option="month"]')!);
    expect(container.querySelector('[data-month-board]')!.getAttribute('data-month-board')).toBe(
      '2026-10',
    );
    expect(window.localStorage.getItem('weming.board-span')).toBe('month');
    expect(container.querySelector('[data-board-span-option="month"]')!.className).toContain(
      'bg-white',
    );
    // No depth by row: every row transparent over the ground (review).
    for (const row of container.querySelectorAll<HTMLElement>('[data-board-week-row]')) {
      expect(row.style.background).toBe('');
    }
    expect(container.querySelector('[data-board-scroller]')!.className).not.toContain(
      'water-ground',
    );
    const outside = container.querySelector('[data-board-cell="2026-09-27"]')!;
    expect(outside.hasAttribute('data-in-month')).toBe(false);
    expect(outside.querySelector('[data-board-day]')!.className).toContain('text-white/40');
    // No waves under a month's numbers (review).
    expect(container.querySelector('[data-board-day] [data-board-waves]')).toBeNull();
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

  it('hangs B’s sticker on a filled label’s top-left corner, or left of a bare label’s first line, never on words', () => {
    const layout = layoutMonthBoard(BUSY, '2026-10', { width: 728 });
    const bs = layout.pieces.filter((p) => p.recipe === 'B');
    expect(bs.some((p) => p.stickerAt === 'left')).toBe(true);
    for (const piece of bs) {
      const s = layout.metrics.stickers[piece.stickerSize!];
      const sticker = piece.stickerBox!;
      expect(sticker.w).toBe(s);
      expect(sticker.x + s / 2).toBe(piece.labelBox.x);
      if (piece.stickerAt === 'corner') {
        expect(piece.label).not.toBe('none');
        expect(sticker.y + s / 2).toBe(piece.labelBox.y);
        // Room on the first line only: the words beyond it start at the padding.
        expect(piece.indent).toBeGreaterThan(0);
      } else {
        expect(sticker.y + s / 2).toBe(
          piece.labelBox.y + piece.pad.top + layout.metrics.caption.line / 2,
        );
        expect(piece.textBoxes[0].x).toBeGreaterThanOrEqual(sticker.x + s);
      }
      // The sticker stays on the board, and over the lane before by at most its right padding.
      expect(piece.x + sticker.x).toBeGreaterThanOrEqual(
        piece.col === 0 ? 0 : piece.x - layout.metrics.pad.right,
      );
    }
  });

  it('sizes B’s stickers 1.6, 2.2 or 3 lines, never the same twice in a row in a day, big once at most', () => {
    const layout = layoutMonthBoard(BUSY, '2026-10', { width: 728 });
    expect(layout.metrics.stickers).toEqual({ small: 21, medium: 29, big: 39 });
    const byDay = new Map<string, typeof layout.pieces>();
    for (const p of layout.pieces) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
    for (const pieces of byDay.values()) {
      const sizes = pieces.filter((p) => p.recipe === 'B').map((p) => p.stickerSize);
      for (let at = 1; at < sizes.length; at += 1) expect(sizes[at]).not.toBe(sizes[at - 1]);
      expect(sizes.filter((s) => s === 'big').length).toBeLessThanOrEqual(
        pieces.length >= 2 ? 1 : 0,
      );
    }
    expect(new Set(layout.pieces.map((p) => p.stickerSize).filter(Boolean)).size).toBeGreaterThan(
      1,
    );
  });

  it('gives a bare label 4px above and below, a filled one 6 and 6 with 8 at each side', () => {
    const layout = layoutWeekBoard(WEEK, TODAY, { width: 728 });
    const bare = layout.pieces.find((p) => p.label === 'none' && p.recipe === 'A');
    if (bare) expect([bare.pad.top, bare.pad.bottom]).toEqual([4, 4]);
    const joint = layoutWeekBoard([{ ...WEEK[0], joint: true, together: true }], TODAY, {
      width: 728,
    }).pieces[0];
    expect(joint.pad.top).toBe(6);
    expect(joint.pad.bottom).toBeGreaterThanOrEqual(6);
    expect([joint.pad.left, joint.pad.right]).toEqual([8, 8]);
  });

  it('on a phone, reaches left from the last lane into empty lanes, never over a lane with anything in it', () => {
    // Saturday alone: no lane to its right, Thursday and Friday empty.
    const last = layoutWeekBoard([card('sat', 'dinner with mina', '2026-10-24')], TODAY, {
      width: 358,
    });
    const piece = last.pieces[0];
    expect(piece.col).toBe(6);
    expect(piece.span).toBe(0);
    // Two lanes back, less a sticker's inset when it has one.
    const back = -piece.labelBox.x / last.metrics.column;
    expect(back).toBeGreaterThan(1.5);
    expect(back).toBeLessThanOrEqual(2);
    // It still ends on its own lane's line.
    expect(piece.labelBox.x + piece.labelBox.w).toBeCloseTo(last.metrics.column, 5);
    readable(last);
    // Friday taken: it stays in its own lane.
    const beside = layoutWeekBoard(
      [card('sat', 'dinner with mina', '2026-10-24'), card('fri', 'Hoppers', '2026-10-23')],
      TODAY,
      { width: 358 },
    );
    expect(beside.pieces.find((p) => p.id === 'sat')!.labelBox.x).toBeGreaterThanOrEqual(0);
    readable(beside);
    // On a desktop, lanes are wide enough: no reach either way.
    const wide = layoutWeekBoard([card('sat', 'dinner with mina', '2026-10-24')], TODAY, {
      width: 980,
    });
    expect(wide.pieces[0].labelBox.x).toBeGreaterThanOrEqual(0);
  });

  it('on a phone, reaches a label across empty lanes beside it, up to two, so short words read whole', () => {
    // Sunday alone, Monday and Tuesday empty.
    const lone = layoutWeekBoard(
      [card('alone', 'Lynn Canyon - Twin Falls Trail', '2026-10-18')],
      TODAY,
      {
        width: 358,
      },
    );
    const piece = lone.pieces[0];
    expect(piece.span).toBe(2);
    expect(piece.labelBox.x + piece.labelBox.w).toBeGreaterThan(lone.metrics.column);
    readable(lone);
    // Beside a busy lane it stops at its own line.
    const crowded = layoutWeekBoard(
      [
        card('left', 'Lynn Canyon - Twin Falls Trail', '2026-10-18'),
        card('right', 'Hoppers', '2026-10-19'),
      ],
      TODAY,
      { width: 358 },
    );
    expect(crowded.pieces.find((p) => p.id === 'left')!.span).toBe(0);
    // An A label starts at its line on a phone.
    for (const p of layoutWeekBoard(BUSY, '2026-10-01', { width: 358 }).pieces.filter(
      (p) => p.recipe === 'A',
    )) {
      expect(p.labelBox.x).toBe(0);
    }
  });

  it('hugs a title exactly as the browser wraps it: a measured line count replaces the estimate', () => {
    const before = layoutWeekBoard(WEEK, TODAY, { width: 728 }).pieces.find(
      (p) => p.id === 'lynn',
    )!;
    const key = measureKey(
      'lynn',
      before.labelBox.w - before.pad.left - before.pad.right,
      before.indent,
    );
    const after = layoutWeekBoard(WEEK, TODAY, { width: 728, measured: { [key]: 1 } }).pieces.find(
      (p) => p.id === 'lynn',
    )!;
    expect(after.captionLines).toBe(1);
    expect(after.labelBox.h).toBe(after.pad.top + 13 + after.pad.bottom);
  });

  it('sizes C’s card at 55–70% of the lane, left or right, tucked 10px into the padding above, caption centred', () => {
    const layout = layoutMonthBoard(BUSY, '2026-10', { width: 728 });
    const column = layout.metrics.column;
    const cs = layout.pieces.filter((p) => p.recipe === 'C');
    expect(cs.length).toBeGreaterThan(0);
    for (const piece of cs) {
      // The front photo — the newest, drawn last — at the recipe's width.
      const front = piece.fan[piece.fan.length - 1];
      expect(front.w).toBeLessThanOrEqual(Math.round(column * 0.7));
      if (piece.fan.length === 1) {
        expect(front.w).toBeGreaterThanOrEqual(Math.round(column * 0.55));
        expect([0, Math.floor(column - piece.photoBox!.w)]).toContain(piece.photoBox!.x);
      } else {
        // A pile grows right from the lane's left line.
        expect(piece.photoBox!.x).toBe(0);
      }
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
      expect(piece.tuck).toBe(above ? Math.min(C_TUCK_PX, above.pad.bottom) : 0);
    }
  });

  it('stacks a day’s items in time order with no gap, but for C’s tuck, directly under the header', () => {
    const days = BUSY.filter((c) => !c.splash.range || c.splash.range.start === c.splash.range.end);
    const layout = layoutWeekBoard(days, '2026-10-01', { width: 358 });
    const thu = layout.pieces.filter((p) => p.day === '2026-10-01');
    expect(thu.length).toBeGreaterThan(2);
    // Directly under the header — or as far below it as a first sticker hangs up, so it stays in its row.
    const hang = thu[0].stickerBox ? Math.ceil(-thu[0].stickerBox.y) : 0;
    expect(thu[0].y).toBe(HEADER_PX + Math.max(0, hang));
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
    together: true,
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

  it('fills by invitees, not by owner: a joint record with nobody else invited stays unfilled (0033)', () => {
    const alone: Card = { ...card('alone', 'Alone', '2026-10-19'), joint: true, together: false };
    const layout = layoutWeekBoard([alone], TODAY, { width: 728 });
    expect(layout.pieces[0].label).toBe('none');
    const { container } = board([alone]);
    expect(
      container.querySelector('[data-board-piece="alone"] [data-board-label]')!.className,
    ).not.toMatch(/bg-/);
  });

  it('fills a joint splash with a single ripple, and one waiting on a member, wherever it is drawn (Home included)', () => {
    // The pool's own, one ripple by someone else, me not yet written: Add your side.
    const lone: Card = {
      ...card('test', 'Test', '2026-10-19'),
      joint: true,
      together: true,
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

  it('draws a photo card in its own ratio — 4:3 until it loads — no frame, the caption under it with a small icon and no sticker', () => {
    const { container } = board();
    const one = container.querySelector<HTMLElement>(
      '[data-board-piece="soup"] [data-board-photo-card]',
    )!;
    expect(parseFloat(one.style.height)).toBe(Math.round((parseFloat(one.style.width) * 3) / 4));
    expect(one.querySelector('[data-board-photo]')?.className ?? 'object-contain').toMatch(
      /object-contain/,
    );
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

  it('leaves a photo hidden from the board off it, and draws a post with all hidden as one with none (0044)', () => {
    const four = card('four', 'Four photos', '2026-10-23', { photos: 4 });
    const oneHidden: Card = { ...four, layout: { photos: { 'a1/four-1.webp': { hidden: true } } } };
    const view = board([oneHidden]);
    const shown = [
      ...view.container.querySelectorAll('[data-board-piece="four"] [data-board-photo-card]'),
    ].map((p) => p.getAttribute('data-board-photo-card'));
    expect(shown).toHaveLength(3);
    expect(shown).not.toContain('a1/four-1.webp');
    // Three left on the board: none more to count.
    expect(
      view.container.querySelector('[data-board-piece="four"] [data-board-more-photos]'),
    ).toBeNull();
    cleanup();

    const soup = card('soup', 'Soup', '2026-10-20', { photos: 1 });
    const allHidden: Card = { ...soup, layout: { photos: { 'a1/soup-0.webp': { hidden: true } } } };
    const { container } = board([allHidden]);
    const piece = container.querySelector('[data-board-piece="soup"]')!;
    expect(piece.getAttribute('data-recipe')).not.toBe('C');
    expect(piece.querySelector('[data-board-photo-card]')).toBeNull();
    // The card itself still carries it: only the board leaves it out.
    expect(allHidden.photos).toHaveLength(1);
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
      // A phone opens on today's half, Wed 21 – Sat 24 (review).
      const phone = board().container.querySelector(
        '[data-board-header="2026-10-22"] [data-wave-glyph]',
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

  it('takes a tap on what is drawn, where a layout moved it; never on the empty place it left', () => {
    const picked: string[] = [];
    const moved = OCTOBER.map((c) =>
      c.splash.id === 'lynn' ? { ...c, layout: { piece: { x: 2, y: 6 } } } : c,
    );
    const { container } = board(moved, { onPick: (id) => picked.push(id) });
    const piece = container.querySelector('[data-board-piece="lynn"]')!;
    // The whole-piece button is for keyboard and screen readers: a pointer passes through it.
    expect(piece.querySelector('[data-board-pick]')!.className).toContain('pointer-events-none');
    const label = piece.querySelector<HTMLElement>('[data-board-label]')!;
    expect(label.className).toContain('pointer-events-auto');
    expect(label.style.transform).toContain('translate(');
    fireEvent.click(label);
    expect(picked).toEqual(['lynn']);
  });

  it('rides the ring on the moved part: the move outside, the growth inside', () => {
    media(false);
    const moved = OCTOBER.map((c) =>
      c.splash.id === 'lynn' ? { ...c, layout: { piece: { x: 1, y: 2 }, label: { tilt: 8 } } } : c,
    );
    const { container } = board(moved, { ring: { id: 'lynn', seq: 0 } });
    const ring = container.querySelector<HTMLElement>('[data-reading-ripple]')!;
    const at = ring.closest<HTMLElement>('[data-reading-ripple-at]')!;
    expect(at.style.transform).toContain('translate(');
    // The growing ring carries no move of its own, so the move is never scaled.
    expect(ring.style.transform).toBe('');
    // The List's own rings grow inside it, never on the moved box.
    expect(ring.querySelectorAll('.commit-ring')).toHaveLength(3);
    expect(at.className).not.toContain('commit-ring');
  });

  it('bobs twice, then is still', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    expect(css).toMatch(/\.board-bob \{[^}]*animation: board-bob [^;]* 2;/);
  });

  it('bobs the heading post on the water, once per ring', () => {
    const { container, rerender } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    const heading = container.querySelector('[data-board-piece="lynn"]')!;
    expect(heading.hasAttribute('data-heading')).toBe(true);
    // Played on each part, never on the piece itself (review: z-order while it bobs).
    expect(heading.className).not.toContain('board-bob');
    expect(heading.querySelector('[data-board-label]')!.className).toContain('board-bob');
    expect(heading.querySelector('[data-board-pick]')!.className).toContain('board-bob');
    expect(
      container.querySelector('[data-board-piece=\"hoppers\"] [data-board-label]')!.className,
    ).not.toContain('board-bob');
    rerender(tree(OCTOBER, { ring: { id: 'hoppers', seq: 1 } }));
    expect(
      container.querySelector('[data-board-piece=\"lynn\"] [data-board-label]')!.className,
    ).not.toContain('board-bob');
    expect(
      container.querySelector('[data-board-piece=\"hoppers\"] [data-board-label]')!.className,
    ).toContain('board-bob');
  });

  it('sends one ripple out from the icon each time the top card changes, gone once it ends', () => {
    media(false);
    const { container, rerender } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    const ripples = () => [...container.querySelectorAll('[data-reading-ripple]')];
    expect(ripples()).toHaveLength(1);
    expect(ripples()[0].closest('[data-board-piece]')!.getAttribute('data-board-piece')).toBe(
      'lynn',
    );
    // The List's ripple: three staggered rings, once each; gone when the last ends.
    const rings = [...ripples()[0].querySelectorAll('.commit-ring')];
    expect(rings).toHaveLength(3);
    expect(rings.every((r) => (r as HTMLElement).style.animationIterationCount === '1')).toBe(true);
    fireEvent.animationEnd(rings[0]);
    fireEvent.animationEnd(rings[1]);
    expect(ripples()).toHaveLength(1);
    fireEvent.animationEnd(rings[2]);
    expect(ripples()).toHaveLength(0);
    // Still on top: the bob goes on, no second ripple.
    expect(
      container.querySelector('[data-board-piece="lynn"] [data-board-label]')!.className,
    ).toContain('board-bob');
    // A new top card: one ripple, on it.
    rerender(tree(OCTOBER, { ring: { id: 'hoppers', seq: 1 } }));
    expect(ripples()).toHaveLength(1);
    expect(ripples()[0].closest('[data-board-piece]')!.getAttribute('data-board-piece')).toBe(
      'hoppers',
    );
  });

  it('with reduced motion: no bob and no ripple, a still white outline on the post being read', () => {
    media(true);
    const { container } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    const label = container.querySelector<HTMLElement>(
      '[data-board-piece="lynn"] [data-board-label]',
    )!;
    expect(container.querySelector('[data-reading-ripple]')).toBeNull();
    expect(label.className).not.toContain('board-bob');
    expect(label.hasAttribute('data-reading-outline')).toBe(true);
    expect(label.style.outline).toContain('2px solid');
    expect(
      container.querySelector('[data-board-piece="hoppers"] [data-reading-outline]'),
    ).toBeNull();
  });

  it('turns to the week the heading post is on when it is on another page', () => {
    const { container, rerender } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    rerender(tree(OCTOBER, { ring: { id: 'early', seq: 1 } }));
    expect(container.querySelector('[data-month-board]')!.getAttribute('data-month-board')).toBe(
      '2026-09-27',
    );
    expect(
      container.querySelector('[data-board-piece=\"early\"] [data-board-label]')!.className,
    ).toContain('board-bob');
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
    const part = dropped.querySelector('[data-board-label]')!;
    expect(part.className).toContain('board-plunge');
    expect(part.className).not.toContain('board-bob');
  });

  it('holds still under reduced motion', () => {
    media(true);
    const { container } = board(OCTOBER, { ring: { id: 'lynn', seq: 0 } });
    expect(
      container.querySelector('[data-board-piece=\"lynn\"] [data-board-label]')!.className,
    ).not.toContain('board-bob');
  });
});

describe('an open joint splash (meaning is shape)', () => {
  const joint = (awaiting: { authorId: string; initials: string }[]): Card => ({
    ...card('jam', 'Jam session', '2026-10-21'),
    joint: true,
    together: true,
    href: '/pool/p-a/splash/jam',
    writers: [{ authorId: 'u-mk', initials: 'MK' }],
    awaiting,
  });

  it('sticks a dashed note on the label’s corner, outside its words, the label no taller for it', () => {
    const { container } = board([joint([{ authorId: 'u-jo', initials: 'JO' }])]);
    const slot = container.querySelector<HTMLElement>('[data-board-slot="jam"]')!;
    expect(slot.className).toContain('border-dashed');
    expect(slot.className).toContain('border-[1.5px]');
    expect(slot.className).not.toMatch(/rounded/);
    expect(slot.textContent).toBe('JOAdd your side');
    expect(slot.querySelector('[data-board-slot-faces]')!.className).toContain('opacity-50');
    // Someone else's to fill: a mark, not a button.
    expect(slot.tagName).toBe('SPAN');
    expect(slot.closest('[data-board-label]')).toBeNull();
    expect(slot.style.transform).toMatch(/rotate\((-?[3-6](\.\d+)?)deg\)/);
    const open = layoutWeekBoard([joint([{ authorId: 'u-jo', initials: 'JO' }])], TODAY, {
      width: 980,
    }).pieces[0];
    const closed = layoutWeekBoard([joint([])], TODAY, { width: 980 }).pieces[0];
    expect(open.labelBox.h).toBe(closed.labelBox.h);
    for (const words of open.textBoxes) expect(intersects(words, open.slotBounds!)).toBe(false);
    // Up onto the label by its bottom padding (review): over its edge, never its words.
    expect(open.slotBounds!.y).toBe(open.labelBox.y + open.labelBox.h - open.pad.bottom);
    expect(intersects(open.slotBounds!, open.labelBox)).toBe(true);
    // Stuck on the bottom-right corner where the lanes to the right are empty.
    expect(open.slotAt).toBe('right');
    // Beside a lane taken at its height, on the bottom-left instead.
    const NEXT_DOOR = ['n1', 'n2', 'n3'].map((id) =>
      card(id, 'Next door, all afternoon', '2026-10-22'),
    );
    const beside = layoutWeekBoard(
      [joint([{ authorId: 'u-jo', initials: 'JO' }]), ...NEXT_DOOR],
      TODAY,
      { width: 358 },
    ).pieces.find((p) => p.id === 'jam')!;
    expect(beside.slotAt).toBe('left');
    readable(
      layoutWeekBoard([joint([{ authorId: 'u-jo', initials: 'JO' }]), ...NEXT_DOOR], TODAY, {
        width: 358,
      }),
    );
  });

  it('lays the note out as a row: faces first, 16px overlapping by 4, a 4px gap, then the words, 6px at the sides and 3 above and below', () => {
    const { container } = board([
      joint([
        { authorId: 'u-jo', initials: 'JO' },
        { authorId: 'u-ak', initials: 'AK' },
      ]),
    ]);
    const slot = container.querySelector<HTMLElement>('[data-board-slot="jam"]')!;
    expect(slot.className).toMatch(/\bflex\b/);
    expect(slot.className).toContain('gap-1');
    expect(slot.className).toContain('px-[6px]');
    expect(slot.className).toContain('py-[3px]');
    // Its content's own width: nothing fixes it.
    expect(slot.style.width).toBe('');
    const [faces, words] = [...slot.children];
    expect(faces.hasAttribute('data-board-slot-faces')).toBe(true);
    expect(words.hasAttribute('data-board-slot-words')).toBe(true);
    expect(words.textContent).toBe('Add your side');
    const avatars = [...faces.children];
    expect(avatars).toHaveLength(2);
    for (const a of avatars) expect(a.className).toMatch(/\bh-4\b.*\bw-4\b|\bw-4\b.*\bh-4\b/);
    expect(avatars[1].className).toContain('-ml-1');
    // The layout's room for it holds the whole row: border, padding, faces, gap, words.
    const laid = layoutWeekBoard(
      [
        joint([
          { authorId: 'u-jo', initials: 'JO' },
          { authorId: 'u-ak', initials: 'AK' },
        ]),
      ],
      TODAY,
      { width: 980 },
    ).pieces[0];
    const content = 1.5 * 2 + 6 * 2 + 16 + 12 + 4 + 'Add your side'.length * 10 * 0.55;
    expect(laid.slotBox!.w).toBeGreaterThanOrEqual(content);
    expect(laid.slotBox!.h).toBe(16 + 3 * 2 + 1.5 * 2);
    readable(
      layoutWeekBoard([joint([{ authorId: 'u-jo', initials: 'JO' }])], TODAY, { width: 980 }),
    );
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

describe('the month grid (review)', () => {
  it('has exactly the weeks holding a day of September 2026, from the week of the 1st, the days around muted', () => {
    const layout = layoutMonthBoard(BUSY, '2026-09', { width: 728 });
    expect(layout.weeks).toHaveLength(5);
    expect(layout.weeks[0].cells.some((c) => c.day === '2026-09-01')).toBe(true);
    // The last row carries Oct 1–3 (busy in BUSY): their items at half strength.
    const october = layout.pieces.filter((p) => p.day.startsWith('2026-10'));
    expect(october.length).toBeGreaterThan(0);
    for (const p of october) expect(p.muted).toBe(true);
    for (const p of layout.pieces.filter((p) => p.day.startsWith('2026-09')))
      expect(p.muted).toBe(false);
    readable(layout);
  });

  it('draws nothing above the grid’s top, clips every row, and keeps one grid through two month turns', () => {
    window.localStorage.setItem('weming.board-span', 'month');
    let month = '2026-10';
    const view = board(BUSY, { month, onMonth: (m) => (month = m) });
    const grid = () => view.container.querySelectorAll('[data-board-canvas]');
    for (const next of ['2026-09', '2026-08']) {
      view.rerender(tree(BUSY, { month: next }));
      expect(grid()).toHaveLength(1);
    }
    const rows = [...view.container.querySelectorAll<HTMLElement>('[data-board-row-items]')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Never clipped: a part moved by hand reaches into the next cells (0044).
      expect(row.className).not.toContain('overflow-hidden');
      expect(parseFloat(row.style.top)).toBeGreaterThanOrEqual(28);
    }
  });

  it('draws each lane line once, continuous from the header to the grid’s bottom edge', () => {
    for (const span of ['month', 'week']) {
      cleanup();
      window.localStorage.setItem('weming.board-span', span);
      const { container } = board(BUSY, { month: '2026-10' });
      const rules = container.querySelectorAll<HTMLElement>('[data-board-rule]');
      expect(rules).toHaveLength(6);
      const rows = [...container.querySelectorAll<HTMLElement>('[data-board-week-row]')];
      const last = rows[rows.length - 1];
      const bottom = parseFloat(last.style.top) + parseFloat(last.style.height);
      for (const rule of rules) {
        expect(parseFloat(rule.style.top || '0')).toBe(0);
        expect(parseFloat(rule.style.height)).toBe(bottom);
      }
      // Over the rows' water, under the items.
      const canvas = container.querySelector('[data-board-canvas]')!;
      const order = [...canvas.children];
      expect(order.indexOf(rules[0])).toBeGreaterThan(order.indexOf(rows[rows.length - 1]));
      expect(order.indexOf(rules[0])).toBeLessThan(
        order.indexOf(container.querySelector('[data-board-row-items]')!),
      );
    }
  });
});

describe('a pool’s splash on Home (review)', () => {
  const joint: Card = {
    ...card('ours', 'Ours', '2026-10-21'),
    joint: true,
    together: true,
    writers: [{ authorId: 'u-mk', initials: 'MK' }],
  };

  it('shows its pool’s monogram on Home where its faces would be, and no face', () => {
    const { container } = board([{ ...joint, pools: ['Our Pool'], poolPhoto: null }]);
    const piece = container.querySelector('[data-board-piece="ours"]')!;
    expect(piece.querySelector('[data-board-pool]')!.textContent).toBe('OU');
    expect(piece.querySelector('[data-board-faces]')).toBeNull();
    expect(piece.querySelector('[data-avatar-photo]')).toBeNull();
  });

  it('shows every pool a record of mine is shared to where my face would be (review)', () => {
    const mine: Card = {
      ...card('shared', 'Shared', '2026-10-21'),
      together: true,
      sharedPools: [
        { name: 'Our Pool', photo: null },
        { name: 'Sy Pool', photo: 'https://signed/sy.webp' },
      ],
    };
    const { container } = board([mine]);
    const piece = container.querySelector('[data-board-piece="shared"]')!;
    const tiles = piece.querySelectorAll('[data-board-pool] [data-monogram]');
    expect([...tiles].map((t) => t.getAttribute('data-monogram'))).toEqual(['OU', 'SY']);
    expect(piece.querySelector<HTMLImageElement>('[data-board-pool] img')!.src).toBe(
      'https://signed/sy.webp',
    );
    expect(piece.querySelector('[data-board-faces]')).toBeNull();
  });

  it('parts the words from the monogram (and the faces) with an en space, never a margin that indents a wrapped line', () => {
    const { container } = board([{ ...joint, pools: ['Our Pool'], poolPhoto: null }]);
    const pool = container.querySelector<HTMLElement>('[data-board-pool]')!;
    expect(pool.className).not.toMatch(/\bm[lx]-/);
    expect(pool.previousSibling?.textContent).toMatch(/\u2002$/);
    cleanup();
    const inPool = board([joint]).container.querySelector<HTMLElement>('[data-board-faces]')!;
    expect(inPool.className).not.toMatch(/\bm[lx]-/);
    expect(inPool.previousSibling?.textContent).toMatch(/\u2002$/);
  });

  it('keeps a corner sticker’s first-line indent out of the monogram, the faces and the icon', () => {
    // A filled label with a corner sticker indents its first line; nothing inline inherits it.
    const pieces = [0, 1, 2, 3, 4, 5].map((at) => ({
      ...card(`g${at}`, 'Grand Austria Hotel + Waltz', '2026-10-21'),
      joint: true,
      together: true,
      pools: ['Our Pool'],
      poolPhoto: null,
    }));
    const { container } = board(pieces);
    const indented = [...container.querySelectorAll<HTMLElement>('[data-board-text]')].filter(
      (t) => t.style.textIndent !== '',
    );
    expect(indented.length).toBeGreaterThan(0);
    for (const text of indented) {
      for (const inline of text.querySelectorAll(
        '[data-board-pool], [data-board-faces], [data-board-icon]',
      )) {
        expect(inline.className).toContain('indent-0');
      }
    }
  });

  it('draws its photo there when the pool has one', () => {
    const { container } = board([
      { ...joint, pools: ['Our Pool'], poolPhoto: 'https://signed/pool.webp' },
    ]);
    expect(container.querySelector<HTMLImageElement>('[data-board-pool] img')!.src).toBe(
      'https://signed/pool.webp',
    );
  });

  it('shows its faces inside the pool', () => {
    const { container } = board([joint]);
    const piece = container.querySelector('[data-board-piece="ours"]')!;
    expect(piece.querySelector('[data-board-faces]')).not.toBeNull();
    expect(piece.querySelector('[data-board-pool]')).toBeNull();
  });
});

describe('a month fitted to the screen (review)', () => {
  // One busy week (Oct 18–24) and the rest quiet.
  const ONE_BUSY = WEEK;
  // Far more than a screen: ten posts a day for the whole month.
  const FULL = Array.from({ length: 300 }, (_, at) =>
    card(
      `f${at}`,
      `Long day number ${at}, all of it`,
      `2026-10-${String((at % 31) + 1).padStart(2, '0')}`,
    ),
  );

  it('fills a 900px board with no scroll when its weeks fit, the busy week given the most air', () => {
    const natural = layoutMonthBoard(ONE_BUSY, '2026-10', { width: 728 });
    const fitted = layoutMonthBoard(ONE_BUSY, '2026-10', { width: 728, fill: 900 });
    expect(fitted.height).toBe(900);
    const last = fitted.weeks[fitted.weeks.length - 1];
    expect(last.y + last.h).toBe(900);
    natural.weeks.forEach((week, at) => {
      expect(fitted.weeks[at].h).toBeGreaterThanOrEqual(week.h);
    });
    const busy = fitted.weeks.findIndex((w) => w.cells.some((c) => c.day === '2026-10-20'));
    const gain = (at: number) => fitted.weeks[at].h - natural.weeks[at].h;
    for (let at = 0; at < fitted.weeks.length; at += 1) {
      if (at !== busy) expect(gain(busy)).toBeGreaterThanOrEqual(gain(at));
    }
    // Items keep their place within their row.
    for (const p of fitted.pieces) {
      const was = natural.pieces.find((q) => q.id === p.id)!;
      expect(p.y - fitted.weeks[p.week].y).toBe(was.y - natural.weeks[was.week].y);
    }
    readable(fitted);
  });

  it('keeps every row at its natural height and scrolls when the month does not fit; empty weeks at the least', () => {
    const fitted = layoutMonthBoard(FULL, '2026-10', { width: 728, fill: 900 });
    const natural = layoutMonthBoard(FULL, '2026-10', { width: 728 });
    expect(fitted.height).toBeGreaterThan(900);
    expect(fitted.weeks.map((w) => w.h)).toEqual(natural.weeks.map((w) => w.h));
    for (const piece of fitted.pieces) {
      const week = fitted.weeks[piece.week];
      expect(piece.y + piece.h).toBeLessThanOrEqual(week.y + week.h);
    }
    // A week with nothing in it, in a month that scrolls: the least height.
    const sparse = layoutMonthBoard(
      [...FULL.filter((c) => c.day >= '2026-10-04'), ...[]],
      '2026-09',
      {
        width: 728,
        fill: 400,
      },
    );
    const empty = sparse.weeks.find((w) => w.cells.every((c) => c.day < '2026-09-27'));
    if (sparse.height > 400 && empty) expect(empty.h).toBe(sparse.metrics.rowBase);
    expect(layoutMonthBoard([], '2026-10', { width: 728 }).weeks[0].h).toBe(48);
    expect(layoutMonthBoard([], '2026-10', { width: 358 }).weeks[0].h).toBe(40);
  });

  it('fits a six-week month the same way', () => {
    // August 2026 spans six weeks (Jul 26 – Sep 5).
    const fitted = layoutMonthBoard([], '2026-08', { width: 728, fill: 900 });
    expect(fitted.weeks).toHaveLength(6);
    expect(fitted.height).toBe(900);
  });

  it('measures the board’s height and lays the month out to it, with no foot to scroll to', () => {
    window.localStorage.setItem('weming.board-span', 'month');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 900,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 728,
    });
    try {
      const { container } = board(ONE_BUSY);
      const canvas = container.querySelector<HTMLElement>('[data-board-canvas]')!;
      expect(parseFloat(canvas.style.height)).toBe(900);
    } finally {
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });
});

describe('the stacking order (review)', () => {
  const joint = (awaiting: { authorId: string; initials: string }[]): Card => ({
    ...card('jam', 'Jam session', '2026-10-21'),
    joint: true,
    together: true,
    href: '/pool/p-a/splash/jam',
    writers: [{ authorId: 'u-mk', initials: 'MK' }],
    awaiting,
  });
  const z = (el: Element): number => {
    const m = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?=\s|$)/.exec(el.className.toString());
    return m ? Number(m[1] ?? m[2]) : NaN;
  };

  it('draws the slot under every label, labels and photos over it, stickers over all; a piece makes no layer of its own', () => {
    const { container } = board([
      joint([{ authorId: 'u-jo', initials: 'JO' }]),
      card('below', 'Right under it', '2026-10-21'),
      ...WEEK,
    ]);
    const slot = container.querySelector('[data-board-slot="jam"]')!;
    expect(z(slot)).toBe(0);
    for (const label of container.querySelectorAll('[data-board-label]')) expect(z(label)).toBe(1);
    for (const photos of container.querySelectorAll('[data-board-photos]'))
      expect(z(photos)).toBe(1);
    for (const sticker of container.querySelectorAll('[data-board-sticker]'))
      expect(z(sticker)).toBe(2);
    // The label under the slot is later in the day: on top where they meet.
    const below = container.querySelector('[data-board-piece="below"] [data-board-label]')!;
    expect(z(below)).toBeGreaterThan(z(slot));
    for (const piece of container.querySelectorAll<HTMLElement>('[data-board-piece]')) {
      expect(piece.className).not.toMatch(/\bopacity-|\bz-/);
    }
  });

  it('fades a muted day part by part, so its parts still stack with the rest', () => {
    window.localStorage.setItem('weming.board-span', 'month');
    const { container } = board(BUSY, { month: '2026-09' });
    const muted = container.querySelector<HTMLElement>('[data-board-piece][data-muted]')!;
    expect(muted.className).not.toContain('opacity-50');
    expect(muted.querySelector('[data-board-label]')!.className).toContain('opacity-50');
  });
});

describe('the Lane view drawn with the board’s pieces (0045)', () => {
  // Three lanes; the busy fortnight's posts spread over them by id.
  const LANES = ['c-food', 'c-place', 'c-day'];
  const laneOf = (card: Card): string => LANES[card.splash.id.length % LANES.length];
  const days = [...new Set(BUSY.map((c) => c.day))].sort().reverse();

  it('places every post in its lane on its day, newest day at the top, as readably as the Calendar', () => {
    for (const width of [358, 980]) {
      const layout = layoutLaneBoard(BUSY, days, LANES, { width, columnOf: laneOf });
      expect(layout.metrics.columns).toBe(3);
      expect(layout.weeks.map((w) => w.cells[0].day)).toEqual(days);
      const ranged = BUSY.filter(
        (c) => c.splash.range && c.splash.range.start !== c.splash.range.end,
      );
      // Every post is a piece, ranged ones too: no bands in the Lane view.
      expect(layout.pieces.map((p) => p.id).sort()).toEqual(BUSY.map((c) => c.splash.id).sort());
      expect(ranged.length).toBeGreaterThan(0);
      for (const piece of layout.pieces) {
        const cell = layout.weeks[piece.week].cells[piece.col];
        expect(cell.key).toBe(laneCell(piece.card.day, laneOf(piece.card)));
      }
      readable({ ...layout, tapes: [] } as unknown as BoardLayout);
    }
  });

  it('leaves out a post with no column, and draws nothing with no days', () => {
    const layout = layoutLaneBoard(BUSY, days, LANES, {
      width: 358,
      columnOf: (card) => (card.splash.id === BUSY[0].splash.id ? null : laneOf(card)),
    });
    expect(layout.pieces.some((p) => p.id === BUSY[0].splash.id)).toBe(false);
    expect(layoutLaneBoard(BUSY, [], LANES, { width: 358, columnOf: laneOf }).pieces).toEqual([]);
  });
});

describe('a set layout holds when a ripple is added (review)', () => {
  it('keeps a day’s posts in the order they were made, not by their latest ripple', () => {
    const first: Card = {
      ...card('first', 'Made first', '2026-10-21'),
      layout: { label: { x: 0.2, y: 1 } },
    };
    const second = card('second', 'Made second', '2026-10-21', {
      over: { created_at: '2026-10-21T19:00:00.000Z' },
    });
    const before = layoutWeekBoard([first, second], TODAY, { width: 980 });
    // A ripple added to the first post today: its latest instant is now the day's last.
    const added = { ...first, instant: Date.parse('2026-10-21T23:00:00.000Z') };
    const after = layoutWeekBoard([added, second], TODAY, { width: 980 });
    for (const id of ['first', 'second']) {
      const a = before.pieces.find((p) => p.id === id)!;
      const b = after.pieces.find((p) => p.id === id)!;
      expect([b.x, b.y]).toEqual([a.x, a.y]);
    }
  });
});

describe('my side on someone else’s record, on Home (review)', () => {
  const side: Card = {
    ...card('theirs', 'Their trip', '2026-10-21'),
    side: true,
    pools: ['Our Pool'],
    poolPhoto: null,
    // A fill set by hand elsewhere is not this record's: it stays pale.
    layout: { label: { style: 'ink' } },
  };

  it('is drawn with a period band’s pale fill and its pool’s monogram', () => {
    const { container } = board([side]);
    const piece = container.querySelector('[data-board-piece="theirs"]')!;
    expect(piece.getAttribute('data-label')).toBe('pale');
    const label = piece.querySelector<HTMLElement>('[data-board-label]')!;
    expect(label.className).toContain('bg-white/20');
    expect(label.className).not.toMatch(/bg-ink|bg-white /);
    expect(piece.querySelector('[data-board-pool]')!.textContent).toBe('OU');
  });

  it('is laid out with a filled label’s padding', () => {
    const layout = layoutWeekBoard([side], TODAY, { width: 980 });
    expect(layout.pieces[0].label).toBe('pale');
    expect(layout.pieces[0].pad.top).toBe(6);
  });
});
