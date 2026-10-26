// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const saved: { splashId: string; poolId: string | null; patch: unknown; clear: string[] }[] = [];
const reverted: string[] = [];
vi.mock('@/features/month-board/actions', () => ({
  setBoardLayout: (input: (typeof saved)[number]) => {
    saved.push(input);
    return Promise.resolve({ ok: true, layout: {} });
  },
  revertToPoolLayout: (id: string) => {
    reverted.push(id);
    return Promise.resolve({ ok: true, layout: {} });
  },
}));
vi.mock('@/lib/media', () => ({ signBoardPhotos: () => Promise.resolve({}) }));
vi.mock('@/features/splash/actions', () => ({
  setSplashPinned: () => Promise.resolve({ ok: true }),
  deleteSplash: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/ripple-sheet/actions', () => ({
  deleteRipple: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/lanes/actions', () => ({
  saveLane: () => Promise.resolve({ ok: true }),
  reorderLanes: () => Promise.resolve({ ok: true }),
  deleteLane: () => Promise.resolve({ ok: true }),
}));

import { placeCard, type Card } from '@/features/home/grid';
import { HomeGround } from '@/features/home/home-ground';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import type { BoardLayoutJson } from '@/features/month-board/board-layout';
import { layoutWeekBoard } from '@/features/month-board/layout';
import { MonthBoard } from '@/features/month-board/month-board';
import { LAYOUT_SAVE_MS } from '@/features/month-board/use-layout-drafts';
import { summarizeSplash, type Splash } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const TODAY = '2026-10-23';
const LANES: MyCategory[] = [
  {
    id: 'c-food',
    user_id: 'a1',
    name: 'Food',
    icon: '🍜',
    default_mode: 'drop',
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
  },
];

function card(id: string, title: string, day: string, over: Partial<Card> = {}): Card {
  const splash = summarizeSplash(
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
    } as Splash),
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
    new Date('2026-10-26T20:00:00.000Z'),
  );
  return { ...placeCard(splash, '', TZ), ...over };
}

function media(wide: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: wide && query.includes('min-width'),
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

function home(cards: Card[]) {
  return render(
    <InputSheetProvider>
      <HomeGround
        cards={cards}
        pinned={[]}
        categories={LANES}
        today={TODAY}
        timeZone={TZ}
        initials="YL"
        scrollToMonth={null}
      />
    </InputSheetProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  saved.length = 0;
  reverted.length = 0;
  Element.prototype.scrollTo = function scrollTo() {} as Element['scrollTo'];
  Element.prototype.scrollIntoView = function scrollIntoView() {} as Element['scrollIntoView'];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ONE = [card('s1', 'Grand Austria Hotel', '2026-10-21')];

describe('the Layout panel (review)', () => {
  it('sits under the stack on a desktop, folded to one row, for the top card', () => {
    media(true);
    const { container } = home(ONE);
    const panel = container.querySelector('[data-layout-panel]')!;
    expect(panel.getAttribute('data-layout-panel')).toBe('s1');
    expect(panel.querySelector('[data-layout-body]')).toBeNull();
    fireEvent.click(panel.querySelector('[data-layout-toggle]')!);
    expect(panel.querySelector('[data-layout-body]')).not.toBeNull();
    for (const group of ['Icon', 'Label', 'Wave']) {
      expect(panel.querySelector(`[data-layout-group="${group}"]`)).not.toBeNull();
    }
  });

  it('is absent at a phone’s width, the layouts still drawn there', () => {
    media(false);
    const laid = [
      card('s1', 'Grand Austria Hotel', '2026-10-21', { layout: { label: { x: 0.2, tilt: 4 } } }),
    ];
    const { container } = home(laid);
    expect(container.querySelector('[data-layout-panel]')).toBeNull();
    const label = container.querySelector<HTMLElement>(
      '[data-board-piece="s1"] [data-board-label]',
    )!;
    expect(label.style.transform).toMatch(/translate\(.*\) rotate\(4deg\)/);
  });

  it('moves the board at once as a slider moves, and saves when it rests', async () => {
    vi.useFakeTimers();
    media(true);
    const { container } = home(ONE);
    fireEvent.click(container.querySelector('[data-layout-toggle]')!);
    const tilt = container.querySelector<HTMLInputElement>('input[aria-label="Label tilt"]')!;
    fireEvent.change(tilt, { target: { value: '7' } });
    const label = container.querySelector<HTMLElement>(
      '[data-board-piece="s1"] [data-board-label]',
    )!;
    expect(label.style.transform).toContain('rotate(7deg)');
    expect(saved).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(LAYOUT_SAVE_MS);
      await Promise.resolve();
    });
    expect(saved).toEqual([
      { splashId: 's1', poolId: null, patch: { label: { tilt: 7 } }, clear: [] },
    ]);
  });

  it('says whose layout Home draws, and gives a joint splash back to its pool’s', () => {
    media(true);
    const joint = card('j1', 'Ours', '2026-10-21', {
      joint: true,
      layout: { label: { y: 1 } },
      layoutSource: 'home',
      poolLayout: { label: { y: -1 } },
    });
    const { container } = home([joint]);
    fireEvent.click(container.querySelector('[data-layout-toggle]')!);
    expect(container.querySelector('[data-layout-source]')!.textContent).toBe('Home override');
    fireEvent.click(container.querySelector('[data-layout-use-pool]')!);
    expect(reverted).toEqual(['j1']);
    expect(container.querySelector('[data-layout-source]')!.textContent).toBe('Using pool layout');
  });
});

function board(cards: Card[]) {
  return render(
    <MonthBoard
      cards={cards}
      month="2026-10"
      onMonth={() => {}}
      today={TODAY}
      onPick={() => {}}
      lanes={LANES}
    />,
  );
}

describe('hand-set layouts on the calendar (review)', () => {
  it('draws no wave by default; one wave path with the chosen weight and length when on', () => {
    media(false);
    expect(board(ONE).container.querySelector('[data-board-wave]')).toBeNull();
    cleanup();
    const wave: BoardLayoutJson = { wave: { on: true, weight: 3, span: 0.5 } };
    const { container } = board([{ ...ONE[0], layout: wave }]);
    const waves = container.querySelectorAll('[data-board-wave]');
    expect(waves).toHaveLength(1);
    const path = waves[0].querySelector('path')!;
    expect(path.getAttribute('stroke-width')).toBe('3');
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    expect(path.getAttribute('stroke-opacity')).toBe('0.8');
    const label = container.querySelector<HTMLElement>('[data-board-label]')!;
    expect(Number(waves[0].getAttribute('width'))).toBeCloseTo(
      parseFloat(label.style.width) * 0.5,
      1,
    );
    cleanup();
    expect(
      board([{ ...ONE[0], layout: {} }]).container.querySelector('[data-board-wave]'),
    ).toBeNull();
  });

  it('grows the label with its text: at 18px the title fits whole, and the label is taller than at 10', () => {
    const at = (fontSize: number) =>
      layoutWeekBoard([{ ...ONE[0], layout: { label: { fontSize } } }], TODAY, { width: 980 })
        .pieces[0];
    const big = at(18);
    const small = at(10);
    expect(big.type.size).toBe(18);
    expect(big.type.lines).toBe(4);
    // Whole: fewer lines than its cap, so no ellipsis.
    expect(big.captionLines).toBeLessThan(big.type.lines);
    expect(big.labelBox.h).toBe(big.pad.top + big.captionLines * big.type.line + big.pad.bottom);
    expect(big.labelBox.h).toBeGreaterThan(small.labelBox.h);
    // On a phone: scaled by the boards' base ratio, never under the floor.
    expect(
      layoutWeekBoard([{ ...ONE[0], layout: { label: { fontSize: 10 } } }], TODAY, { width: 358 })
        .pieces[0].type.size,
    ).toBeGreaterThanOrEqual(10);
  });

  it('lets Inline pick the recipe and a hand-set size fix the sticker', () => {
    const b = layoutWeekBoard(
      [{ ...ONE[0], layout: { icon: { inline: false, size: 3 } } }],
      TODAY,
      {
        width: 980,
      },
    ).pieces[0];
    expect(b.recipe).toBe('B');
    expect(b.stickerBox!.w).toBe(Math.round(3 * b.type.line));
    const a = layoutWeekBoard([{ ...ONE[0], layout: { icon: { inline: true } } }], TODAY, {
      width: 980,
    }).pieces[0];
    expect(a.recipe).toBe('A');
  });
});
