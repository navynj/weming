// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const pins: [string, boolean][] = [];
const deleted: string[] = [];
vi.mock('@/features/splash/actions', () => ({
  setSplashPinned: (id: string, pinned: boolean) => {
    pins.push([id, pinned]);
    return Promise.resolve({ ok: true });
  },
  deleteSplash: (id: string) => {
    deleted.push(id);
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/features/ripple-sheet/actions', () => ({
  deleteRipple: (id: string) => {
    deleted.push(id);
    return Promise.resolve({ ok: true });
  },
}));
const savedLanes: unknown[] = [];
const orders: string[][] = [];
vi.mock('@/features/lanes/actions', () => ({
  saveLane: (lane: unknown) => {
    savedLanes.push(lane);
    return Promise.resolve({ ok: true });
  },
  reorderLanes: (ids: string[]) => {
    orders.push(ids);
    return Promise.resolve({ ok: true });
  },
  // Settled by the test, so the optimistic state can be observed in flight.
  deleteLane: (id: string) =>
    new Promise((resolve) => {
      deletes.push({ id, resolve });
    }),
}));
const deletes: { id: string; resolve: (outcome: unknown) => void }[] = [];

import { byNewest, placeCard, type Card } from '@/features/home/grid';
import { HomeGround } from '@/features/home/home-ground';
import type { HomeView } from '@/features/home/view-toggle';

/** The view a test's Home opens on: a visit opens on the Calendar (review); these choose. */
let homeView: HomeView = 'lane';
import { InputSheetProvider, useInputSheet } from '@/features/input-sheet/sheet-provider';
import {
  summarizeSplash,
  type Splash,
  type SplashBlock,
  type SplashSummary,
} from '@/features/splash/summary';
import { DETAIL_TITLE_CLASS } from '@/features/splash/splash-header';
import type { MyCategory } from '@/lib/queries/profile';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const NOW = new Date('2026-09-25T20:00:00.000Z');
const TODAY = '2026-09-25';

const scrolled: ScrollToOptions[] = [];
beforeEach(() => {
  scrolled.length = 0;
  window.localStorage.clear();
  // A visit opens on the Calendar (review); these read the Lane view unless they choose.
  homeView = 'lane';
  window.sessionStorage.clear();
  Element.prototype.scrollTo = function scrollTo(
    this: Element,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options === 'object') scrolled.push(options);
  } as Element['scrollTo'];
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

function lane(id: string, name: string, icon: string, position: number): MyCategory {
  return {
    id,
    user_id: 'a1',
    name,
    icon,
    default_mode: 'drop',
    position,
    created_at: '2026-01-01T00:00:00Z',
  };
}
const LANES = [
  lane('c-food', 'Food', '🍜', 0),
  lane('c-place', 'Place', '📍', 1),
  lane('c-day', 'Day', '🖋', 2),
];

/** A block, carrying the lane its post is given here (a block has none of its own, 0042). */
type LanedBlock = SplashBlock & { lane: string };
function block(id: string, day: string, category = 'c-day', note = id): LanedBlock {
  return {
    id,
    lane: category,
    note,
    occurred_on: day,
    occurred_time: null,
    created_at: `${day}T16:00:00.000Z`,
  };
}
/**
 * A post as 0028 leaves it (H24): its range is its blocks' days and its lane
 * is theirs — the post owns both, and the blocks take them.
 */
function post(
  id: string,
  title: string,
  blocks: LanedBlock[],
  over: Partial<Splash> = {},
): SplashSummary {
  const days = blocks.flatMap((b) => (b.occurred_on ? [b.occurred_on] : [])).sort();
  const last = days[days.length - 1];
  return summarizeSplash(
    written({
      id,
      owner_id: 'a1',
      title,
      declared_start: days[0] ?? null,
      declared_end: last && last !== days[0] ? last : null,
      declared_lane_id: blocks[0]?.lane ?? null,
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
      created_at: '2026-09-01T16:00:00.000Z',
      ...over,
    }),
    blocks,
    TZ,
    NOW,
  );
}

const POSTS = [
  post('late', 'Toy Story 5', [block('l', '2026-09-20', 'c-food')]),
  post('early', 'Arnak', [
    block('e1', '2026-09-03'),
    block('e2', '2026-09-04'),
    block('e3', '2026-09-05'),
  ]),
  post('mid', '', [
    block('m', '2026-09-12', 'c-place', 'coffee went cold while I read the whole thing'),
  ]),
  post('soup', 'Beef Short Rib Soup & Alfa Tea', [block('s', '2026-09-08', 'c-food')]),
  post('aug', 'Whistler', [block('a', '2026-08-17', 'c-place')], {
    pinned_at: '2026-09-01T00:00:00Z',
  }),
];

function Dropper({ splash, month }: { splash: SplashSummary; month: string }) {
  const { markDropped } = useInputSheet();
  useEffect(() => markDropped({ splash, month, note: null }), [splash, month, markDropped]);
  return null;
}

/** The sheet host lives in the shell; here the provider's state stands in for it. */
function SheetProbe() {
  const { sheet } = useInputSheet();
  return sheet ? <span data-sheet-open={sheet.kind} /> : null;
}

function Deleter({ id }: { id: string }) {
  const { markDeleted } = useInputSheet();
  useEffect(() => markDeleted(id), [id, markDeleted]);
  return null;
}

function cards(posts: SplashSummary[]): Card[] {
  return posts
    .map((p) =>
      placeCard(
        p,
        p.ghostTitle ?? '',
        TZ,
        p.blocks.map((_, i) => ({ id: `${p.id}-r${i}`, note: `${p.id} ${i}`, createdAt: '' })),
      ),
    )
    .sort(byNewest);
}

function ground(
  posts = POSTS,
  dropped: SplashSummary | null = null,
  deleted: string | null = null,
  categories = LANES,
  month: string | null = null,
  board: 'stair' | 'flip' = 'stair',
  topParam: string | null = null,
) {
  return render(
    <InputSheetProvider>
      {dropped ? <Dropper splash={dropped} month={month ?? '2026-09'} /> : null}
      {deleted ? <Deleter id={deleted} /> : null}
      <SheetProbe />
      <HomeGround
        initialView={homeView}
        cards={cards(posts)}
        pinned={posts.filter((p) => p.pinnedAt)}
        categories={categories}
        today={TODAY}
        timeZone={TZ}
        initials="YL"
        scrollToMonth={month}
        topParam={topParam}
        board={board}
      />
    </InputSheetProvider>,
  );
}

// The Lane view draws each post as its board piece (0045): found by its
// lane and day, tapped by its pick.
const markIds = (root: Element): (string | null)[] =>
  [...root.querySelectorAll('[data-lane-piece]')].map((el) => el.getAttribute('data-lane-piece'));
const cellOf = (mark: Element): HTMLElement => mark.closest<HTMLElement>('[data-cell]')!;
const rowOf = (mark: Element): HTMLElement => {
  // A row is the rail cell and the pieces' strip after it.
  let el: Element | null = mark.closest('[data-lane-pieces]') ?? cellOf(mark);
  while (el && !el.hasAttribute('data-day-row')) el = el.previousElementSibling;
  return el as HTMLElement;
};
const topCard = (root: Element): HTMLElement =>
  root.querySelector<HTMLElement>('[data-stack-card][data-slot="0"]')!;
/** The pile's strips, newest-turned first (the page-turn board). */
const pile = (root: Element): (string | null)[] =>
  [...root.querySelectorAll('[data-pile-strip][data-pile-slot]')]
    .sort(
      (a, b) => Number(a.getAttribute('data-pile-slot')) - Number(b.getAttribute('data-pile-slot')),
    )
    .map((el) => el.getAttribute('data-pile-strip'));
/** Nothing moving or turning. */
const settled = (root: Element): Promise<void> =>
  waitFor(() => {
    expect(root.querySelector('[data-moving]')).toBeNull();
    expect(root.querySelector('[data-turning]')).toBeNull();
  });
/** A stair's cards, nearest the top first. */
const stair = (root: Element, which: 'up' | 'down'): (string | null)[] =>
  [...root.querySelectorAll(`[data-stack-card][data-stair="${which}"]`)]
    .sort((a, b) => Number(a.getAttribute('data-step')) - Number(b.getAttribute('data-step')))
    .map((el) => el.getAttribute('data-stack-card'));
const scaleOf = (el: Element): number =>
  Number(/scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 1);
/** Translucent posts: none since the Lane view is drawn with pieces (0045). */
const water = (root: Element): (string | null)[] =>
  [...root.querySelectorAll('[data-lane-piece] [data-dived]')].map((el) =>
    el.closest('[data-lane-piece]')!.getAttribute('data-lane-piece'),
  );
/** The post the stack heads to bobs on the board (0045): one at a time. */
const bobbing = (root: Element): (string | null)[] =>
  [...root.querySelectorAll('[data-lane-piece] [data-board-piece][data-heading]')].map((el) =>
    el.getAttribute('data-board-piece'),
  );
/** The ring arrives once the mark has been brought into view. */
const ringed = (root: Element, id: string): Promise<void> =>
  waitFor(() => expect(root.querySelector(`[data-lane-piece="${id}"][data-ring]`)).not.toBeNull());
/** The window reaches every day once the grid has measured where its end is. */
const grown = (root: Element): Promise<void> =>
  waitFor(() => expect(root.querySelector('[data-day-row="2026-08-17"]')).not.toBeNull());
describe('the water ground (H22)', () => {
  it('is the blue ground: the grid above, the diving board below, white carrying content', () => {
    const { container } = ground();
    expect(container.querySelector('[data-home-ground]')!.className).toContain('water-ground');
    const grid = container.querySelector('[data-lane-grid]')!;
    const board = container.querySelector('[data-diving-board]')!;
    expect(grid.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const mark of container.querySelectorAll('[data-mark]')) {
      expect(mark.className).toContain('bg-white');
    }
    // No face floats above the lanes on Home (review). Settings open from the
    // strip's gear, before my face (0032); the header carries none.
    expect(container.querySelector('[data-avatar-row]')).toBeNull();
    expect(container.querySelector('[data-home-header] [data-home-settings]')).toBeNull();
    const strip = container.querySelector('[data-home-foot="phone"] [data-place-strip]')!;
    expect(strip.firstElementChild!.hasAttribute('data-strip-settings')).toBe(true);
  });
});

describe('the lane grid', () => {
  it('places every post exactly once, on its lane\u2019s column and its day\u2019s row', async () => {
    const { container } = ground();
    await grown(container);
    const ids = markIds(container);
    expect([...ids].sort()).toEqual(['aug', 'early', 'late', 'mid', 'soup']);
    expect(
      cellOf(container.querySelector('[data-lane-piece="late"]')!).getAttribute('data-cell'),
    ).toBe('c-food');
    expect(
      rowOf(container.querySelector('[data-lane-piece="late"]')!).getAttribute('data-day-row'),
    ).toBe('2026-09-20');
    // A post sits on the last day of its range (H22): Arnak's third block.
    expect(
      rowOf(container.querySelector('[data-lane-piece="early"]')!).getAttribute('data-day-row'),
    ).toBe('2026-09-05');
    expect(
      cellOf(container.querySelector('[data-lane-piece="early"]')!).getAttribute('data-cell'),
    ).toBe('c-day');
  });

  it('reads newest day first, names only the days with something, and the month on the first named day', async () => {
    const { container } = ground();
    await grown(container);
    const rows = [...container.querySelectorAll('[data-day-row]')].map((r) =>
      r.getAttribute('data-day-row'),
    );
    // A run of empty days is one short gap, with no date (review).
    expect(rows[0]).toBe('2026-09-25');
    expect(rows[1]).toBe('2026-09-20');
    const gap = container.querySelector('[data-day-row="2026-09-25"]')!;
    expect(gap.getAttribute('data-gap')).toBe('');
    expect(gap.getAttribute('data-day-to')).toBe('2026-09-21');
    expect(gap.textContent).toBe('');
    expect(rows).toContain('2026-08-17');
    const named = [...container.querySelectorAll('[data-day-row][data-labelled]')].map((r) =>
      r.getAttribute('data-day-row'),
    );
    expect(named).toEqual(['2026-09-20', '2026-09-12', '2026-09-08', '2026-09-05', '2026-08-17']);
    expect(container.querySelector('[data-day-row="2026-09-20"]')!.textContent).toContain('SUN');
    const monthLabelled = [...container.querySelectorAll('[data-day-row]')]
      .filter((r) => r.querySelector('[data-month-label]'))
      .map((r) => r.getAttribute('data-day-row'));
    expect(monthLabelled).toEqual(['2026-09-20', '2026-08-17']);
  });

  it('heads each column with its emoji over its name, in lane order, a rope down each', () => {
    const { container } = ground();
    const headers = [...container.querySelectorAll('[data-lane-header]')];
    expect(headers.map((h) => h.getAttribute('data-lane-header'))).toEqual([
      'c-food',
      'c-place',
      'c-day',
    ]);
    expect(headers[0].textContent).toBe('🍜Food');
    // A rope runs beside each lane, between it and the next; none at the rail's side (review).
    const strip = container.querySelector('[data-lane-pieces="2026-09-20"]')!;
    const ropes = [...strip.querySelectorAll<HTMLElement>('[data-rope]')];
    expect(ropes).toHaveLength(2);
    for (const rope of ropes) expect(parseFloat(rope.style.left)).toBeGreaterThan(0);
  });

  it('renders an empty month as one compressed gap of empty ropes, with no copy', () => {
    const { container, queryByText } = ground([]);
    expect(container.querySelectorAll('[data-day-row]')).toHaveLength(1);
    expect(container.querySelector('[data-day-row][data-gap]')).not.toBeNull();
    expect(container.querySelectorAll('[data-rope]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-mark]')).toBeNull();
    expect(queryByText(/quiet|fresh page|nothing/i)).toBeNull();
    expect(container.querySelector('[data-diving-board] [data-stack]')).toBeNull();
    expect(container.querySelector('[data-compose]')).not.toBeNull();
  });

  it('stacks two posts on one lane and day within the row', () => {
    const twin = post('twin', 'Second soup', [block('t', '2026-09-08', 'c-food')]);
    const { container } = ground([...POSTS, twin]);
    const soup = container.querySelector('[data-lane-piece="soup"]')!;
    const row = soup.closest('[data-lane-pieces]')!;
    const inFood = [...row.querySelectorAll('[data-lane-piece][data-cell="c-food"]')];
    expect(inFood.map((p) => p.getAttribute('data-lane-piece')).sort()).toEqual(['soup', 'twin']);
  });

  it('places a post by its declared lane over the lane its blocks took', () => {
    const declared = post('decl', 'Declared', [block('d', '2026-09-10', 'c-day')], {
      declared_lane_id: 'c-place',
    });
    const { container } = ground([declared]);
    expect(
      cellOf(container.querySelector('[data-lane-piece="decl"]')!).getAttribute('data-cell'),
    ).toBe('c-place');
  });

  it('gives a post on no lane of mine one unlabelled column at the end, only when any', () => {
    const { container: plain } = ground();
    expect(plain.querySelector('[data-lane-header=""]')).toBeNull();
    const stray = post('stray', 'Stray', [block('x', '2026-09-09', 'c-gone')]);
    const { container } = ground([stray]);
    expect(container.querySelector('[data-lane-header=""]')).not.toBeNull();
    expect(
      cellOf(container.querySelector('[data-lane-piece="stray"]')!).getAttribute('data-cell'),
    ).toBe('');
  });

  it('shares the width among six lanes or fewer, and scrolls the columns from the seventh', () => {
    const six = Array.from({ length: 6 }, (_, i) => lane(`l${i}`, `Lane ${i}`, '🌊', i));
    const { container: even } = ground([], null, null, six);
    const grid = even.querySelector<HTMLElement>('[data-lane-grid]')!;
    expect(grid.getAttribute('data-columns')).toBe('even');
    expect(grid.querySelector<HTMLElement>('[data-grid]')!.style.gridTemplateColumns).toContain(
      'repeat(6, minmax(0, 1fr))',
    );
    cleanup();
    const seven = [...six, lane('l6', 'Lane 6', '🌊', 6)];
    const { container: fixed } = ground([], null, null, seven);
    const wide = fixed.querySelector<HTMLElement>('[data-lane-grid]')!;
    expect(wide.getAttribute('data-columns')).toBe('fixed');
    // Unmeasured in jsdom, a column falls back to its fixed width.
    expect(wide.querySelector<HTMLElement>('[data-grid]')!.style.gridTemplateColumns).toContain(
      'repeat(7, 56px)',
    );
    // One axis per scroller: the outer moves only up and down with the header
    // bar sticky at its top; the inner moves only sideways, the rail sticky
    // at its left.
    expect(wide.className).toContain('overflow-x-hidden');
    expect(wide.className).toContain('overflow-y-auto');
    const across = wide.querySelector<HTMLElement>('[data-x-scroller]')!;
    expect(across.className).toContain('overflow-x-auto');
    expect(across.className).toContain('overflow-y-hidden');
    expect(across.querySelector('[data-day-row]')!.className).toContain('sticky left-0');
    expect(wide.querySelector('[data-grid-header]')!.className).toContain('sticky top-0');
    expect(across.querySelector('[data-lane-header]')).toBeNull();
    // The header bar follows the columns sideways.
    across.scrollLeft = 40;
    fireEvent.scroll(across);
    expect(wide.querySelector<HTMLElement>('[data-grid-head]')!.style.transform).toBe(
      'translateX(-40px)',
    );
  });

  it('writes the short title under each mark, at six lanes and at eight', () => {
    const five = [...LANES, lane('l3', 'Lane 3', '🌊', 3), lane('l4', 'Lane 4', '🌊', 4)];
    const { container } = ground(POSTS, null, null, five);
    // Its title is its label's words (0045).
    const title = container.querySelector<HTMLElement>(
      '[data-lane-piece="late"] [data-board-text]',
    )!;
    expect(title.textContent).toContain('Toy Story 5');
    cleanup();
    const eight = [...five, ...[5, 6, 7].map((i) => lane(`l${i}`, `Lane ${i}`, '🌊', i))];
    const { container: fixed } = ground(POSTS, null, null, eight);
    expect(fixed.querySelector('[data-lane-grid]')!.getAttribute('data-columns')).toBe('fixed');
    expect(
      fixed.querySelector('[data-lane-piece="late"] [data-board-text]')!.textContent,
    ).toContain('Toy Story 5');
  });

  it('links each lane header to its lane page', () => {
    const { container } = ground();
    expect(container.querySelector('[data-lane-header="c-food"]')!.getAttribute('href')).toBe(
      '/lane/c-food',
    );
    expect(container.querySelector('[data-lane-detail]')).toBeNull();
  });

  it('opens lane management from the header\u2019s lane glyph, and the new-lane sheet from the +', () => {
    const { container, getByLabelText, getByRole } = ground();
    expect(container.querySelector('[data-grid-header] [data-edit-lanes]')).toBeNull();
    fireEvent.click(container.querySelector('[data-home-header] [data-manage-lanes]')!);
    expect(getByRole('dialog', { name: 'Edit lanes' })).toBeTruthy();
    fireEvent.click(getByLabelText('Close'));
    fireEvent.click(getByLabelText('New lane'));
    expect(getByRole('dialog', { name: 'New lane' })).toBeTruthy();
  });
});

describe('the diving board, a staircase', () => {
  it('reads the newest post as the top card, with its mark ringed on first render', async () => {
    const { container } = ground();
    expect(topCard(container).getAttribute('data-stack-card')).toBe('late');
    expect(topCard(container).getAttribute('data-stair')).toBe('top');
    await ringed(container, 'late');
    // The ring is the Calendar's bob on the post being read (0045).
    expect(bobbing(container)).toEqual(['late']);
  });

  it('steps the unread cards down below the top, each smaller by 0.94, three at most; no strip, no chevron', () => {
    const { container } = ground();
    expect(stair(container, 'down')).toEqual(['mid', 'soup', 'early']);
    expect(stair(container, 'up')).toEqual([]);
    const scales = stair(container, 'down').map((id) =>
      scaleOf(container.querySelector(`[data-stack-card="${id}"]`)!),
    );
    expect(scales[0]).toBeCloseTo(0.94, 3);
    expect(scales[1]).toBeCloseTo(0.94 ** 2, 3);
    expect(scales[2]).toBeCloseTo(0.94 ** 3, 3);
    expect(scaleOf(topCard(container))).toBe(1);
    const behind = container.querySelector('[data-stack-card="mid"]')!;
    expect(behind.textContent).toContain('📍');
    expect(behind.textContent).toContain('coffee went cold');
    expect(container.querySelector('[data-surfaced]')).toBeNull();
    expect(container.querySelector('[data-tab]')).toBeNull();
    expect(pile(container)).toEqual([]);
  });

  it('reads the top card: the title at the detail title size, then the date, the chip, the initials and the body', () => {
    const { container } = ground();
    const card = topCard(container);
    expect(card.querySelector('[data-card-title]')!.className).toContain(DETAIL_TITLE_CLASS);
    expect(card.querySelector('[data-card-date]')!.textContent).toBe('Sep 20 (SUN)');
    expect(card.textContent).toContain('Food');
    expect(card.textContent).toContain('🍜');
    expect(card.textContent).toContain('Toy Story 5');
    expect(card.textContent).toContain('YL');
    expect(card.querySelector('[data-card-link]')!.getAttribute('href')).toBe('/splash/late');
    const behind = container.querySelector('[data-stack-card="mid"] [data-card-title]')!;
    expect(behind.className).not.toContain('text-3xl');
  });

  it('flips forward from a tap on the first lower card: the top goes up one step, the ring moves', async () => {
    const { container } = ground();
    fireEvent.click(container.querySelector('[data-step-card="mid"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    expect(stair(container, 'up')).toEqual(['late']);
    expect(stair(container, 'down')).toEqual(['soup', 'early', 'aug']);
    // Drawn with pieces, nothing is translucent (0045).
    expect(water(container)).not.toContain('mid');
    await ringed(container, 'mid');
    expect(container.querySelectorAll('[data-ring]')).toHaveLength(1);
  });

  it('flips back from a tap on the upper card: the upper stair empties', async () => {
    const { container } = ground();
    fireEvent.click(container.querySelector('[data-step-card="mid"]')!);
    await settled(container);
    fireEvent.click(container.querySelector('[data-step-card="late"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('late');
    expect(stair(container, 'up')).toEqual([]);
    expect(water(container)).not.toContain('late');
    await ringed(container, 'late');
  });

  it('brings up the next card on a tap anywhere in the lower stair, the bands being too thin to aim at', async () => {
    const { container } = ground();
    fireEvent.click(container.querySelector('[data-step-card="early"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    expect(stair(container, 'up')).toEqual(['late']);
  });

  it('brings a deeper card up from its mark, one read card above and the rest at their marks', async () => {
    const { container } = ground();
    fireEvent.click(container.querySelector('[data-board-pick=\"soup\"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('soup');
    expect(stair(container, 'up')).toEqual(['mid']);
    expect(water(container)).not.toContain('soup');
  });

  it('brings a tapped mark\u2019s card to the top with the same motion, read cards above it', async () => {
    const { container } = ground();
    await grown(container);
    fireEvent.click(container.querySelector('[data-board-pick=\"aug\"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('aug');
    expect(stair(container, 'up')).toEqual(['early']);
    expect(water(container)).toHaveLength(0);
    expect(water(container)).not.toContain('aug');
    await ringed(container, 'aug');
    fireEvent.click(container.querySelector('[data-board-pick=\"mid\"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    expect(stair(container, 'up')).toEqual(['late']);
  });

  it('offers open, pin and delete from the top card\u2019s menu; pin shows on the bar at once', async () => {
    pins.length = 0;
    const { container, getByRole } = ground(POSTS.filter((p) => !p.pinnedAt));
    expect(container.querySelector('[data-pinned-cards]')).toBeNull();
    fireEvent.click(topCard(container).querySelector('[data-card-menu-button]')!);
    const menu = container.querySelector('[data-card-menu]')!;
    expect(menu.querySelector('a[href="/splash/late"]')!.textContent).toBe('Open');
    fireEvent.click(getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() =>
      expect(container.querySelector('[data-pinned-card="late"]')).not.toBeNull(),
    );
    await waitFor(() => expect(pins).toEqual([['late', true]]));
  });

  it('deletes from the top card\u2019s menu behind a confirm: gone from the board and the grid at once', async () => {
    deleted.length = 0;
    const { container, getByRole, getByText } = ground();
    fireEvent.click(topCard(container).querySelector('[data-card-menu-button]')!);
    fireEvent.click(getByRole('menuitem', { name: 'Delete' }));
    expect(container.querySelector('[data-card-delete-confirm]')!.textContent).toContain(
      'Deletes the post and its 1 block.',
    );
    fireEvent.click(getByText('Delete', { selector: '[data-card-delete-confirm] button' }));
    await waitFor(() => expect(container.querySelector('[data-lane-piece="late"]')).toBeNull());
    expect(container.querySelector('[data-stack-card="late"]')).toBeNull();
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    await waitFor(() => expect(deleted).toEqual(['late']));
  });

  it('opens the post sheet from the compose disc outside the stack: white, a blue plus; no nav', () => {
    const { container } = ground();
    expect(container.querySelector('[data-drop-bar]')).toBeNull();
    expect(container.querySelector('[data-ground-nav]')).toBeNull();
    expect(container.querySelector('[data-stack] [data-compose]')).toBeNull();
    const compose = container.querySelector('[data-board-column] [data-compose]')!;
    expect(compose.className).toContain('bg-white');
    expect(compose.className).toContain('text-main-900');
    expect(container.querySelector('[data-sheet-open]')).toBeNull();
    fireEvent.click(compose);
    expect(container.querySelector('[data-sheet-open="splash"]')).not.toBeNull();
  });

  it('keeps its height whatever is on top, so the grid never moves', async () => {
    const { container } = ground();
    const stack = container.querySelector<HTMLElement>('[data-stack]')!;
    const height = stack.style.height;
    fireEvent.click(container.querySelector('[data-step-card="soup"]')!);
    await settled(container);
    expect(stack.style.height).toBe(height);
  });

  it('turns pages onto a pile instead when the page-turn board is chosen', async () => {
    const { container } = ground(POSTS, null, null, LANES, null, 'flip');
    expect(container.querySelector('[data-board="flip"]')).not.toBeNull();
    fireEvent.click(container.querySelector('[data-board-pick=\"mid\"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    expect(pile(container)).toEqual(['late']);
    await ringed(container, 'mid');
  });
});

describe('the stair under a finger (touch)', () => {
  const touch = { pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0 } as const;
  /** A finger on the element, dragged by `dy` in a few frames, and lifted. */
  async function swipe(el: Element, dy: number): Promise<void> {
    fireEvent.pointerDown(el, { ...touch, clientX: 200, clientY: 600 });
    for (let k = 1; k <= 8; k += 1) {
      fireEvent.pointerMove(window, { ...touch, clientX: 200, clientY: 600 + (dy * k) / 8 });
      await new Promise((r) => setTimeout(r, 16));
    }
    fireEvent.pointerUp(window, { ...touch, clientX: 200, clientY: 600 + dy });
  }

  it('flips forward on a tap of the first lower card', async () => {
    const { container } = ground();
    const step = container.querySelector('[data-step-card="mid"]')!;
    fireEvent.pointerDown(step, { ...touch, clientX: 200, clientY: 700 });
    fireEvent.pointerUp(step, { ...touch, clientX: 200, clientY: 700 });
    fireEvent.click(step);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
  });

  it('flips forward on a swipe up and back on a swipe down, and keeps answering after', async () => {
    const { container } = ground();
    await swipe(topCard(container), -160);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    // The second gesture is the one that went dead (review): the stack must
    // have settled, not stayed in flight.
    expect(container.querySelector('[data-moving]')).toBeNull();
    await swipe(topCard(container), 160);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('late');
    await swipe(topCard(container), -160);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    fireEvent.click(container.querySelector('[data-step-card="soup"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('soup');
  });

  it('springs back on a short swipe, and ignores a drag that starts across the stair', async () => {
    const { container } = ground();
    await swipe(topCard(container), -30);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('late');
    const el = topCard(container);
    fireEvent.pointerDown(el, { ...touch, clientX: 100, clientY: 600 });
    for (let k = 1; k <= 8; k += 1) {
      fireEvent.pointerMove(window, { ...touch, clientX: 100 + k * 25, clientY: 600 - k * 4 });
      await new Promise((r) => setTimeout(r, 16));
    }
    fireEvent.pointerUp(window, { ...touch, clientX: 300, clientY: 568 });
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('late');
  });
});

describe('the staircase on a wide screen', () => {
  const wide = (): void => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }),
    });
  };

  it('runs up and down as on a phone, the column’s height going to the top card (review)', async () => {
    wide();
    const { container } = ground();
    expect(container.querySelector('[data-stack]')!.getAttribute('data-axis')).toBe('y');
    fireEvent.click(container.querySelector('[data-step-card="mid"]')!);
    await settled(container);
    expect(container.querySelector('[data-stack-card="late"]')!.getAttribute('data-stair')).toBe(
      'up',
    );
    // No spines: the sideways stair is off.
    expect(container.querySelector('[data-card-spine]')).toBeNull();
  });

  it('brings the clicked step\u2019s own card to the top', async () => {
    wide();
    const { container } = ground();
    fireEvent.click(container.querySelector('[data-step-card="mid"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
  });

  it('flips with the arrow keys when the stack has focus', async () => {
    wide();
    const { container } = ground();
    const stack = container.querySelector('[data-stack]')!;
    fireEvent.keyDown(stack, { key: 'ArrowRight' });
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    fireEvent.keyDown(stack, { key: 'ArrowLeft' });
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('late');
  });

  it('flips with the up and down arrows too, as the stair now runs', async () => {
    wide();
    const { container } = ground();
    const stack = container.querySelector('[data-stack]')!;
    fireEvent.keyDown(stack, { key: 'ArrowDown' });
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('mid');
    fireEvent.keyDown(stack, { key: 'ArrowUp' });
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('late');
  });
});

describe('the post just dropped', () => {
  it('is on the grid at once with the ring, and lands on top of the stack', async () => {
    const fresh = post('fresh', 'Just dropped', [block('f', '2026-09-25', 'c-place')]);
    const { container } = ground(POSTS, fresh);
    expect(
      cellOf(container.querySelector('[data-lane-piece="fresh"]')!).getAttribute('data-cell'),
    ).toBe('c-place');
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('fresh');
    expect(stair(container, 'up')).toEqual([]);
    expect(water(container)).not.toContain('fresh');
    await ringed(container, 'fresh');
    expect(bobbing(container)).toEqual(['fresh']);
  });

  it('takes a deleted post off the grid, the stack and the pinned bar at once', () => {
    const { container } = ground(POSTS, null, 'aug');
    expect(markIds(container)).not.toContain('aug');
    expect(container.querySelector('[data-stack-card="aug"]')).toBeNull();
    expect(container.querySelector('[data-pinned-cards]')).toBeNull();
  });
});

describe('?m= as a scroll target', () => {
  it('opens with the month\u2019s newest post on top, and scrolls the grid to the month', () => {
    const { container } = ground(POSTS, null, null, LANES, '2026-08');
    expect(topCard(container).getAttribute('data-stack-card')).toBe('aug');
    expect(scrolled.length).toBeGreaterThan(0);
  });
});

it('leaves the ring whole in the Date view: the day rail is not filled over it', () => {
  homeView = 'date';
  const { container } = ground(POSTS);
  const rail = container.querySelector<HTMLElement>('[data-day-row]')!;
  expect(rail.closest('[data-cell]') ?? rail).toBeTruthy();
  expect(rail.className).not.toMatch(/bg-|sticky|overflow-hidden/);
  homeView = 'board';
});

it('leaves the ring whole in the Date view: the day rail is not filled over it', () => {
  homeView = 'date';
  const { container } = ground(POSTS);
  const rail = container.querySelector<HTMLElement>('[data-day-row]')!;
  expect(container.querySelector('[data-cell="date"]')).not.toBeNull();
  expect(rail.className).not.toMatch(/bg-|sticky|overflow-hidden/);
  homeView = 'board';
});

describe('pinned posts as cards (round 3)', () => {
  const pinnedPosts = (): SplashSummary[] =>
    POSTS.map((p) =>
      ['aug', 'soup'].includes(p.id) ? { ...p, pinnedAt: '2026-09-01T00:00:00Z' } : p,
    );

  it('sits under the header and above the grid on a phone, a card per pinned post', () => {
    const { container } = ground(pinnedPosts());
    const strip = container.querySelector('[data-pinned-cards="phone"]')!;
    const cardsIn = strip.querySelectorAll('[data-pinned-card]');
    expect(cardsIn).toHaveLength(2);
    const card = strip.querySelector<HTMLElement>('[data-pinned-card="aug"]')!;
    expect(card.className).toContain('bg-white/20');
    // The lane plainly, no chip; the title large; initials and the latest ripple.
    const lane = card.querySelector<HTMLElement>('[data-pinned-lane]')!;
    expect(lane.className).not.toMatch(/bg-|rounded/);
    expect(card.querySelector('[data-pinned-title]')!.className).toContain('text-2xl');
    expect(card.textContent).toContain('Whistler');
    expect(card.textContent).toContain('Place');
    expect(card.textContent).toContain('YL');
    const header = container.querySelector('[data-home-header]')!;
    const grid = container.querySelector('[data-lane-grid]')!;
    expect(header.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Several: the next card peeks at the right edge.
    expect(card.closest('li')!.className).toContain('w-[calc(100%-2.5rem)]');
  });

  it('is absent when nothing is pinned', () => {
    const { container } = ground(POSTS.filter((p) => !p.pinnedAt));
    expect(container.querySelector('[data-pinned-cards]')).toBeNull();
  });

  it('brings a tapped pinned card\u2019s post to the top, with the ring at its mark', async () => {
    const { container } = ground(pinnedPosts());
    await grown(container);
    fireEvent.click(
      container.querySelector('[data-pinned-cards="phone"] [data-pinned-card="aug"]')!,
    );
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('aug');
    await ringed(container, 'aug');
  });

  it('renders both slots from the start and lets CSS show the one for the width: no move after load', () => {
    const { container } = ground(pinnedPosts());
    const phone = container.querySelector('[data-pinned-cards="phone"]')!;
    const wide = container.querySelector('[data-pinned-cards="wide"]')!;
    expect(phone.className).toContain('lg:hidden');
    expect(wide.className).toContain('hidden lg:block');
    // The wide slot sits in the stack's column, above the stack.
    expect(wide.closest('[data-board-column]')).not.toBeNull();
    const board = container.querySelector('[data-diving-board]')!;
    expect(wide.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(phone.closest('[data-board-column]')).toBeNull();
  });
});

describe('the header and the Date view (round 3)', () => {
  it('has the lane glyph and the Lane | Date toggle, no Home title and no =', () => {
    const { container } = ground();
    const header = container.querySelector('[data-home-header]')!;
    expect(header.querySelector('[data-manage-lanes] [data-lane-icon]')).not.toBeNull();
    expect(header.textContent).not.toContain('Home');
    const lanes = header.querySelector('[data-view-option="lane"]')!;
    expect(lanes.getAttribute('aria-selected')).toBe('true');
    expect(lanes.className).toContain('bg-white');
    expect(lanes.className).toContain('text-main-900');
  });

  it('switches to the Date view, kept while I stay, not on the device', () => {
    const { container } = ground();
    fireEvent.click(container.querySelector('[data-view-option="date"]')!);
    expect(window.localStorage.getItem('weming.home-view')).toBeNull();
    expect(container.querySelector('[data-pill]')).not.toBeNull();
    expect(container.querySelector('[data-lane-header]')).toBeNull();
    cleanup();
    // The next visit opens on the Calendar again (review).
    homeView = 'board';
    const { container: again } = ground();
    expect(again.querySelector('[data-view-option="board"]')!.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('opens a visit on the Calendar even where an earlier build kept another view', () => {
    window.localStorage.setItem('weming.home-view', 'lane');
    const { container } = render(
      <InputSheetProvider>
        <HomeGround
          cards={[]}
          pinned={[]}
          categories={LANES}
          today={TODAY}
          timeZone={TZ}
          initials="YL"
          scrollToMonth={null}
        />
      </InputSheetProvider>,
    );
    expect(
      container.querySelector('[data-view-option="board"]')!.getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('lists every post exactly once under its day, newest first, a pill per line', async () => {
    homeView = 'date';
    const { container } = ground();
    await grown(container);
    const pills = [...container.querySelectorAll('[data-pill]')].map((p) =>
      p.getAttribute('data-pill'),
    );
    expect([...pills].sort()).toEqual(['aug', 'early', 'late', 'mid', 'soup']);
    expect(pills).toEqual(['late', 'mid', 'soup', 'early', 'aug']);
    const late = container.querySelector('[data-pill="late"]')!;
    expect(late.textContent).toContain('Toy Story 5');
    expect(late.textContent).toContain('Food');
    let row: Element | null = late.closest('[data-cell]');
    while (row && !row.hasAttribute('data-day-row')) row = row.previousElementSibling;
    expect(row!.getAttribute('data-day-row')).toBe('2026-09-20');
  });

  it('spaces every day alike: no gap rows, the month on a line of its own', async () => {
    homeView = 'date';
    const { container } = ground();
    await grown(container);
    expect(container.querySelector('[data-day-row][data-gap]')).toBeNull();
    const cells = [...container.querySelectorAll<HTMLElement>('[data-cell="date"]')];
    expect(new Set(cells.map((c) => c.className)).size).toBe(1);
    const months = [...container.querySelectorAll('[data-month-label]')];
    expect(months.map((m) => m.textContent)).toEqual(['2026 SEP', '2026 AUG']);
    for (const month of months) expect(month.hasAttribute('data-day-row')).toBe(false);
  });

  it('rings the top card\u2019s pill, and a tapped pill comes to the top', async () => {
    homeView = 'date';
    const { container } = ground();
    await waitFor(() =>
      expect(container.querySelector('[data-pill="late"][data-ring]')).not.toBeNull(),
    );
    fireEvent.click(container.querySelector('[data-pill="soup"]')!);
    await settled(container);
    expect(topCard(container).getAttribute('data-stack-card')).toBe('soup');
    await waitFor(() =>
      expect(container.querySelector('[data-pill="soup"][data-ring]')).not.toBeNull(),
    );
  });

  it('puts a dropped post\u2019s pill under today with the ring', async () => {
    homeView = 'date';
    const fresh = post('fresh', 'Just dropped', [block('f', '2026-09-25', 'c-place')]);
    const { container } = ground(POSTS, fresh);
    await waitFor(() =>
      expect(container.querySelector('[data-pill="fresh"][data-ring]')).not.toBeNull(),
    );
    let row: Element | null = container
      .querySelector('[data-pill="fresh"]')!
      .closest('[data-cell]');
    while (row && !row.hasAttribute('data-day-row')) row = row.previousElementSibling;
    expect(row!.getAttribute('data-day-row')).toBe(TODAY);
  });
});

describe('a post\u2019s own icon (0008)', () => {
  it('stands for the post on its mark, its pill and its card, before its lane\u2019s emoji', () => {
    const withIcon = POSTS.map((p) => (p.id === 'late' ? { ...p, icon: '🎬' } : p));
    const { container } = ground(withIcon);
    expect(container.querySelector('[data-lane-piece="late"]')!.textContent).toContain('🎬');
    expect(container.querySelector('[data-lane-piece="soup"]')!.textContent).toContain('🍜');
    expect(topCard(container).querySelector('[data-card-title]')!.textContent).toContain('🎬');
    cleanup();
    homeView = 'date';
    const { container: list } = ground(withIcon);
    expect(list.querySelector('[data-pill="late"]')!.textContent).toContain('🎬');
  });
});

describe('the Home button at the foot', () => {
  it('walks Board → Lane → Date on each tap, the header toggle following', () => {
    homeView = 'board';
    const { container } = ground();
    expect(
      [...container.querySelectorAll('[data-view-option]')].map((o) =>
        o.getAttribute('data-view-option'),
      ),
    ).toEqual(['board', 'lane', 'date']);
    // Nothing remembered yet: Home opens on the Board.
    expect(container.querySelector('[data-month-board]')).not.toBeNull();
    // The stack stays beside or beneath it, as in the Lane view.
    expect(container.querySelector('[data-stack-card]')).not.toBeNull();
    // Home is my face, first on the strip, ringed: I am here.
    const home = container.querySelector('[data-home-foot] [data-home-tab]')!;
    expect(home.getAttribute('aria-current')).toBe('page');
    fireEvent.click(home);
    expect(container.querySelector('[data-month-board]')).toBeNull();
    expect(container.querySelector('[data-lane-piece]')).not.toBeNull();
    fireEvent.click(home);
    expect(container.querySelector('[data-pill]')).not.toBeNull();
    expect(
      container.querySelector('[data-view-option="date"]')!.getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.click(home);
    expect(container.querySelector('[data-month-board]')).not.toBeNull();
    expect(
      container.querySelector('[data-view-option="board"]')!.getAttribute('aria-selected'),
    ).toBe('true');
  });
});

describe('coming back from a post\u2019s page', () => {
  it('opens with the post the page sent it back to on top', () => {
    const { container } = ground(POSTS, null, null, LANES, null, 'stair', 'soup');
    expect(topCard(container).getAttribute('data-stack-card')).toBe('soup');
  });

  it('links the top card to its splash, which opens as a sheet over Home (review)', () => {
    const { container } = ground();
    expect(topCard(container).querySelector('[data-card-link]')!.getAttribute('href')).toBe(
      '/splash/late',
    );
  });

  it('finds the card that was on top in this tab when opened bare', async () => {
    window.sessionStorage.setItem('weming.home-top', 'early');
    const { container } = ground();
    await waitFor(() => expect(topCard(container).getAttribute('data-stack-card')).toBe('early'));
  });
});

describe('the top card\u2019s ripples as a thread (round 3)', () => {
  it('gives each ripple its own avatar and draws one line fewer than ripples', () => {
    const { container } = ground();
    fireEvent.click(container.querySelector('[data-board-pick=\"early\"]')!);
    return settled(container).then(() => {
      const thread = topCard(container).querySelector('[data-ripple-thread]')!;
      expect(thread.querySelectorAll('[data-thread-avatar]')).toHaveLength(3);
      expect(thread.querySelectorAll('[data-thread-line]')).toHaveLength(2);
    });
  });

  it('draws an avatar and no line for a single ripple', () => {
    const { container } = ground();
    const thread = topCard(container).querySelector('[data-ripple-thread]')!;
    expect(thread.querySelectorAll('[data-thread-avatar]')).toHaveLength(1);
    expect(thread.querySelectorAll('[data-thread-line]')).toHaveLength(0);
  });
});

describe('Just mine on Home (0014)', () => {
  function homeWith(columns: { id: string; name: string; monogram: string }[]) {
    const own = {
      ...post('own', 'Arnak notes', [block('own-b', '2026-09-20')]),
      ownPoolId: 'p-ours',
    };
    return render(
      <InputSheetProvider>
        <HomeGround
          initialView={homeView}
          cards={cards([...POSTS, own])}
          pinned={[]}
          categories={LANES}
          today={TODAY}
          timeZone={TZ}
          initials="YL"
          scrollToMonth={null}
          poolColumns={columns.map((c) => ({ ...c, icon: null, href: null }))}
        />
      </InputSheetProvider>,
    );
  }

  it('sits in a trailing column for its pool, headed by the pool’s monogram and name, unbadged', () => {
    const { container } = homeWith([{ id: 'pool:p-ours', name: 'Our Pool', monogram: 'Our Pool' }]);
    const headers = [...container.querySelectorAll('[data-lane-header]')].map((h) =>
      h.getAttribute('data-lane-header'),
    );
    expect(headers.at(-1)).toBe('pool:p-ours');
    const header = container.querySelector('[data-lane-header="pool:p-ours"]')!;
    expect(header.textContent).toContain('Our Pool');
    expect(header.querySelector('[data-monogram="OU"]')).not.toBeNull();
    const mark = container.querySelector('[data-lane-piece="own"][data-cell="pool:p-ours"]');
    expect(mark).not.toBeNull();
    expect(mark!.querySelector('[data-mark-pool]')).toBeNull();
  });

  it('reads "A pool you left" with a neutral tile once the pool is gone from me', () => {
    const { container } = homeWith([{ id: 'pool:p-ours', name: 'A pool you left', monogram: '' }]);
    const header = container.querySelector('[data-lane-header="pool:p-ours"]')!;
    expect(header.textContent).toContain('A pool you left');
    expect(header.querySelector('[data-monogram=""]')).not.toBeNull();
  });
});

describe('a post just dropped from a pool (review)', () => {
  function PoolDropper({ splash }: { splash: SplashSummary }) {
    const { markDropped } = useInputSheet();
    useEffect(
      () =>
        markDropped({
          splash,
          month: '2026-09',
          note: null,
          home: {
            card: {
              column: 'pool:p-ours',
              lane: { icon: '🎲', name: 'Our Pool' },
              pools: ['Our Pool'],
            },
            column: {
              id: 'pool:p-ours',
              name: 'Our Pool',
              icon: null,
              monogram: 'Our Pool',
              href: null,
            },
          },
        }),
      [splash, markDropped],
    );
    return null;
  }

  it('sits in its pool’s column at once, headed by the monogram, with the pool lane’s emoji', () => {
    // A joint splash written as a title alone: no ripple, no lane of mine.
    const shell = { ...post('shell', '테스트', []), declaredLaneId: null };
    const { container } = render(
      <InputSheetProvider>
        <PoolDropper splash={shell} />
        <HomeGround
          initialView={homeView}
          cards={cards(POSTS)}
          pinned={[]}
          categories={LANES}
          today={TODAY}
          timeZone={TZ}
          initials="YL"
          scrollToMonth={null}
        />
      </InputSheetProvider>,
    );
    const header = container.querySelector('[data-lane-header="pool:p-ours"]')!;
    expect(header.querySelector('[data-monogram="OU"]')).not.toBeNull();
    const mark = container.querySelector('[data-lane-piece="shell"][data-cell="pool:p-ours"]');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toContain('🎲');
  });
});

describe('?view= (review)', () => {
  it('opens Home on the view a lane page’s tab named, else the Calendar', async () => {
    const { homeViewParam } = await import('@/features/home/scope');
    const { poolViewParam } = await import('@/features/pool/pool-views');
    expect([
      homeViewParam('lane'),
      homeViewParam('date'),
      homeViewParam('board'),
      homeViewParam(undefined),
      homeViewParam('x'),
    ]).toEqual(['lane', 'date', 'board', 'board', 'board']);
    expect([
      poolViewParam('members'),
      poolViewParam('lane'),
      poolViewParam('date'),
      poolViewParam(undefined),
    ]).toEqual(['members', 'lane', 'date', 'board']);
  });
});

describe('author faces stay off Home (review)', () => {
  it('shows no author face on any piece or row', () => {
    homeView = 'lane';
    const lane = ground();
    expect(lane.container.querySelector('[data-board-author]')).toBeNull();
    cleanup();
    homeView = 'date';
    expect(ground().container.querySelector('[data-row-author-face]')).toBeNull();
  });
});
