// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshed = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: refreshed }),
}));
type Sent = { splashId: string; poolId: string | null; patch: unknown; clear: string[] };
const sent: Sent[] = [];
let answer: (sent: Sent) => Promise<unknown> = async () => ({ ok: true, layout: {} });
const reverted: string[] = [];
vi.mock('@/features/month-board/actions', () => ({
  setBoardLayout: (input: Sent) => {
    sent.push(input);
    return answer(input);
  },
  revertToPoolLayout: (id: string) => {
    reverted.push(id);
    return Promise.resolve({ ok: true, layout: {} });
  },
}));

import type { Card } from '@/features/home/grid';
import { LAYOUT_SAVE_MS, useLayoutDrafts } from '@/features/month-board/use-layout-drafts';

/** A card as far as the hook reads one: its id and what was saved. */
function card(id: string, over: Partial<Card> = {}): Card {
  return { splash: { id }, ...over } as unknown as Card;
}

/** The hook as the panel holds it; `api()` reads its latest answer. */
function mount(cards: Card[], poolId: string | null) {
  const { result } = renderHook(() => useLayoutDrafts(cards, poolId));
  return () => result.current;
}
const SAVED = card('s1', { layout: { label: { x: 0.1 } }, layoutSource: 'pool' });

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  reverted.length = 0;
  refreshed.mockClear();
  answer = async () => ({ ok: true, layout: {} });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function rest(ms = LAYOUT_SAVE_MS): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('the Layout panel’s drafts (review)', () => {
  it('draws an edit on the board at once, before anything is saved', () => {
    const api = mount([SAVED], 'p1');
    act(() => api().edit('s1', { label: { tilt: 5 } }));
    expect(api().drawn[0].layout).toEqual({ label: { x: 0.1, tilt: 5 } });
    expect(api().unsaved).toEqual(['s1']);
    expect(sent).toHaveLength(0);
  });

  it('saves once the sliders rest 400ms, the edits gathered since as one', async () => {
    const api = mount([SAVED], 'p1');
    act(() => api().edit('s1', { label: { tilt: 5 } }));
    await rest(LAYOUT_SAVE_MS - 1);
    act(() => api().edit('s1', { icon: { size: 2 } }));
    await rest(LAYOUT_SAVE_MS - 1);
    expect(sent).toHaveLength(0);
    act(() => api().edit('s1', { icon: { x: 0.2 } }, ['label.x']));
    await rest();
    expect(sent).toEqual([
      {
        splashId: 's1',
        poolId: 'p1',
        // The Calendar's, unless the drafts are the Lane view's (0045).
        view: 'calendar',
        patch: { label: { tilt: 5 }, icon: { size: 2, x: 0.2 } },
        clear: ['label.x'],
      },
    ]);
  });

  it('forgets a pending clear when the field is set again', async () => {
    const api = mount([SAVED], 'p1');
    act(() => api().edit('s1', {}, ['label.x']));
    act(() => api().edit('s1', { label: { x: 0.3 } }));
    await rest();
    expect(sent[0].clear).toEqual([]);
    expect(sent[0].patch).toEqual({ label: { x: 0.3 } });
  });

  it('drops a draft once its save is confirmed, re-reading the page', async () => {
    const api = mount([SAVED], 'p1');
    act(() => api().edit('s1', { label: { tilt: 5 } }));
    await rest();
    await act(async () => {
      await Promise.resolve();
    });
    expect(api().unsaved).toEqual([]);
    expect(refreshed).toHaveBeenCalled();
  });

  it('drops a draft once its save is refused, falling back to what was saved and saying why', async () => {
    answer = async () => ({
      ok: false,
      message: 'Only a current member of this Pool can change its layout.',
    });
    const api = mount([SAVED], 'p1');
    act(() => api().edit('s1', { label: { tilt: 5 } }));
    await rest();
    await act(async () => {
      await Promise.resolve();
    });
    expect(api().unsaved).toEqual([]);
    expect(api().message).toBe('Only a current member of this Pool can change its layout.');
    expect(api().drawn[0].layout).toEqual({ label: { x: 0.1 } });
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('keeps an edit made while a save is out, and sends it after', async () => {
    let release: (value: unknown) => void = () => {};
    answer = () => new Promise((resolve) => (release = resolve));
    const api = mount([SAVED], 'p1');
    act(() => api().edit('s1', { label: { tilt: 5 } }));
    await rest();
    expect(sent).toHaveLength(1);
    act(() => api().edit('s1', { label: { tilt: 9 } }));
    await act(async () => {
      release({ ok: true, layout: {} });
      await Promise.resolve();
    });
    expect(api().unsaved).toEqual(['s1']);
    expect(api().drawn[0].layout?.label?.tilt).toBe(9);
    answer = async () => ({ ok: true, layout: {} });
    await rest();
    expect(sent).toHaveLength(2);
    expect(sent[1].patch).toEqual({ label: { tilt: 9 } });
  });

  it('writes my Home layout on Home, and "Use pool layout" draws the pool’s at once', async () => {
    const home = card('s2', {
      layout: { label: { y: 2 } },
      layoutSource: 'home',
      poolLayout: { label: { y: -1 } },
    });
    const api = mount([home], null);
    act(() => api().edit('s2', { label: { tilt: 3 } }));
    expect(api().shown('s2').source).toBe('home');
    await rest();
    expect(sent[0].poolId).toBeNull();
    await act(async () => {
      api().revertToPool('s2');
      await Promise.resolve();
    });
    expect(reverted).toEqual(['s2']);
  });
});
