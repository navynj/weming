// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/p/splash/s-joint',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
vi.mock('@/features/splash/actions', () => ({}));
vi.mock('@/features/input-sheet/commit', () => ({}));
vi.mock('@/features/ripple-sheet/actions', () => ({}));
vi.mock('@/features/pool/actions', () => ({}));
vi.mock('@/lib/downscale', () => ({ downscale: (file: File) => Promise.resolve(file) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));

import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { SplashPage, type PoolContext } from '@/features/splash/splash-page';
import { summarizeSplash, type Splash } from '@/features/splash/summary';
import type { RippleWithSplash } from '@/lib/queries/ripples';

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
afterEach(cleanup);

const ME = 'u-me';
const MINA = 'u-mina';

const JOINT: Splash = {
  id: 's-joint',
  owner_id: null,
  pool_id: 'p',
  pool_lane_id: 'l-media',
  own_pool_id: null,
  joint_invite_all: false,
  description: null,
  created_by: MINA,
  title: 'Lost Ruins of Arnak',
  declared_start: null,
  declared_end: null,
  declared_lane_id: null,
  icon: '🏛️',
  session_id: null,
  pinned_at: null,
  type: 'free',
  prompt: null,
  ends_at: null,
  created_at: '2026-10-22T18:00:00.000Z',
  written_on: '2026-10-22',
};

function ripple(id: string, author: string, note: string): RippleWithSplash {
  return {
    id,
    author_id: author,
    thread_pool_id: null,
    note,
    media: [],
    occurred_on: null,
    occurred_time: null,
    started_at: null,
    ended_at: null,
    planned: false,
    participants: [],
    created_at: '2026-10-22T18:00:00.000Z',
    written_on: '2026-10-22',
    parent_ripple_id: null,
    splash_id: 's-joint',
    splash: { declared_start: null, title: 'Lost Ruins of Arnak' },
  };
}

const BLOCKS = [
  ripple('r-mina', MINA, 'Mina won by two'),
  ripple('r-me', ME, 'I want the expansion'),
];
const POOL: PoolContext = {
  poolId: 'p',
  me: ME,
  scope: 'joint',
  initialsOf: { [ME]: 'YO', [MINA]: 'MI' },
  laneChip: { icon: '🎬', name: 'Media' },
  canDeleteJoint: false,
  zoneOf: { [ME]: 'America/Vancouver', [MINA]: 'Asia/Seoul' },
};

function page() {
  return render(
    <InputSheetProvider>
      <SplashPage
        splash={summarizeSplash(
          JOINT,
          BLOCKS,
          'America/Vancouver',
          new Date('2026-10-23T00:00:00Z'),
        )}
        blocks={BLOCKS}
        photos={{}}
        lockedIds={[]}
        categories={[]}
        timeZone="America/Vancouver"
        today="2026-10-23"
        initials="YO"
        poolTags={['Our Pool · 🎬 Media']}
        pool={POOL}
      />
    </InputSheetProvider>,
  );
}

describe('a pool’s splash on Home’s page (review)', () => {
  it('opens the inline editor on my ripple and none on another member’s', () => {
    const { container } = page();
    const mina = container.querySelector('[data-block="r-mina"]')!;
    expect(mina.hasAttribute('data-read-only')).toBe(true);
    expect(mina.tagName).not.toBe('BUTTON');
    fireEvent.click(container.querySelector('button[data-block="r-me"]')!);
    expect(container.querySelector('[data-block-editor="r-me"]')).not.toBeNull();
  });

  it('shows every ripple’s author and the origin tag, with no back chip (the sheet closes it)', () => {
    const { container, getByText } = page();
    const avatars = [...container.querySelectorAll('[data-thread-avatar]')].map(
      (a) => a.textContent,
    );
    expect(avatars).toEqual(['MI', 'YO']);
    expect(getByText('Our Pool · 🎬 Media')).toBeTruthy();
    expect(container.querySelector('[data-back-chip]')).toBeNull();
  });

  it('lets a member edit a joint splash’s title, not its dates or lane, and hides delete while others wrote in it', () => {
    const { container, queryByLabelText, getByLabelText } = page();
    expect(getByLabelText('Edit the title')).toBeTruthy();
    expect(queryByLabelText('Edit the declared date')).toBeNull();
    expect(queryByLabelText('Edit the declared lane')).toBeNull();
    fireEvent.click(getByLabelText('More'));
    expect(container.querySelector('[data-header-menu]')!.textContent).not.toContain('Delete');
  });

  it('renders the same split layout as Home on a wide screen', () => {
    const { container } = page();
    expect(container.querySelector('[data-splash-page]')!.className).toContain('lg:grid-cols-2');
  });

  it('is the same component on Home and in a pool: no pool-only detail remains', () => {
    // Both are read into the same detail, in the same sheet (review).
    const pool = readFileSync('features/pool/pool-splash.tsx', 'utf8');
    const home = readFileSync('features/splash/home-splash.tsx', 'utf8');
    for (const source of [pool, home]) {
      expect(source).toContain("import { SplashPage } from '@/features/splash/splash-page'");
    }
    for (const route of [
      'app/(shell)/pool/[id]/splash/[sid]/page.tsx',
      'app/(shell)/splash/[id]/page.tsx',
      'app/(shell)/@modal/(.)pool/[id]/splash/[sid]/page.tsx',
      'app/(shell)/@modal/(.)splash/[id]/page.tsx',
    ]) {
      expect(readFileSync(route, 'utf8')).toContain('<SplashModal');
    }
    expect(existsSync('features/pool/pool-splash-page.tsx')).toBe(false);
  });
});
