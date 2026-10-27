// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
type Saved = { splashId: string; poolId: string | null; patch: unknown; clear: string[] };
const saved: Saved[] = [];
let answer: (input: Saved) => Promise<unknown> = async () => ({ ok: true, layout: {} });
vi.mock('@/features/month-board/actions', () => ({
  setBoardLayout: (input: Saved) => {
    saved.push(input);
    return answer(input);
  },
  revertToPoolLayout: () => Promise.resolve({ ok: true, layout: {} }),
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
import { MonthBoard } from '@/features/month-board/month-board';
import { useBoardEditing, useLayoutHistory } from '@/features/month-board/use-board-editing';
import { LAYOUT_SAVE_MS, useLayoutDrafts } from '@/features/month-board/use-layout-drafts';
import { ThemeProvider } from '@/features/people/theme-provider';
import { summarizeSplash, type Splash } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import { DEFAULT_THEME } from '@/lib/theme';
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
/** A week board is laid out at 980px when jsdom measures nothing: seven 140px lanes; 10px type on 13px lines. */
const COLUMN = 140;
const LINE = 13;

function card(id: string, title: string, day: string, over: Partial<Card> = {}): Card {
  const splash = summarizeSplash(
    written({
      id,
      owner_id: 'a1',
      title,
      declared_start: day,
      declared_end: null,
      declared_lane_id: 'c-food',
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

/** Newest first: s2 is on top when Home opens. */
const TWO = [
  card('s2', 'Lynn Canyon', '2026-10-22'),
  card('s1', 'Grand Austria Hotel', '2026-10-21'),
];

function home(cards: Card[] = TWO) {
  return render(
    <ThemeProvider initial={DEFAULT_THEME}>
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
      </InputSheetProvider>
    </ThemeProvider>,
  );
}

/** The Calendar alone, its editing as a ground holds it, with or without the right to edit. */
function Board({ cards, canEdit }: { cards: Card[]; canEdit: boolean }) {
  const [top, setTop] = useState(cards[0].splash.id);
  const history = useLayoutHistory();
  const drafts = useLayoutDrafts(cards, 'p1', 'calendar', history.recorders.calendar);
  const editing = useBoardEditing({
    drafts,
    history,
    view: 'calendar',
    topId: top,
    canEdit,
    onPick: setTop,
    onMore: () => {},
  });
  return (
    <div data-top={top}>
      <MonthBoard
        cards={drafts.drawn}
        month="2026-10"
        onMonth={() => {}}
        today={TODAY}
        onPick={setTop}
        lanes={LANES}
        editing={editing}
      />
    </div>
  );
}

const q = (root: ParentNode, selector: string): HTMLElement =>
  root.querySelector(selector) as HTMLElement;
const label = (root: ParentNode, id: string): HTMLElement =>
  q(root, `[data-board-piece="${id}"] [data-board-label]`);

/** Lets a save at once (a release, an undo) leave, and its answer land. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

/** One finger or mouse, down on `target`, through the window to `to`, and up. */
async function drag(
  target: Element,
  from: [number, number],
  to: [number, number],
  { release = true } = {},
): Promise<void> {
  const at = (x: number, y: number) => ({
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
  });
  fireEvent.pointerDown(target, at(...from));
  fireEvent.pointerMove(window, at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2));
  fireEvent.pointerMove(window, at(...to));
  // A frame, so the held change is drawn.
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  if (release) fireEvent.pointerUp(window, at(...to));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  saved.length = 0;
  answer = async () => ({ ok: true, layout: {} });
  Element.prototype.scrollTo = function scrollTo() {} as Element['scrollTo'];
  Element.prototype.scrollIntoView = function scrollIntoView() {} as Element['scrollIntoView'];
  media(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('direct manipulation: which tap does what (review, 2026-10-27)', () => {
  it('a first tap brings the record to the top without handles; a second shows them', () => {
    const { container } = home();
    expect(q(container, '[data-stack-card="s2"]').dataset.stair).toBe('top');
    fireEvent.click(label(container, 's1'));
    expect(q(container, '[data-stack-card="s1"]').dataset.stair).toBe('top');
    expect(container.querySelector('[data-edit-frame]')).toBeNull();
    expect(container.querySelector('[data-edit-toolbar]')).toBeNull();
    fireEvent.click(label(container, 's1'));
    expect(q(container, '[data-board-piece="s1"] [data-edit-frame="label"]')).not.toBeNull();
    expect(q(container, '[data-board-piece="s1"] [data-edit-toolbar]')).not.toBeNull();
    // The label moves and turns; its size is the toolbar's stepper.
    expect(q(container, '[data-edit-frame="label"]').dataset.editTools).toBe('move rotate');
    expect(q(container, '[data-edit-text-value]').textContent).toBe('10');
  });

  it('lets go on a tap on empty board, on Escape, on Done, and on a tap on another piece', () => {
    const { container } = home();
    const frame = () => container.querySelector('[data-edit-frame]');
    fireEvent.click(label(container, 's2'));
    expect(frame()).not.toBeNull();
    fireEvent.click(q(container, '[data-board-canvas]'));
    expect(frame()).toBeNull();

    fireEvent.click(label(container, 's2'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(frame()).toBeNull();

    fireEvent.click(label(container, 's2'));
    fireEvent.click(q(container, '[data-edit-done]'));
    expect(frame()).toBeNull();

    // Another piece comes to the top, with no handles.
    fireEvent.click(label(container, 's2'));
    fireEvent.click(label(container, 's1'));
    expect(frame()).toBeNull();
    expect(q(container, '[data-stack-card="s1"]').dataset.stair).toBe('top');
  });

  it('never shows handles on a piece I cannot edit: a second tap does what a first does', () => {
    const { container } = render(<Board cards={TWO} canEdit={false} />);
    fireEvent.click(label(container, 's2'));
    fireEvent.click(label(container, 's2'));
    expect(container.querySelector('[data-edit-frame]')).toBeNull();
    expect(container.querySelector('[data-edit-toolbar]')).toBeNull();
    fireEvent.click(label(container, 's1'));
    expect(q(container, '[data-top]').dataset.top).toBe('s1');
    expect(container.querySelector('[data-edit-frame]')).toBeNull();
  });
});

describe('direct manipulation: handles write layout units, once on release', () => {
  it('drags the label: the screen follows the finger, one save on release, in lanes and lines', async () => {
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    await drag(
      q(container, '[data-edit-frame="label"]'),
      [100, 100],
      [100 + COLUMN / 2, 100 + 2 * LINE],
      {
        release: false,
      },
    );
    expect(label(container, 's2').style.transform).toBe(
      `translate(${COLUMN / 2}px, ${2 * LINE}px)`,
    );
    expect(saved).toHaveLength(0);
    fireEvent.pointerUp(window, { clientX: 170, clientY: 126, pointerId: 1 });
    await settle();
    expect(saved).toEqual([
      {
        splashId: 's2',
        poolId: null,
        patch: { label: { x: 0.5, y: 2 } },
        clear: [],
        view: 'calendar',
      },
    ]);
    // Said in the toolbar, not a toast.
    expect(q(container, '[data-edit-status]').textContent).toBe('Saved');
  });

  it('turns the label on the rotate handle, snapping to straight within 3 degrees, clamped to 45', async () => {
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    // jsdom draws nothing: the pivot reads at the origin, so angles are about (0, 0).
    await drag(q(container, '[data-edit-handle="rotate"]'), [0, -50], [50, 0]);
    await settle();
    expect(saved.at(-1)!.patch).toEqual({ label: { tilt: 45 } });
    // Saved, the card reads its props again (the test's refresh brings nothing):
    // from straight, 2° on — within the snap, so straight.
    const near = (-88 * Math.PI) / 180;
    await drag(
      q(container, '[data-edit-handle="rotate"]'),
      // Far from the pivot, so 2° is past the 8px a drag must travel.
      [0, -500],
      [500 * Math.cos(near), 500 * Math.sin(near)],
    );
    await settle();
    expect(saved.at(-1)!.patch).toEqual({ label: { tilt: 0 } });
    expect(saved).toHaveLength(2);
  });

  it('sizes a sticker from its corner, in the board’s line heights', async () => {
    const { container } = home([
      card('s2', 'Lynn Canyon', '2026-10-22', { layout: { icon: { inline: false } } }),
      card('s1', 'Grand Austria Hotel', '2026-10-21'),
    ]);
    fireEvent.click(label(container, 's2'));
    const sticker = q(container, '[data-board-piece="s2"] [data-board-sticker]');
    const px = parseFloat(sticker.style.width);
    fireEvent.click(sticker);
    expect(q(container, '[data-edit-frame="icon"]').dataset.editTools).toBe('move rotate size');
    // Twice as far from the centre: twice the size.
    await drag(q(container, '[data-edit-handle="size"]'), [10, 10], [20, 20]);
    await settle();
    expect(saved.at(-1)!.patch).toEqual({
      icon: { size: Number(((px * 2) / LINE).toFixed(2)) },
    });
  });

  it('steps the text size from the toolbar, saved after the rest like a slider', async () => {
    vi.useFakeTimers();
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    fireEvent.click(q(container, '[data-edit-text-larger]'));
    fireEvent.click(q(container, '[data-edit-text-larger]'));
    expect(q(container, '[data-edit-text-value]').textContent).toBe('12');
    expect(saved).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(LAYOUT_SAVE_MS);
      await Promise.resolve();
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].patch).toEqual({ label: { fontSize: 12 } });
  });

  it('moves nothing when the piece is not active: no frame, no save', async () => {
    const { container } = home();
    await drag(label(container, 's1'), [100, 100], [200, 200]);
    await settle();
    expect(saved).toHaveLength(0);
    expect(label(container, 's1').style.transform).toBe('');
  });
});

describe('direct manipulation: undo', () => {
  it('puts back the previous value and saves it — a field that was Auto is Auto again', async () => {
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    expect(q(container, '[data-edit-undo]').hasAttribute('disabled')).toBe(true);
    await drag(q(container, '[data-edit-frame="label"]'), [100, 100], [170, 126]);
    await settle();
    expect(saved).toHaveLength(1);
    fireEvent.click(q(container, '[data-edit-undo]'));
    await settle();
    expect(saved[1]).toMatchObject({ splashId: 's2', patch: {}, clear: ['label.x', 'label.y'] });
    // Nothing left to undo; the undo was not itself a change.
    expect(q(container, '[data-edit-undo]').hasAttribute('disabled')).toBe(true);
  });

  it('undoes on Cmd/Ctrl+Z, setting a hand-set value back', async () => {
    const { container } = home([
      card('s2', 'Lynn Canyon', '2026-10-22', { layout: { label: { x: 0.2 } } }),
      card('s1', 'Grand Austria Hotel', '2026-10-21'),
    ]);
    fireEvent.click(label(container, 's2'));
    await drag(q(container, '[data-edit-frame="label"]'), [100, 100], [170, 100 + LINE]);
    await settle();
    expect(saved[0].patch).toEqual({ label: { x: 0.7, y: 1 } });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await settle();
    expect(saved[1]).toMatchObject({ patch: { label: { x: 0.2 } }, clear: ['label.y'] });
  });

  it('nudges on the arrows and turns on the brackets (desktop keyboard)', async () => {
    vi.useFakeTimers();
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: ']' });
    await act(async () => {
      vi.advanceTimersByTime(LAYOUT_SAVE_MS);
      await Promise.resolve();
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].patch).toEqual({ label: { x: 0.1, y: 0.1, tilt: 1 } });
  });

  it('says why in a refusal, and takes the change back', async () => {
    answer = async () => ({ ok: false, message: 'The layout could not be saved.' });
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    await drag(q(container, '[data-edit-frame="label"]'), [100, 100], [170, 100]);
    await settle();
    expect(label(container, 's2').style.transform).toBe('');
    expect(q(container, '[data-edit-undo]').hasAttribute('disabled')).toBe(true);
  });
});

describe('direct manipulation: the page around it', () => {
  it('turns the week on a swipe with no piece active, never while one is; the arrows still do', () => {
    const { container } = render(<Board cards={TWO} canEdit />);
    const key = () => q(container, '[data-month-board]').dataset.monthBoard;
    const scroller = q(container, '[data-board-scroller]');
    const swipe = (): void => {
      fireEvent.touchStart(scroller, { touches: [{ clientX: 200, clientY: 300 }] });
      fireEvent.touchMove(scroller, { touches: [{ clientX: 100, clientY: 310 }] });
      fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 100, clientY: 310 }] });
    };
    expect(key()).toBe('2026-10-18');
    swipe();
    expect(key()).toBe('2026-10-25');
    fireEvent.click(q(container, '[data-board-prev]'));
    fireEvent.click(label(container, 's2'));
    expect(container.querySelector('[data-edit-frame]')).not.toBeNull();
    swipe();
    expect(key()).toBe('2026-10-18');
    fireEvent.click(q(container, '[data-board-next]'));
    expect(key()).toBe('2026-10-25');
  });

  it('on a phone, folds the stack to its title strip while a piece is active, and brings it back', () => {
    const { container } = home();
    expect(container.querySelector('[data-stack-collapsed]')).toBeNull();
    fireEvent.click(label(container, 's2'));
    const strip = q(container, '[data-stack-collapsed="s2"]');
    expect(strip.style.height).toBe('44px');
    expect(strip.textContent).toContain('Lynn Canyon');
    expect(container.querySelector('[data-stack]')).toBeNull();
    fireEvent.click(q(container, '[data-edit-done]'));
    expect(container.querySelector('[data-stack-collapsed]')).toBeNull();
    expect(container.querySelector('[data-stack]')).not.toBeNull();
  });

  it('opens More as a sheet of every slider on a phone, the panel on a desktop', () => {
    const phone = home();
    fireEvent.click(label(phone.container, 's2'));
    fireEvent.click(q(phone.container, '[data-edit-more]'));
    const sheet = q(phone.container, '[data-layout-sheet="s2"]');
    for (const name of ['Label X', 'Label Y', 'Label tilt', 'Text size', 'Width', 'X', 'Layer']) {
      expect(sheet.querySelector(`[data-layout-control="${name}"]`), name).not.toBeNull();
    }
    expect(sheet.querySelector('[data-layout-reset-all]')).not.toBeNull();
    phone.unmount();

    media(true);
    const desk = home();
    fireEvent.click(label(desk.container, 's2'));
    expect(desk.container.querySelector('[data-layout-body]')).toBeNull();
    fireEvent.click(q(desk.container, '[data-edit-more]'));
    expect(q(desk.container, '[data-layout-panel="s2"] [data-layout-body]')).not.toBeNull();
    expect(desk.container.querySelector('[data-layout-sheet]')).toBeNull();
  });

  it('moves the slider as the handle moves: one value, two controls', async () => {
    media(true);
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    fireEvent.click(q(container, '[data-edit-more]'));
    await drag(q(container, '[data-edit-frame="label"]'), [100, 100], [170, 100], {
      release: false,
    });
    const slider = q(container, '[data-layout-control="Label X"] input') as HTMLInputElement;
    expect(slider.value).toBe('0.5');
    fireEvent.pointerUp(window, { clientX: 170, clientY: 100, pointerId: 1 });
    await settle();
  });
});
