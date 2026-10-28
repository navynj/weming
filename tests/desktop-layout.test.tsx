// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    prefetch: () => {},
  }),
}));
vi.mock('@/features/splash/actions', () => ({}));
vi.mock('@/features/pool/actions', () => ({}));
vi.mock('@/features/lanes/actions', () => ({}));
vi.mock('@/features/ripple-sheet/actions', () => ({}));

import { HomeGround } from '@/features/home/home-ground';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { LanePage } from '@/features/lanes/lane-page';
import { PoolGround } from '@/features/pool/pool-ground';
import type { PoolView } from '@/lib/queries/pools';

/**
 * Every view keeps the desktop layout (review): the grid or list left, the
 * stack right, the nav as a vertical rail at the far right edge; the bottom
 * row is mobile only. jsdom lays nothing out, so this asserts the structure
 * the layout rests on — the order inside the ground's row and the
 * breakpoint classes that turn it into columns at 1280px — and the
 * headless-Chrome screenshots at 1280px check where things actually land.
 */
const LANE = {
  id: 'c-place',
  user_id: 'u',
  name: 'Place',
  icon: '📍',
  default_mode: 'drop' as const,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
};
const VIEW: PoolView = {
  pool: { id: 'p', name: 'Our Pool', ownerId: 'u' },
  members: [
    {
      userId: 'u',
      name: 'Yoonji',
      initials: 'YO',
      joinedAt: '2026-10-01',
      former: false,
      timeZone: 'UTC',
    },
  ],
  lanes: [{ id: 'l', pool_id: 'p', name: 'Food', icon: '🍽️', description: null, position: 0 }],
  myLinks: [],
  placements: [],
  splashes: [],
  ripples: [],
  invites: [],
};

function expectDesktopRow(container: HTMLElement): void {
  const row = container.querySelector('[data-ground-row]') as HTMLElement;
  expect(row, 'the ground row').not.toBeNull();
  expect(row.className).toContain('lg:flex-row');
  const kids = [...row.children] as HTMLElement[];
  const grid = kids.findIndex((el) => el.hasAttribute('data-grid-column'));
  const stack = kids.findIndex((el) => el.hasAttribute('data-board-column'));
  const rail = kids.at(-1)!;
  expect(grid).toBeGreaterThanOrEqual(0);
  // The stack right of the grid, the rail the rightmost of all.
  expect(stack).toBeGreaterThan(grid);
  expect(rail.getAttribute('data-home-foot')).toBe('wide');
  expect(rail.className).toContain('lg:flex');
  expect(rail.className).toContain('flex-col');
  // The bottom row, where there is one, is hidden at desktop widths.
  for (const foot of container.querySelectorAll('[data-home-foot="phone"]')) {
    expect(foot.className).toContain('lg:hidden');
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Element.prototype.scrollTo = function scrollTo() {} as Element['scrollTo'];
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
  window.localStorage.clear();
});
afterEach(cleanup);

describe('desktop layout at 1280px', () => {
  for (const view of ['lane', 'date'] as const) {
    it(`Home, ${view} view`, () => {
      const { container } = render(
        <InputSheetProvider>
          <HomeGround
            initialView={view}
            cards={[]}
            pinned={[]}
            categories={[LANE]}
            today="2026-10-23"
            timeZone="UTC"
            initials="YO"
            scrollToMonth={null}
          />
        </InputSheetProvider>,
      );
      expectDesktopRow(container);
    });
  }

  for (const view of ['lane', 'members', 'date'] as const) {
    it(`Pool, ${view} view`, () => {
      const { container } = render(
        <InputSheetProvider>
          <PoolGround view={VIEW} me="u" today="2026-10-23" timeZone="UTC" initialView={view} />
        </InputSheetProvider>,
      );
      expectDesktopRow(container);
    });
  }

  it('the lane page', () => {
    const { container } = render(
      <InputSheetProvider>
        <LanePage lane={LANE} cards={[]} categories={[LANE]} initials="YO" topParam={null} />
      </InputSheetProvider>,
    );
    expectDesktopRow(container);
  });
});
