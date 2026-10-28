// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/lanes',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

import { PRESET_CATEGORIES, RESIDUAL_CATEGORY } from '@/features/auth/preset-categories';
import { LanesMatrix } from '@/features/lanes/lanes-matrix';
import { laneRows } from '@/features/lanes/matrix';
import { tallyLaneCounts } from '@/lib/queries/lanes';
import type { MyCategory } from '@/lib/queries/profile';

const TZ = 'America/Vancouver';
const TODAY = '2026-09-25';
const FOOD = 'c-food';

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

const food: MyCategory = {
  id: FOOD,
  user_id: 'a1',
  name: 'Food',
  icon: '🍜',
  default_mode: 'drop',
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
};

describe('Lanes after the exclusion constraint (H20c)', () => {
  // Two spans that overlap: dinner, and a call taken halfway through it.
  const overlapping = [
    {
      lane_id: FOOD,
      occurred_on: '2026-09-24',
      occurred_time: '19:00:00',
      created_at: '2026-09-25T05:00:00Z',
    },
    {
      lane_id: FOOD,
      occurred_on: '2026-09-24',
      occurred_time: '19:40:00',
      created_at: '2026-09-25T05:05:00Z',
    },
  ];

  it('counts both overlapping spans in the same cell', () => {
    const { counts } = tallyLaneCounts(overlapping, TZ, TODAY);
    expect(counts.get('2026-09-24')).toEqual({ [FOOD]: 2 });
  });

  it('renders that cell as one impression of two', () => {
    const { counts, earliest } = tallyLaneCounts(overlapping, TZ, TODAY);
    const { container } = render(
      <LanesMatrix categories={[food]} rows={laneRows(TODAY, earliest, counts)} />,
    );
    const cell = container.querySelector('[data-lane-cell][data-lines="2"]');
    expect(cell).not.toBeNull();
    expect(cell!.getAttribute('aria-label')).toBe('Food, 2 on 2026-09-24');
  });

  it('lands an unannotated fragment on the day it was written, and leaves a future one out', () => {
    const { counts } = tallyLaneCounts(
      [
        // 06:30Z on the 26th is still the 25th in Vancouver.
        {
          lane_id: FOOD,
          occurred_on: null,
          occurred_time: null,
          created_at: '2026-09-26T06:30:00Z',
        },
        {
          lane_id: FOOD,
          occurred_on: '2026-09-28',
          occurred_time: '19:30:00',
          created_at: '2026-09-25T20:00:00Z',
        },
      ],
      TZ,
      TODAY,
    );
    expect(counts.get('2026-09-25')).toEqual({ [FOOD]: 1 });
    expect(counts.has('2026-09-28')).toBe(false);
  });
});

describe('the five-lane preset (H20i, review)', () => {
  it('is Place / Mood / Media / Food / Day, with Day as the residual', () => {
    expect(PRESET_CATEGORIES.map((c) => c.name)).toEqual(['Place', 'Mood', 'Media', 'Food', 'Day']);
    // Music folded into Media; Food is a plate, not ramen.
    expect(PRESET_CATEGORIES.some((c) => c.name === 'Music')).toBe(false);
    expect(PRESET_CATEGORIES.find((c) => c.name === 'Food')!.icon).toBe('🍽️');
    expect(RESIDUAL_CATEGORY).toBe('Day');
    expect(PRESET_CATEGORIES.some((c) => c.name === 'Focus')).toBe(false);
    expect(PRESET_CATEGORIES.some((c) => c.name === 'Listening')).toBe(false);
  });
});
