// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const placed = vi.hoisted(() => [] as unknown[][]);
const moved = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/features/pool/actions', () => ({
  setPlacement: (...args: unknown[]) => {
    placed.push(args);
    return Promise.resolve({ ok: true });
  },
  setPlacementTogether: () => Promise.resolve({ ok: true }),
  moveToHome: (...args: unknown[]) => {
    moved.push(args);
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/features/lanes/actions', () => ({
  saveLane: () => Promise.resolve({ ok: true, id: 'c-new' }),
}));

import { ToastProvider } from '@/components/ui/toast';
import { PeopleProvider } from '@/features/people/people-provider';
import { SplashAudience } from '@/features/pool/splash-audience';

afterEach(() => {
  cleanup();
  placed.length = 0;
  moved.length = 0;
});

const POOLS = [
  {
    id: 'p-alpha',
    name: 'Alpha',
    lanes: [
      { id: 'a1', name: 'Days', icon: '☀️' },
      { id: 'a2', name: 'Trips', icon: null },
    ],
  },
  { id: 'p-beta', name: 'Beta', lanes: [{ id: 'b1', name: 'Walks', icon: null }] },
];
const LANES = [
  { id: 'c-day', name: 'Day', icon: '🌤' },
  { id: 'c-swim', name: 'Swim', icon: '🏊' },
];
const SHARED = [
  { poolId: 'p-alpha', poolLaneId: 'a1' },
  { poolId: 'p-beta', poolLaneId: 'b1' },
];

/** My record written in Alpha, shared to Beta too; or my Home record, with no lock. */
function audience({ pool = true, filed = null as string | null } = {}) {
  const view = render(
    <ToastProvider>
      <PeopleProvider me="u-me" people={{}}>
        <SplashAudience
          splashId="s1"
          myLaneId={null}
          shared={SHARED}
          pools={POOLS}
          locked={pool ? 'p-alpha' : null}
          moveHome={pool ? { lanes: LANES, filed } : null}
        />
      </PeopleProvider>
    </ToastProvider>,
  );
  fireEvent.click(view.container.querySelector('[data-audience-chip]')!);
  return view;
}

const row = (id: string) => document.querySelector(`[data-audience-row="${id}"]`)!;
const toggle = (id: string) => row(id).querySelector<HTMLButtonElement>('[role="switch"]')!;
const openMove = () => {
  fireEvent.click(document.querySelector('[data-audience-more]')!);
  fireEvent.click(document.querySelector('[data-audience-move-home]')!);
};

describe('my record written in a pool: its Audience (0056, H45)', () => {
  it('keeps its origin locked on by default, its lane still changeable', async () => {
    audience();
    expect(row('p-alpha').querySelector('[data-audience-origin]')!.textContent).toBe(
      'Written here, always shared',
    );
    expect(toggle('p-alpha').disabled).toBe(true);
    expect(toggle('p-beta').disabled).toBe(false);
    fireEvent.click(row('p-alpha').querySelector('[data-audience-lane="a2"]')!);
    await waitFor(() => expect(placed).toEqual([['s1', 'p-alpha', true, 'a2']]));
  });

  it('offers Move to Home in the header’s … with its hint; a Home record has no …', () => {
    audience();
    fireEvent.click(document.querySelector('[data-audience-more]')!);
    const item = document.querySelector('[data-audience-move-home]')!;
    expect(item.textContent).toContain('Move to Home');
    expect(item.textContent).toContain(
      'Keeps it shared here, and lets you turn this Pool off later.',
    );
    cleanup();
    audience({ pool: false });
    expect(document.querySelector('[data-audience-more]')).toBeNull();
    expect(document.querySelector('[data-audience-origin]')).toBeNull();
  });

  it('asks which of my lanes, starting where I filed it; saving moves it, every pool kept, the origin unlocked', async () => {
    audience({ filed: 'c-swim' });
    openMove();
    const ask = document.querySelector('[data-move-to-home]')!;
    expect(ask.textContent).toContain('Keep it in which of your lanes?');
    const swim = [...ask.querySelectorAll('button')].find((b) => b.textContent?.includes('Swim'))!;
    expect(swim.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(ask.querySelector('[data-move-to-home-go]')!);
    await waitFor(() => expect(moved).toEqual([['s1', 'c-swim']]));
    // Nothing switched off; the origin is now a pool like any other.
    expect(placed).toEqual([]);
    expect(toggle('p-alpha').getAttribute('aria-checked')).toBe('true');
    expect(toggle('p-beta').getAttribute('aria-checked')).toBe('true');
  });

  it('moves into a new lane made there', async () => {
    audience();
    openMove();
    fireEvent.click(document.querySelector('[data-move-new-lane]')!);
    fireEvent.change(document.querySelector('[aria-label="New lane icon"]')!, {
      target: { value: '🌊' },
    });
    fireEvent.change(document.querySelector('[data-move-new-lane-name]')!, {
      target: { value: 'Sea' },
    });
    fireEvent.click(document.querySelector('[data-move-to-home-go]')!);
    await waitFor(() => expect(moved).toEqual([['s1', 'c-new']]));
  });

  it('cancel changes nothing: the origin stays locked', () => {
    audience();
    openMove();
    fireEvent.click(
      [...document.querySelectorAll('[data-move-to-home] button')].find(
        (b) => b.textContent === 'Cancel',
      )!,
    );
    expect(document.querySelector('[data-move-to-home]')).toBeNull();
    expect(toggle('p-alpha').disabled).toBe(true);
    expect(moved).toEqual([]);
  });
});
