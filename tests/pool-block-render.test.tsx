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
    // The line: white words on the water, no fill.
    const line = block.querySelector('p')!;
    expect(line.textContent).toBe('Pool your days.');
    expect(line.className).toContain('text-white');
    expect(line.className).not.toContain('bg-white');
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
    // Drawn as Home draws them now: pieces with labels, never the older marks.
    expect(grid.querySelectorAll('[data-board-piece]')).toHaveLength(SAMPLE_SPLASHES.length);
    expect(grid.querySelector('[data-mark]')).toBeNull();
  });
});
