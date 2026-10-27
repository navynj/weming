// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  usePathname: () => '/lane/c-food',
  useRouter: () => ({
    push: (to: string) => pushed.push(to),
    replace: () => {},
    refresh: () => {},
  }),
}));
const saved: unknown[] = [];
vi.mock('@/features/splash/actions', () => ({
  setSplashPinned: () => Promise.resolve({ ok: true }),
  deleteSplash: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/ripple-sheet/actions', () => ({
  deleteRipple: () => Promise.resolve({ ok: true }),
}));
const poolSaved: unknown[] = [];
vi.mock('@/features/pool/actions', () => ({
  savePoolLane: (lane: unknown) => {
    poolSaved.push(lane);
    return Promise.resolve({ ok: true });
  },
  deleteJointSplash: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/lanes/actions', () => ({
  saveLane: (lane: unknown) => {
    saved.push(lane);
    return Promise.resolve({ ok: true });
  },
}));

import { byNewest, placeCard, type Card } from '@/features/home/grid';
import { LanePage } from '@/features/lanes/lane-page';
import { summarizeSplash, type SplashBlock } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import { InputSheetProvider, useInputSheet } from '@/features/input-sheet/sheet-provider';
import { written } from './written-on';

afterEach(cleanup);
beforeEach(() => {
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

const TZ = 'America/Vancouver';
const NOW = new Date('2026-10-22T20:00:00.000Z');
const FOOD: MyCategory = {
  id: 'c-food',
  user_id: 'a1',
  name: 'Food',
  icon: '🍜',
  default_mode: 'drop',
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
};
function post(id: string, title: string, day: string) {
  const block: SplashBlock = {
    id: `${id}-b`,
    note: id,
    occurred_on: day,
    occurred_time: null,
    created_at: `${day}T16:00:00.000Z`,
  };
  return summarizeSplash(
    written({
      id,
      owner_id: 'a1',
      title,
      declared_start: null,
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
      created_at: `${day}T16:00:00.000Z`,
    }),
    [block],
    TZ,
    NOW,
  );
}
const CARDS = [
  post('soup', 'Short rib soup', '2026-09-08'),
  post('ramen', 'Ramen', '2026-10-03'),
  post('noodles', 'Cold noodles', '2026-10-12'),
]
  .map((s) => placeCard(s, '', TZ))
  .sort(byNewest);

describe('the views’ tabs on a lane’s page (review)', () => {
  it('keep Calendar | Lane | List at the top, Lane chosen, each back to Home on that view', () => {
    pushed.length = 0;
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} />
      </InputSheetProvider>,
    );
    const tabs = container.querySelector('[data-lane-tabs]')!;
    expect([...tabs.querySelectorAll('[data-view-option]')].map((o) => o.textContent)).toEqual([
      'Calendar',
      'Lane',
      'List',
    ]);
    expect(tabs.querySelector('[data-view-option="lane"]')!.getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.click(tabs.querySelector('[data-view-option="board"]')!);
    fireEvent.click(tabs.querySelector('[data-view-option="date"]')!);
    expect(pushed).toEqual(['/?view=board', '/?view=date']);
    // Settings live in the strip (0032), not beside the tabs.
    expect(tabs.querySelector('[data-home-settings]')).toBeNull();
    expect(container.querySelector('[data-strip-settings]')).not.toBeNull();
  });

  it('keep a pool’s four tabs on its lane’s page, each back to the pool on that view', () => {
    pushed.length = 0;
    const { container } = render(
      <InputSheetProvider>
        <LanePage
          lane={{ id: 'l-word', name: 'Word', icon: '📖' }}
          cards={CARDS}
          pool={{ poolId: 'p-ours', poolName: 'Sarang', lanes: [], members: [] }}
        />
      </InputSheetProvider>,
    );
    const tabs = container.querySelector('[data-lane-tabs]')!;
    expect([...tabs.querySelectorAll('[data-view-option]')].map((o) => o.textContent)).toEqual([
      'Calendar',
      'Members',
      'Lane',
      'List',
    ]);
    fireEvent.click(tabs.querySelector('[data-view-option="swimmers"]')!);
    expect(pushed).toEqual(['/pool/p-ours?view=swimmers']);
  });

  it('keep the ground’s two thirds and one third on a wide screen', () => {
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} />
      </InputSheetProvider>,
    );
    expect(container.querySelector('[data-grid-column]')!.className).toContain('lg:flex-[2]');
    expect(container.querySelector('[data-board-column]')!.className).toContain('lg:flex-1');
  });
});

describe('a lane’s page (round 3)', () => {
  it('reads Home / the lane, the emoji large over the name, and its posts newest first by month', () => {
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} />
      </InputSheetProvider>,
    );
    const crumb = container.querySelector('[data-breadcrumb]')!;
    expect(crumb.querySelector('a[href="/"]')!.textContent).toBe('Home');
    expect(crumb.textContent).toContain('Food');
    expect(container.querySelector('[data-lane-emoji]')!.textContent).toBe('🍜');
    expect(container.querySelector('[data-lane-name]')!.textContent).toBe('Food');
    // The Date view's own day list: the month on a line of its own.
    const months = [...container.querySelectorAll('[data-month-label]')].map((m) => m.textContent);
    expect(months).toEqual(['2026 OCT', '2026 SEP']);
    const posts = [...container.querySelectorAll('[data-lane-post]')].map((p) =>
      p.getAttribute('data-lane-post'),
    );
    expect(posts).toEqual(['noodles', 'ramen', 'soup']);
    // The day over its weekday on the rail, beside the day's rows.
    let rail: Element | null = container
      .querySelector('[data-lane-post="ramen"]')!
      .closest('[data-cell="date"]');
    rail = rail!.previousElementSibling;
    expect(rail!.getAttribute('data-day-row')).toBe('2026-10-03');
    expect(rail!.textContent).toBe('3SAT');
    expect(container.querySelector('[data-lane-post="ramen"]')!.textContent).not.toContain('Oct');
    expect(container.querySelector('[data-manage-lanes-link]')!.textContent).toBe('Manage lanes');
  });

  it('sets the lane\u2019s card stack at the foot: the top card\u2019s row at full white, the rest quiet, no pill', async () => {
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} />
      </InputSheetProvider>,
    );
    const stack = container.querySelector('[data-lane-stack] [data-stack]')!;
    expect(
      stack.querySelector('[data-stack-card][data-slot="0"]')!.getAttribute('data-stack-card'),
    ).toBe('noodles');
    const top = container.querySelector('[data-pill="noodles"]')!;
    expect(top.hasAttribute('data-dived')).toBe(false);
    // A plain row: full white on top, the rest at 85%; no background, no line of its own.
    expect(top.className).toContain('text-white');
    expect(top.className).not.toContain('text-white/85');
    expect(top.className).not.toMatch(/rounded-full|bg-|border-b/);
    expect(container.querySelector('[data-pill="ramen"]')!.className).toContain('text-white/85');
    // The top card opens the post as a sheet over this page (review).
    expect(stack.querySelector('[data-card-link]')!.getAttribute('href')).toBe('/splash/noodles');
    fireEvent.click(container.querySelector('[data-pill="soup"]')!);
    await waitFor(() =>
      expect(container.querySelector('[data-pill="soup"]')!.hasAttribute('data-dived')).toBe(false),
    );
  });

  it('opens with the card a post\u2019s page sent it back to on top', () => {
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} topParam="ramen" />
      </InputSheetProvider>,
    );
    expect(
      container.querySelector('[data-stack-card][data-slot="0"]')!.getAttribute('data-stack-card'),
    ).toBe('ramen');
  });

  it('edits the emoji and the name in place, and saves them', async () => {
    saved.length = 0;
    const { container, getByText, getByLabelText } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} />
      </InputSheetProvider>,
    );
    fireEvent.click(container.querySelector('[data-lane-name]')!);
    fireEvent.change(getByLabelText('Lane icon'), { target: { value: '🍜🍣' } });
    fireEvent.change(getByLabelText('Lane name'), { target: { value: 'Meals' } });
    fireEvent.click(getByText('Save'));
    expect(container.querySelector('[data-lane-name]')!.textContent).toBe('Meals');
    expect(container.querySelector('[data-lane-emoji]')!.textContent).toBe('🍣');
    await waitFor(() => expect(saved).toEqual([{ id: 'c-food', name: 'Meals', icon: '🍣' }]));
  });

  it('cancels an edit without saving', () => {
    saved.length = 0;
    const { container, getByText, getByLabelText } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} />
      </InputSheetProvider>,
    );
    fireEvent.click(container.querySelector('[data-lane-emoji]')!);
    fireEvent.change(getByLabelText('Lane name'), { target: { value: 'Meals' } });
    fireEvent.click(getByText('Cancel'));
    expect(container.querySelector('[data-lane-name]')!.textContent).toBe('Food');
    expect(saved).toEqual([]);
  });
});

describe('a pool lane’s page (review)', () => {
  const POOL = {
    poolId: 'p-ours',
    poolName: 'Sarang',
    lanes: [{ id: 'l-word', name: '말씀', icon: '📖', homeLaneId: null }],
    members: [],
  };
  const page = () =>
    render(
      <InputSheetProvider>
        <LanePage
          lane={{ id: 'l-word', name: '말씀', icon: '📖', description: 'Sunday notes' }}
          cards={CARDS}
          pool={POOL}
        />
      </InputSheetProvider>,
    );

  it('starts its breadcrumb at the pool and has no Manage lanes link', () => {
    const { container } = page();
    const crumb = container.querySelector('[data-breadcrumb] a')!;
    expect(crumb.textContent).toBe('Sarang');
    expect(crumb.getAttribute('href')).toBe('/pool/p-ours');
    expect(container.querySelector('[data-manage-lanes-link]')).toBeNull();
  });

  it('renames the pool lane in place, keeping its description', async () => {
    poolSaved.length = 0;
    const { container, getByText, getByLabelText } = page();
    fireEvent.click(container.querySelector('[data-lane-name]')!);
    fireEvent.change(getByLabelText('Lane name'), { target: { value: '말씀 묵상' } });
    fireEvent.click(getByText('Save'));
    expect(container.querySelector('[data-lane-name]')!.textContent).toBe('말씀 묵상');
    await waitFor(() =>
      expect(poolSaved).toEqual([
        {
          id: 'l-word',
          poolId: 'p-ours',
          name: '말씀 묵상',
          icon: '📖',
          description: 'Sunday notes',
        },
      ]),
    );
  });
});

describe('a post moved to another pool lane (0020, review)', () => {
  function Mover() {
    const { markEdited } = useInputSheet();
    useEffect(
      () =>
        markEdited('ramen', {
          title: 'Ramen',
          icon: null,
          poolLane: { id: 'l-other', icon: '🎬', name: 'Media' },
        }),
      [markEdited],
    );
    return null;
  }

  it('leaves this pool lane’s page at once', () => {
    const { container } = render(
      <InputSheetProvider>
        <Mover />
        <LanePage
          lane={{ id: 'l-word', name: '말씀', icon: '📖' }}
          cards={CARDS}
          pool={{ poolId: 'p-ours', poolName: 'Sarang', lanes: [], members: [] }}
        />
      </InputSheetProvider>,
    );
    expect(container.querySelector('[data-lane-post="ramen"]')).toBeNull();
    expect(container.querySelector('[data-lane-post="soup"]')).not.toBeNull();
  });
});

describe('the top card on a lane’s page reads responses, as Home does (H25, review)', () => {
  it('shows each ripple’s reaction chips and its first two replies, then "+n"', () => {
    const shared: Card = {
      ...CARDS[0],
      ripples: [{ id: 'noodles-b', note: 'noodles', createdAt: '2026-10-12T16:00:00.000Z' }],
      responded: {
        value: {
          reactions: [
            {
              ripple_id: 'noodles-b',
              user_id: 'u-mina',
              emoji: '❤️',
              created_at: '2026-10-13T01:00:00Z',
            },
          ],
          replies: ['first', 'second', 'third'].map((body, i) => ({
            id: `re-${i}`,
            ripple_id: 'noodles-b',
            author_id: 'u-mina',
            body,
            created_at: `2026-10-13T0${i + 2}:00:00Z`,
            edited_at: null,
            hidden: false,
            former: false,
          })),
        },
        locked: [],
      },
    };
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={[shared, ...CARDS.slice(1)]} />
      </InputSheetProvider>,
    );
    const top = container.querySelector('[data-lane-stack] [data-stack-card][data-slot="0"]')!;
    const responses = top.querySelector('[data-card-responses="noodles-b"]')!;
    expect(responses.querySelector('[data-reaction="❤️"]')!.textContent).toContain('1');
    expect([...responses.querySelectorAll('[data-card-reply]')].map((r) => r.textContent)).toEqual([
      'first',
      'second',
    ]);
    expect(responses.querySelector('[data-card-replies-more]')!.getAttribute('href')).toBe(
      '/splash/noodles#reply-re-2',
    );
  });

  it('offers none on a post nobody else reads', () => {
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={FOOD} cards={CARDS} />
      </InputSheetProvider>,
    );
    const top = container.querySelector('[data-lane-stack] [data-stack-card][data-slot="0"]')!;
    expect(top.querySelector('[data-card-responses]')).toBeNull();
  });
});
