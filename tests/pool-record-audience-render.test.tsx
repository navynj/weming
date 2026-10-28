// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const placed = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/features/pool/actions', () => ({
  setPlacement: (...args: unknown[]) => {
    placed.push(args);
    return Promise.resolve({ ok: true });
  },
  setPlacementTogether: () => Promise.resolve({ ok: true }),
}));

import { PeopleProvider } from '@/features/people/people-provider';
import { SplashAudience } from '@/features/pool/splash-audience';

afterEach(() => {
  cleanup();
  placed.length = 0;
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

function audience() {
  const view = render(
    <PeopleProvider me="u-me" people={{}}>
      <SplashAudience
        splashId="s1"
        myLaneId={null}
        shared={[{ poolId: 'p-alpha', poolLaneId: 'a1' }]}
        pools={POOLS}
        links={[]}
        locked="p-alpha"
      />
    </PeopleProvider>,
  );
  fireEvent.click(view.container.querySelector('[data-audience-chip]')!);
  return view;
}

const row = (id: string) => document.querySelector(`[data-audience-row="${id}"]`)!;

describe('my pool record’s Audience (0056)', () => {
  it('keeps its own pool on: the switch cannot turn it off, its lane can change', async () => {
    audience();
    const origin = row('p-alpha');
    expect(origin.querySelector('[data-audience-origin]')).not.toBeNull();
    expect(origin.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true);
    fireEvent.click(origin.querySelector('[data-audience-lane="a2"]')!);
    await waitFor(() => expect(placed).toEqual([['s1', 'p-alpha', true, 'a2']]));
  });

  it('shares it to another pool I am in, as a Home record is', async () => {
    audience();
    const other = row('p-beta');
    expect(other.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(false);
    fireEvent.click(other.querySelector('[role="switch"]')!);
    fireEvent.click(other.querySelector('[data-audience-lane="b1"]')!);
    await waitFor(() => expect(placed).toContainEqual(['s1', 'p-beta', true, 'b1']));
  });
});
