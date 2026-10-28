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

/** Waits out `n` frames: a release that holds a corner settles over a few before it saves. */
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1)
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

/**
 * Where a part's top-left is drawn on the board, unturned: the laid-out
 * left and top of it and every box it sits in, up to the board, plus its
 * own translate. jsdom lays nothing out, but these are the engine's numbers.
 */
function drawnTopLeft(part: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (
    let el: HTMLElement | null = part;
    el && !el.hasAttribute('data-board-canvas');
    el = el.parentElement
  ) {
    x += parseFloat(el.style.left) || 0;
    y += parseFloat(el.style.top) || 0;
  }
  const shift = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(part.style.transform ?? '');
  return { x: x + Number(shift?.[1] ?? 0), y: y + Number(shift?.[2] ?? 0) };
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
    // The label moves, turns and widens; its text size is the toolbar's stepper.
    expect(q(container, '[data-edit-frame="label"]').dataset.editTools).toBe('move rotate width');
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

  it('sizes a sticker from its corner, one to one, its top-left held where it was', async () => {
    const { container } = home([
      card('s2', 'Lynn Canyon', '2026-10-22', { layout: { icon: { inline: false } } }),
      card('s1', 'Grand Austria Hotel', '2026-10-21'),
    ]);
    fireEvent.click(label(container, 's2'));
    const sticker = () => q(container, '[data-board-piece="s2"] [data-board-sticker]');
    const px = parseFloat(sticker().style.width);
    const before = drawnTopLeft(sticker());
    fireEvent.click(sticker());
    expect(q(container, '[data-edit-frame="icon"]').dataset.editTools).toBe('move rotate size');
    // 10px along each side: the corner 10px out, both ways.
    await drag(q(container, '[data-edit-handle="size"]'), [0, 0], [10, 10], { release: false });
    expect(parseFloat(sticker().style.width)).toBeCloseTo(px + 10, 0);
    // The engine centres a sticker on the label's corner; held, its top-left has not moved.
    const during = drawnTopLeft(sticker());
    expect(during.x).toBeCloseTo(before.x, 0);
    expect(during.y).toBeCloseTo(before.y, 0);
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10, pointerId: 1 });
    await frames(2);
    await settle();
    expect(saved).toHaveLength(1);
    const icon = (saved[0].patch as { icon: { size: number } }).icon;
    expect(icon.size).toBeCloseTo((px + 10) / LINE, 2);
  });

  it('a 20px corner drag on a 100px photo makes it about 120px, not a multiple', async () => {
    const path = 'a1/s2-0.webp';
    const { container } = home([
      card('s2', 'Lynn Canyon', '2026-10-22', {
        photos: [{ rippleId: 's2-b', path }],
        layout: { photos: { [path]: { size: 100 / COLUMN } } },
      }),
      card('s1', 'Grand Austria Hotel', '2026-10-21'),
    ]);
    const photo = () => q(container, `[data-board-photo-card="${path}"]`);
    expect(parseFloat(photo().style.width)).toBe(100);
    fireEvent.click(label(container, 's2'));
    fireEvent.click(photo());
    expect(q(container, '[data-edit-frame="photo"]')).not.toBeNull();
    const before = drawnTopLeft(photo());
    // The finger takes the corner 20px out along the photo's own diagonal —
    // a 4:3 placeholder until its image loads, so 20px right and 15px down.
    await drag(q(container, '[data-edit-handle="size"]'), [100, 100], [120, 115], {
      release: false,
    });
    const drawn = parseFloat(photo().style.width);
    expect(Math.abs(drawn - 120)).toBeLessThanOrEqual(1);
    const during = drawnTopLeft(photo());
    expect(during.x).toBeCloseTo(before.x, 0);
    expect(during.y).toBeCloseTo(before.y, 0);
    fireEvent.pointerUp(window, { clientX: 120, clientY: 115, pointerId: 1 });
    await frames(2);
    await settle();
    expect(saved).toHaveLength(1);
    const set = (saved[0].patch as { photos: Record<string, { size: number }> }).photos[path];
    expect(set.size).toBeCloseTo(120 / COLUMN, 2);
  });

  it('ignores a corner’s first 4px, then follows it', async () => {
    const path = 'a1/s2-0.webp';
    const { container } = home([
      card('s2', 'Lynn Canyon', '2026-10-22', {
        photos: [{ rippleId: 's2-b', path }],
        layout: { photos: { [path]: { size: 100 / COLUMN } } },
      }),
    ]);
    fireEvent.click(label(container, 's2'));
    fireEvent.click(q(container, `[data-board-photo-card="${path}"]`));
    await drag(q(container, '[data-edit-handle="size"]'), [100, 100], [102, 102]);
    await frames(12);
    await settle();
    expect(saved).toHaveLength(0);
  });

  it('widens a label from its right edge, the words rewrapping as it goes, once on release', async () => {
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    const before = parseFloat(label(container, 's2').style.width);
    await drag(q(container, '[data-edit-handle="width"]'), [0, 0], [70, 0], { release: false });
    const width = Number(((before + 70) / COLUMN).toFixed(2));
    // Laid out again at the new width as the finger moves.
    expect(parseFloat(label(container, 's2').style.width)).toBe(Math.round(width * COLUMN));
    expect(saved).toHaveLength(0);
    fireEvent.pointerUp(window, { clientX: 70, clientY: 0, pointerId: 1 });
    await settle();
    expect(saved).toHaveLength(1);
    expect(saved[0].patch).toEqual({ label: { width } });
  });

  it('tucks the width bar inside a label that reaches the board’s edge, where it would be clipped', () => {
    const edge = render(<Board cards={[card('sat', 'Saturday', '2026-10-24')]} canEdit />);
    fireEvent.click(label(edge.container, 'sat'));
    expect(q(edge.container, '[data-edit-handle="width"]').hasAttribute('data-inside')).toBe(true);
    edge.unmount();
    const mid = render(<Board cards={[card('wed', 'Wednesday', '2026-10-21')]} canEdit />);
    fireEvent.click(label(mid.container, 'wed'));
    expect(q(mid.container, '[data-edit-handle="width"]').hasAttribute('data-inside')).toBe(false);
  });

  it('gives a band along its days no width handle', () => {
    const { container } = render(
      <Board
        cards={[
          card('r1', 'Island trip', '2026-10-20', {
            splash: {
              ...card('r1', 'Island trip', '2026-10-20').splash,
              range: { start: '2026-10-20', end: '2026-10-22' },
            },
          }),
        ]}
        canEdit
      />,
    );
    const band = q(container, '[data-board-tape="r1"] [data-board-band]');
    fireEvent.click(band);
    expect(q(container, '[data-edit-frame="label"]').dataset.editTools).toBe('');
    expect(container.querySelector('[data-edit-handle="width"]')).toBeNull();
    expect(q(container, '[data-edit-text-value]')).not.toBeNull();
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

  it('sends a piece to the back from the toolbar: the Layer slider follows, saved after the rest, undoable', async () => {
    media(true);
    // Oct 21's label moved a lane right, over Oct 22's: the two overlap.
    const { container } = home([
      card('s2', 'Lynn Canyon', '2026-10-22'),
      card('s1', 'Grand Austria Hotel', '2026-10-21', { layout: { label: { x: 1 } } }),
    ]);
    fireEvent.click(label(container, 's2'));
    fireEvent.click(q(container, '[data-edit-more]'));
    const slider = () => q(container, '[data-layout-control="Layer"] input') as HTMLInputElement;
    expect(slider().value).toBe('0');
    // On top of what it overlaps: nothing to bring forward.
    expect(q(container, '[data-edit-layer="forward"]').hasAttribute('disabled')).toBe(true);
    expect(q(container, '[data-edit-layer="front"]').hasAttribute('disabled')).toBe(true);
    fireEvent.click(q(container, '[data-edit-layer="back"]'));
    expect(slider().value).toBe('-1');
    expect(Number(label(container, 's2').style.zIndex)).toBeLessThan(
      Number(label(container, 's1').style.zIndex),
    );
    expect(q(container, '[data-edit-layer="back"]').hasAttribute('disabled')).toBe(true);
    expect(saved).toHaveLength(0);
    await act(() => new Promise((resolve) => setTimeout(resolve, LAYOUT_SAVE_MS + 20)));
    expect(saved[0].patch).toEqual({ piece: { layer: -1 } });
    fireEvent.click(q(container, '[data-edit-undo]'));
    await settle();
    expect(saved[1]).toMatchObject({ patch: {}, clear: ['piece.layer'] });
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

describe('the rotate handle keeps off the piece’s other parts (review)', () => {
  const P0 = 'a1/s2-0.webp';
  const P1 = 'a1/s2-1.webp';
  /** On top: two photos (P0 the newest), the icon inline in their caption, and a wave. */
  const busy = (): Card[] => [
    card('s2', 'Lynn Canyon', '2026-10-22', {
      photos: [
        { rippleId: 's2-b', path: P0 },
        { rippleId: 's2-b', path: P1 },
      ],
      layout: { icon: { inline: false }, wave: { on: true } },
    }),
    card('s1', 'Grand Austria Hotel', '2026-10-21'),
  ];
  const box = (x: number, y: number, w: number, h: number): DOMRect =>
    ({
      x,
      y,
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
      toJSON: () => ({}),
    }) as DOMRect;
  /** jsdom lays nothing out: each element's box, as the test says, else nothing. */
  function boxes(of: (el: Element) => DOMRect | null): () => void {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return of(this) ?? original.call(this);
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }
  const PROBES: Record<string, DOMRect> = {
    top: box(0, -44, 44, 44),
    right: box(100, 0, 44, 44),
    bottom: box(0, 40, 44, 44),
    left: box(-44, 0, 44, 44),
  };
  const probe = (el: Element): DOMRect | null => {
    const side = el.getAttribute('data-edit-probe');
    return side ? PROBES[side] : null;
  };

  it('chips each part on the toolbar, the selected one in ink, and a chip selects its part', () => {
    const { container } = home(busy());
    fireEvent.click(label(container, 's2'));
    const chips = [...container.querySelectorAll<HTMLElement>('[data-edit-part-chip]')];
    // Photos carry the icon inline in their caption: no Icon chip.
    expect(chips.map((c) => c.textContent)).toEqual(['Label', 'Photo 1', 'Photo 2', 'Wave']);
    // The ink is on the chip's pill; the button around it is the 44px tap on a phone.
    const chip = (name: string) => q(container, `[data-edit-part-chip="${name}"] span`);
    expect(chip('Label').className).toContain('bg-ink');
    expect(q(container, '[data-edit-part-chip="Label"]').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Photo 1').className).not.toContain('bg-ink');
    expect(chip('Photo 1').className).toContain('text-pool-500');
    fireEvent.click(chip('Photo 2'));
    expect(q(container, `[data-board-piece="s2"] [data-edit-overlay="photo"]`).style.width).toBe(
      q(container, `[data-board-photo-card="${P1}"]`).style.width,
    );
    expect(chip('Photo 2').className).toContain('bg-ink');
    expect(chip('Label').className).not.toContain('bg-ink');
    fireEvent.click(chip('Wave'));
    expect(q(container, '[data-edit-frame="wave"]')).not.toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('chips a sticker set apart from the words as Icon', () => {
    const { container } = home([
      card('s2', 'Lynn Canyon', '2026-10-22', { layout: { icon: { inline: false } } }),
      card('s1', 'Grand Austria Hotel', '2026-10-21'),
    ]);
    fireEvent.click(label(container, 's2'));
    const chips = [...container.querySelectorAll<HTMLElement>('[data-edit-part-chip]')];
    expect(chips.map((c) => c.textContent)).toEqual(['Label', 'Icon']);
    fireEvent.click(q(container, '[data-edit-part-chip="Icon"]'));
    expect(q(container, '[data-edit-frame="icon"]')).not.toBeNull();
  });

  it('shows no chips on a piece with one part', () => {
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    expect(container.querySelector('[data-edit-toolbar]')).not.toBeNull();
    expect(container.querySelector('[data-edit-parts]')).toBeNull();
  });

  it('stands above the part, else right, below, left: the first spot clear of its siblings and its own handles', () => {
    const restore = boxes((el) => {
      if (el.matches(`[data-board-photo-card="${P0}"]`)) return box(0, -60, 44, 50);
      if (el.matches('[data-edit-handle="width"]')) return box(90, 0, 44, 44);
      return probe(el);
    });
    try {
      const { container } = home(busy());
      fireEvent.click(label(container, 's2'));
      const seat = q(container, '[data-edit-rotate-seat]');
      expect(seat.dataset.editRotateSeat).toBe('bottom');
      expect(seat.hasAttribute('data-clear')).toBe(true);
      // Its stem follows it: up from the handle to the outline.
      expect(seat.querySelector('span')!.className).toContain('bottom-1/2');
      expect(q(container, '[data-edit-handle="rotate"]').className).toContain('h-11');
    } finally {
      restore();
    }
  });

  it('stands above where it is when nothing is in the way', () => {
    const { container } = home(busy());
    fireEvent.click(label(container, 's2'));
    expect(q(container, '[data-edit-rotate-seat]').dataset.editRotateSeat).toBe('top');
  });

  it('shrinks to its dot where every side lies on a sibling', () => {
    const restore = boxes((el) =>
      el.matches(`[data-board-photo-card="${P0}"]`) ? box(-100, -100, 400, 400) : probe(el),
    );
    try {
      const { container } = home(busy());
      fireEvent.click(label(container, 's2'));
      const seat = q(container, '[data-edit-rotate-seat]');
      expect(seat.dataset.editRotateSeat).toBe('top');
      expect(seat.hasAttribute('data-clear')).toBe(false);
      expect(q(container, '[data-edit-handle="rotate"]').className).toContain('h-5');
    } finally {
      restore();
    }
  });

  it('a tap on the handle over a sibling selects the sibling; only a drag turns', async () => {
    const { container } = home(busy());
    fireEvent.click(label(container, 's2'));
    const photo = q(container, `[data-board-photo-card="${P0}"]`);
    const handle = q(container, '[data-edit-handle="rotate"]');
    const original = document.elementsFromPoint;
    document.elementsFromPoint = () => [handle, photo.firstElementChild ?? photo];
    try {
      const at = { clientX: 20, clientY: 20, pointerId: 1, pointerType: 'mouse', button: 0 };
      fireEvent.pointerDown(handle, at);
      // Under 8px: a tap.
      fireEvent.pointerMove(window, { ...at, clientX: 25 });
      fireEvent.pointerUp(window, { ...at, clientX: 25 });
      await settle();
      expect(q(container, '[data-edit-frame="photo"]')).not.toBeNull();
      expect(saved).toHaveLength(0);
    } finally {
      document.elementsFromPoint = original;
    }
  });
});

describe('the toolbar on a phone (review)', () => {
  function phoneWidth(): () => void {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 358,
    });
    return () => delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  }
  const PATH = 'a1/s2-0.webp';

  it('splits into the part chips over the rest, the board wide, with no layer buttons', () => {
    const restore = phoneWidth();
    try {
      const { container } = home([
        card('s2', 'Lynn Canyon', '2026-10-22', { photos: [{ rippleId: 's2-b', path: PATH }] }),
        card('s1', 'Grand Austria Hotel', '2026-10-21'),
      ]);
      fireEvent.click(label(container, 's2'));
      const bar = q(container, '[data-edit-toolbar]');
      expect(bar.hasAttribute('data-phone')).toBe(true);
      expect(bar.style.width).toBe('358px');
      const rows = [...bar.children].map((row) =>
        row.hasAttribute('data-edit-parts')
          ? 'parts'
          : row.hasAttribute('data-edit-actions')
            ? 'actions'
            : '?',
      );
      expect(rows).toEqual(['parts', 'actions']);
      expect(q(bar, '[data-edit-parts]').className).toContain('overflow-x-auto');
      const actions = q(bar, '[data-edit-actions]');
      expect(actions.querySelector('[data-edit-text-size]')).not.toBeNull();
      expect(actions.querySelector('[data-edit-undo]')).not.toBeNull();
      expect(actions.querySelector('[data-edit-more]')).not.toBeNull();
      expect(actions.querySelector('[data-edit-done]')).not.toBeNull();
      expect(bar.querySelector('[data-edit-layer]')).toBeNull();
      // A finger's taps, 44px.
      for (const button of bar.querySelectorAll('button'))
        expect(button.className).toMatch(/\bh-11\b/);
    } finally {
      restore();
    }
  });

  it('keeps the layer buttons in More, at the top under Layer, and a move there is saved', async () => {
    const restore = phoneWidth();
    try {
      const { container } = home([
        card('s2', 'Lynn Canyon', '2026-10-22'),
        card('s1', 'Grand Austria Hotel', '2026-10-21', { layout: { label: { x: 1 } } }),
      ]);
      fireEvent.click(label(container, 's2'));
      fireEvent.click(q(container, '[data-edit-more]'));
      const sheet = q(container, '[data-layout-sheet]');
      const body = q(sheet, '[data-layout-body]');
      expect(body.firstElementChild!.hasAttribute('data-layout-layers')).toBe(true);
      expect(q(sheet, '[data-layout-layers] h3').textContent).toBe('Layer');
      const layer = (how: string) => q(sheet, `[data-edit-layer="${how}"]`);
      expect(sheet.querySelectorAll('[data-edit-layer]')).toHaveLength(4);
      expect(layer('front').hasAttribute('disabled')).toBe(true);
      expect(layer('back').className).toContain('h-11');
      fireEvent.click(layer('back'));
      expect(layer('back').hasAttribute('disabled')).toBe(true);
      await act(() => new Promise((resolve) => setTimeout(resolve, LAYOUT_SAVE_MS + 20)));
      expect(saved[0].patch).toEqual({ piece: { layer: -1 } });
      // Let go, and More has no layers to offer.
      fireEvent.click(q(container, '[data-edit-done]'));
      expect(container.querySelector('[data-layout-layers]')).toBeNull();
    } finally {
      restore();
    }
  });

  it('keeps the layer buttons in the toolbar on a desktop', () => {
    media(true);
    const { container } = home();
    fireEvent.click(label(container, 's2'));
    const bar = q(container, '[data-edit-toolbar]');
    expect(bar.hasAttribute('data-phone')).toBe(false);
    expect(bar.querySelectorAll('[data-edit-layer]')).toHaveLength(4);
  });
});

describe('More on a phone: Undo and Done in its header, the chips when out of sight (review)', () => {
  function phoneWidth(): () => void {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 358,
    });
    return () => delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  }
  const PATH = 'a1/s2-0.webp';
  const pictured = (): Card[] => [
    card('s2', 'Lynn Canyon', '2026-10-22', { photos: [{ rippleId: 's2-b', path: PATH }] }),
    card('s1', 'Grand Austria Hotel', '2026-10-21', { layout: { label: { x: 1 } } }),
  ];
  function openMore(cards: Card[] = pictured()) {
    const view = home(cards);
    fireEvent.click(label(view.container, 's2'));
    fireEvent.click(q(view.container, '[data-edit-more]'));
    return view;
  }

  it('holds Undo, Done and Close in the header row, each a 44px tap', () => {
    const restore = phoneWidth();
    try {
      const { container } = openMore();
      const header = q(container, '[data-layout-sheet] header');
      const names = [...header.querySelectorAll('button')].map(
        (b) => b.getAttribute('aria-label') ?? b.textContent,
      );
      expect(names).toEqual(['Undo', 'Done', 'Close']);
      for (const button of header.querySelectorAll('button'))
        expect(button.className).toMatch(/\bh-11\b/);
    } finally {
      restore();
    }
  });

  it('Close closes the sheet and keeps the piece active; Done ends the editing and the sheet', () => {
    const restore = phoneWidth();
    try {
      const { container } = openMore();
      fireEvent.click(q(container, '[data-layout-sheet-close]'));
      expect(container.querySelector('[data-layout-sheet]')).toBeNull();
      expect(container.querySelector('[data-edit-toolbar]')).not.toBeNull();
      fireEvent.click(q(container, '[data-edit-more]'));
      fireEvent.click(q(container, '[data-layout-sheet-done]'));
      expect(container.querySelector('[data-layout-sheet]')).toBeNull();
      expect(container.querySelector('[data-edit-toolbar]')).toBeNull();
      expect(container.querySelector('[data-edit-frame]')).toBeNull();
    } finally {
      restore();
    }
  });

  it('undoes from the header, as the toolbar does', async () => {
    const restore = phoneWidth();
    try {
      const { container } = openMore([
        card('s2', 'Lynn Canyon', '2026-10-22'),
        card('s1', 'Grand Austria Hotel', '2026-10-21', { layout: { label: { x: 1 } } }),
      ]);
      const undo = () => q(container, '[data-layout-sheet-undo]');
      expect(undo().hasAttribute('disabled')).toBe(true);
      fireEvent.click(q(container, '[data-layout-layers] [data-edit-layer="back"]'));
      await act(() => new Promise((resolve) => setTimeout(resolve, LAYOUT_SAVE_MS + 20)));
      expect(saved[0].patch).toEqual({ piece: { layer: -1 } });
      expect(undo().hasAttribute('disabled')).toBe(false);
      fireEvent.click(undo());
      await settle();
      expect(saved[1]).toMatchObject({ patch: {}, clear: ['piece.layer'] });
    } finally {
      restore();
    }
  });

  it('adds the chips to its top when the toolbar’s row is not in sight, and a chip there selects', () => {
    const restore = phoneWidth();
    try {
      // jsdom lays nothing out: the toolbar's row has no height, so is not in sight.
      const { container } = openMore();
      const body = q(container, '[data-layout-body]');
      expect(body.firstElementChild!.hasAttribute('data-layout-parts')).toBe(true);
      const chips = [...body.querySelectorAll('[data-layout-parts] [data-edit-part-chip]')];
      expect(chips.map((c) => c.textContent)).toEqual(['Label', 'Photo 1']);
      expect(chips[0].className).toContain('h-11');
      fireEvent.click(chips[1]);
      expect(q(container, '[data-edit-frame="photo"]')).not.toBeNull();
      expect(q(body, '[data-edit-part-chip="Photo 1"]').getAttribute('aria-pressed')).toBe('true');
    } finally {
      restore();
    }
  });

  it('leaves the chips to the toolbar when its row shows whole above the sheet', () => {
    const restore = phoneWidth();
    const original = Element.prototype.getBoundingClientRect;
    const at = (top: number, height: number): DOMRect =>
      ({
        top,
        bottom: top + height,
        height,
        left: 0,
        right: 358,
        width: 358,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.hasAttribute('data-layout-sheet')) return at(420, 420);
      if (this.hasAttribute('data-edit-parts') && this.closest('[data-edit-toolbar]'))
        return at(360, 44);
      return original.call(this);
    };
    try {
      const { container } = openMore();
      expect(container.querySelector('[data-layout-parts]')).toBeNull();
    } finally {
      Element.prototype.getBoundingClientRect = original;
      restore();
    }
  });
});
