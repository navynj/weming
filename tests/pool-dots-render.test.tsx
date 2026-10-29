// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prefetched = vi.hoisted(() => [] as { href: string; kind?: string }[]);
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    prefetch: (href: string, options?: { kind?: string }) =>
      prefetched.push({ href, kind: options?.kind }),
  }),
}));

import { GroundFoot } from '@/features/home/ground-foot';
import { PoolActivityProvider } from '@/features/pool/activity';
import { rememberVisit } from '@/features/pool/remembered';

beforeEach(() => {
  window.localStorage.clear();
  prefetched.length = 0;
});
afterEach(cleanup);

const ACTIVITY = { 'p-a': '2026-10-23T10:00:00.000Z', 'p-b': null };

function foot(activity: Record<string, string | null> = ACTIVITY) {
  return render(
    <PoolActivityProvider
      activity={activity}
      pools={[
        { id: 'p-a', name: 'Sarang' },
        { id: 'p-b', name: 'Study Crew' },
      ]}
    >
      <GroundFoot here="home" onCompose={() => {}} />
    </PoolActivityProvider>,
  );
}

// The dot rides on the pool's own place on the strip (review).
const dot = (root: Element) =>
  root.querySelector('[data-home-foot] [data-strip-pool="p-a"] [data-unseen-dot]');

describe('a pool’s dot on the strip (review)', () => {
  it('shows when a pool has something I have not seen on this device', () => {
    expect(dot(foot().container)).not.toBeNull();
  });

  it('clears the moment I visit that pool, and stays off until something newer', () => {
    const { container } = foot();
    act(() => rememberVisit('p-a', new Date('2026-10-23T11:00:00.000Z')));
    expect(dot(container)).toBeNull();
    cleanup();
    // Someone writes after my visit.
    expect(dot(foot({ 'p-a': '2026-10-23T12:00:00.000Z' }).container)).not.toBeNull();
  });

  it('stays off when no pool has anything by anyone else', () => {
    expect(dot(foot({ 'p-a': null, 'p-b': null }).container)).toBeNull();
  });
});

describe('a pool’s photo on the strip (0024)', () => {
  it('draws the photo in the pool’s rounded square; a pool without one keeps its letters', () => {
    const { container } = render(
      <PoolActivityProvider
        activity={{}}
        pools={[
          { id: 'p-a', name: 'Sarang', photo: 'https://signed/p-a' },
          { id: 'p-b', name: 'Study Crew', photo: null },
        ]}
      >
        <GroundFoot here="home" onCompose={() => {}} />
      </PoolActivityProvider>,
    );
    const a = container.querySelector('[data-home-foot="phone"] [data-strip-pool="p-a"]')!;
    expect(a.querySelector('img[data-pool-photo]')!.getAttribute('src')).toBe('https://signed/p-a');
    const b = container.querySelector('[data-home-foot="phone"] [data-strip-pool="p-b"]')!;
    expect(b.querySelector('img')).toBeNull();
    expect(b.textContent).toBe('ST');
  });
});

// Not every place on sight (2026-10-28: the storm): in full only the two
// I went to last; the rest when the hand reaches for one.
describe('switching places', () => {
  // Past anything the tests above prefetched at the real time.
  let clock = Date.parse('2030-01-01T00:00:00.000Z');
  beforeEach(() => {
    // Each place is prefetched at most once in 30s: a fresh minute per test.
    vi.useFakeTimers({ toFake: ['Date'] });
    clock += 60_000;
    vi.setSystemTime(clock);
  });
  afterEach(() => vi.useRealTimers());

  function strip() {
    return render(
      <PoolActivityProvider
        activity={{}}
        pools={[
          { id: 'p-a', name: 'Sarang' },
          { id: 'p-b', name: 'Study Crew' },
          { id: 'p-c', name: 'Swim' },
        ]}
      >
        <GroundFoot here="home" onCompose={() => {}} />
      </PoolActivityProvider>,
    );
  }

  it('prefetches in full only the two places I went to last, never where I am', () => {
    window.localStorage.setItem('weming.recent-places', JSON.stringify(['/pool/p-c', '/']));
    strip();
    expect(prefetched).toEqual([
      { href: '/pool/p-c', kind: 'full' },
      { href: '/pool/p-a', kind: 'full' },
    ]);
  });

  it('prefetches another place in full when the hand reaches for it', () => {
    window.localStorage.setItem('weming.recent-places', JSON.stringify(['/pool/p-c', '/']));
    const { container } = strip();
    prefetched.length = 0;
    const b = container.querySelector('[data-home-foot] [data-strip-pool="p-b"]')!;
    act(() => {
      b.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(prefetched).toEqual([{ href: '/pool/p-b', kind: 'full' }]);
  });
});
