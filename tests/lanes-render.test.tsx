// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/lanes',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const saved: unknown[] = [];
vi.mock('@/features/lanes/actions', () => ({
  saveLane: (lane: unknown) => {
    saved.push(lane);
    return Promise.resolve({ ok: true });
  },
  deleteLane: () => Promise.resolve({ ok: true }),
}));

import { LanesMatrix } from '@/features/lanes/lanes-matrix';
import { laneRows } from '@/features/lanes/matrix';
import { EMPTY, quietDayCopy } from '@/lib/empty-states';
import type { LaneCounts } from '@/lib/queries/lanes';
import type { MyCategory } from '@/lib/queries/profile';

const FOCUS = 'c-focus';

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

function category(over: Partial<MyCategory> = {}): MyCategory {
  return {
    id: FOCUS,
    user_id: 'a1',
    name: 'Focus',
    icon: '🔍',
    default_mode: 'timed',
    position: 0,
    created_at: '2027-01-01T00:00:00Z',
    ...over,
  };
}

function matrix(counts: LaneCounts, categories = [category()]) {
  // Earliest comes from the data, as it does on the page: an archive with
  // nothing in it has no first day, which is what makes the matrix empty.
  const earliest = [...counts.keys()].sort()[0] ?? null;

  return render(
    <LanesMatrix categories={categories} rows={laneRows('2027-07-08', earliest, counts)} />,
  );
}

describe('the matrix keeps its labels in view', () => {
  it('holds the column headers at the top of the scroll', () => {
    const { container } = matrix(new Map([['2027-07-08', { [FOCUS]: 2 }]]));

    const header = container.querySelector('[data-sticky-header]')!;
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
  });

  it('holds the date column at the left edge while the lanes scroll sideways', () => {
    const { getByText } = matrix(new Map([['2027-07-08', { [FOCUS]: 2 }]]));

    const gutter = getByText('8').closest('div')!;
    expect(gutter.className).toContain('sticky');
    expect(gutter.className).toContain('left-0');
  });

  it('draws a cell as an impression and an empty one as nothing at all', () => {
    const { container } = matrix(new Map([['2027-07-08', { [FOCUS]: 4 }]]), [
      category(),
      category({ id: 'c-place', name: 'Place', icon: '📍', position: 1 }),
    ]);

    const cells = container.querySelectorAll('[data-lane-cell]');
    expect(cells[0].getAttribute('data-lines')).toBe('3');
    expect(cells[1].getAttribute('data-lines')).toBe('0');
  });

  it("opens that day's month on the ground when a cell is tapped (H21h)", () => {
    const { container } = matrix(new Map([['2027-07-08', { [FOCUS]: 1 }]]));

    expect(container.querySelector('[data-lane-cell]')!.getAttribute('href')).toBe('/?m=2027-07');
  });

  it('opens a lane on its own header, and nothing about mappings', () => {
    const { getByText, getByLabelText } = matrix(new Map([['2027-07-08', { [FOCUS]: 1 }]]));

    fireEvent.click(getByText('Focus'));

    expect(getByLabelText('Edit this lane')).toBeTruthy();
    expect((getByLabelText('Lane name') as HTMLInputElement).value).toBe('Focus');
  });
});

describe('a lane that does not exist yet', () => {
  it('suggests its glyph rather than filling one in', () => {
    const { getByLabelText } = matrix(new Map([['2027-07-08', { [FOCUS]: 1 }]]));
    fireEvent.click(getByLabelText('New lane'));

    const icon = getByLabelText('Icon') as HTMLInputElement;
    expect(icon.value).toBe('');
    expect(icon.placeholder).toBe('🌊');
  });

  it('takes the suggestion when the author never picks one', () => {
    saved.length = 0;
    const { getByLabelText, getByText } = matrix(new Map([['2027-07-08', { [FOCUS]: 1 }]]));
    fireEvent.click(getByLabelText('New lane'));
    fireEvent.change(getByLabelText('Lane name'), { target: { value: 'Reading' } });
    fireEvent.click(getByText('Add lane'));

    expect(saved[0]).toMatchObject({ id: null, name: 'Reading', icon: '🌊' });
  });

  it("keeps an existing lane's own glyph as a value, not a suggestion", () => {
    const { getByText, getByLabelText } = matrix(new Map([['2027-07-08', { [FOCUS]: 1 }]]));
    fireEvent.click(getByText('Focus'));

    expect((getByLabelText('Icon') as HTMLInputElement).value).toBe('🔍');
  });
});

describe('every empty state says something', () => {
  it('leaves today open', () => {
    expect(quietDayCopy('2027-07-08', '2027-07-08')).toBe('A quiet day so far.');
  });

  it('states a finished day rather than mourning it', () => {
    expect(quietDayCopy('2027-07-07', '2027-07-08')).toBe('A quiet day.');
  });

  it('asks a day ahead about plans, not records', () => {
    expect(quietDayCopy('2027-07-09', '2027-07-08')).toBe('Nothing planned yet.');
  });

  it('invites the first drop where no lane has anything yet', () => {
    const { getByText } = matrix(new Map());
    expect(getByText(EMPTY.lanes)).toBeTruthy();
  });
});

describe('the ropes run the whole depth of the matrix', () => {
  it('carries them through a folded stretch: only the days fold, not the lanes', () => {
    const { container } = matrix(
      new Map([
        ['2027-07-08', { [FOCUS]: 1 }],
        ['2027-07-01', { [FOCUS]: 1 }],
      ]),
      [category(), category({ id: 'c-place', name: 'Place', icon: '📍', position: 1 })],
    );

    const quiet = container.querySelector('[data-quiet-row]')!;
    expect(quiet.querySelectorAll('.border-l')).toHaveLength(2);
  });
});
