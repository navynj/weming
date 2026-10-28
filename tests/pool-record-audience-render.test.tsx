// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const placed = vi.hoisted(() => [] as unknown[][]);
const kept = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/features/pool/actions', () => ({
  setPlacement: (...args: unknown[]) => {
    placed.push(args);
    return Promise.resolve({ ok: true });
  },
  setPlacementTogether: () => Promise.resolve({ ok: true }),
  keepInLane: (...args: unknown[]) => {
    kept.push(args);
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/features/lanes/actions', () => ({
  saveLane: () => Promise.resolve({ ok: true, id: 'c-new' }),
}));

import { PeopleProvider } from '@/features/people/people-provider';
import { SplashAudience } from '@/features/pool/splash-audience';

afterEach(() => {
  cleanup();
  placed.length = 0;
  kept.length = 0;
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

function audience(shared = [{ poolId: 'p-alpha', poolLaneId: 'a1' }], filed: string | null = null) {
  const view = render(
    <PeopleProvider me="u-me" people={{}}>
      <SplashAudience
        splashId="s1"
        myLaneId={null}
        shared={shared}
        pools={POOLS}
        keepIn={{ lanes: LANES, filed }}
      />
    </PeopleProvider>,
  );
  fireEvent.click(view.container.querySelector('[data-audience-chip]')!);
  return view;
}

const row = (id: string) => document.querySelector(`[data-audience-row="${id}"]`)!;
const toggle = (id: string) => row(id).querySelector<HTMLButtonElement>('[role="switch"]')!;

describe('my pool record’s Audience (H45)', () => {
  it('no longer locks its origin: no "Written here", and its lane can change', async () => {
    audience();
    expect(document.body.textContent).not.toContain('Written here');
    expect(toggle('p-alpha').disabled).toBe(false);
    fireEvent.click(row('p-alpha').querySelector('[data-audience-lane="a2"]')!);
    await waitFor(() => expect(placed).toEqual([['s1', 'p-alpha', true, 'a2']]));
  });

  it('turns its origin off with no question while another pool has it', async () => {
    audience([
      { poolId: 'p-alpha', poolLaneId: 'a1' },
      { poolId: 'p-beta', poolLaneId: 'b1' },
    ]);
    fireEvent.click(toggle('p-alpha'));
    expect(document.querySelector('[data-keep-in-lane]')).toBeNull();
    await waitFor(() => expect(placed).toEqual([['s1', 'p-alpha', false, null]]));
  });

  it('asks which of my lanes keeps it when its last pool goes, starting on where I filed it', async () => {
    audience(undefined, 'c-swim');
    fireEvent.click(toggle('p-alpha'));
    const ask = document.querySelector('[data-keep-in-lane]')!;
    expect(ask.textContent).toContain('Keep it in which of your lanes?');
    expect(placed).toEqual([]);
    const swim = [...ask.querySelectorAll('button')].find((b) => b.textContent?.includes('Swim'))!;
    expect(swim.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(ask.querySelector('[data-keep-in-lane-go]')!);
    await waitFor(() => expect(kept).toEqual([['s1', 'c-swim']]));
    expect(placed).toEqual([]);
  });

  it('keeps it in a new lane made there', async () => {
    audience();
    fireEvent.click(toggle('p-alpha'));
    fireEvent.click(document.querySelector('[data-keep-new-lane]')!);
    fireEvent.change(document.querySelector('[aria-label="New lane icon"]')!, {
      target: { value: '🌊' },
    });
    fireEvent.change(document.querySelector('[data-keep-new-lane-name]')!, {
      target: { value: 'Sea' },
    });
    fireEvent.click(document.querySelector('[data-keep-in-lane-go]')!);
    await waitFor(() => expect(kept).toEqual([['s1', 'c-new']]));
  });

  it('cancel leaves the origin pool on', () => {
    audience();
    fireEvent.click(toggle('p-alpha'));
    fireEvent.click(
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!,
    );
    expect(document.querySelector('[data-keep-in-lane]')).toBeNull();
    expect(toggle('p-alpha').getAttribute('aria-checked')).toBe('true');
    expect(placed).toEqual([]);
    expect(kept).toEqual([]);
  });

  it('shares it to another pool I am in, as a Home record is', async () => {
    audience();
    fireEvent.click(toggle('p-beta'));
    fireEvent.click(row('p-beta').querySelector('[data-audience-lane="b1"]')!);
    await waitFor(() => expect(placed).toContainEqual(['s1', 'p-beta', true, 'b1']));
  });
});
