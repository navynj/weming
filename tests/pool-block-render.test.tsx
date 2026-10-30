// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/sign-in',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { SAMPLE_LANES, SAMPLE_SPLASHES } from '@/app/sign-in/sample-pool';
import { PoolBlock } from '@/features/auth/pool-block';

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

describe('the sign-in screen’s pool block (H67)', () => {
  it('draws the sample lanes and splashes with Home’s grid, as a picture', () => {
    const { container } = render(<PoolBlock lanes={SAMPLE_LANES} splashes={SAMPLE_SPLASHES} />);
    const block = container.querySelector('[data-pool-block]')!;
    expect(block.querySelector('p')!.textContent).toBe('Pool your days.');
    const grid = block.querySelector('[data-lane-grid]')!;
    expect(grid.getAttribute('aria-hidden')).toBe('true');
    expect(grid.hasAttribute('inert')).toBe(true);
    expect([...grid.querySelectorAll('[data-lane-header]')].map((h) => h.textContent)).toEqual([
      '☀️Day',
      '🍽️Food',
      '📍Place',
      '🎧Music',
    ]);
    // No lane opens its page from here, and nothing adds a lane.
    expect(grid.querySelector('a')).toBeNull();
    expect(grid.querySelector('[data-new-lane]')).toBeNull();
    expect(grid.querySelectorAll('[data-mark]')).toHaveLength(SAMPLE_SPLASHES.length);
    // The newest is the solid mark; the rest read translucent.
    expect(grid.querySelectorAll('[data-mark]:not([data-dived])')).toHaveLength(1);
  });
});
