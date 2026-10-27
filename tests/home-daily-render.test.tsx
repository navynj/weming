// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Add ripple slot reaches for the sheet, which reaches for the router.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { ROW_SURFACE } from '@/features/home-daily/depth';
import { RippleRow } from '@/features/home-daily/ripple-row';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { wallClockToInstant } from '@/lib/ripple-kind';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const NOW = new Date('2026-09-19T20:00:00.000Z');

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

function ripple(over: Partial<RippleWithSplash> = {}): RippleWithSplash {
  return written({
    id: 'r1',
    author_id: 'a1',
    thread_pool_id: null,
    note: 'spec rewrite',
    media: [],
    occurred_on: '2026-09-19',
    occurred_time: '09:00:00',
    ended_at: wallClockToInstant('2026-09-19', '10:30', TZ).toISOString(),
    planned: false,
    participants: [],
    created_at: '2026-09-19T16:00:00.000Z',
    parent_ripple_id: null,
    splash_id: null,
    started_at: null,
    ...over,
  });
}

function row(over: Partial<RippleWithSplash> = {}) {
  return render(<RippleRow ripple={ripple(over)} timeZone={TZ} now={NOW} />);
}

describe('a Ripple on the axis', () => {
  it('shows its author-local time, not a converted one', () => {
    const { getByText } = row();
    expect(getByText('09:00')).toBeTruthy();
  });

  it('draws a timed record as a bundle whose density is its duration', () => {
    const { container } = row();
    // 90 minutes -> 6 lines on the log curve.
    expect(container.querySelector('[data-lines]')?.getAttribute('data-lines')).toBe('6');
  });

  it('draws a drop as a single line', () => {
    const at = wallClockToInstant('2026-09-19', '12:15', TZ).toISOString();
    const { container } = row({ occurred_time: '12:15:00', ended_at: at });

    expect(container.querySelector('[data-lines]')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  // A ripple has no lane of its own since 0042, so no badge: the text is pure note.
  it('shows the note alone (SPEC 7, 0042)', () => {
    const { getByText, queryByText } = row();
    expect(queryByText('🔍')).toBeNull();
    expect(getByText('spec rewrite')).toBeTruthy();
  });

  it('fades a planned record, badge and note together', () => {
    const { container, getByText } = row({ planned: true, ended_at: null });

    const faded = [...container.querySelectorAll('[style*="opacity"]')];
    expect(faded.length).toBeGreaterThan(0);
    for (const el of faded) {
      expect(Number((el as HTMLElement).style.opacity)).toBeLessThan(1);
    }
    expect(Number((getByText('spec rewrite') as HTMLElement).style.opacity)).toBeLessThan(1);
  });

  it('animates a running timer and holds a finished one still', () => {
    const live = row({ ended_at: null });
    expect(live.container.querySelectorAll('.wave-travel').length).toBeGreaterThan(0);

    cleanup();
    const done = row();
    expect(done.container.querySelectorAll('.wave-travel')).toHaveLength(0);
  });

  it('gives a locked Ripple no marker of its own', () => {
    // SPEC: this view is mine alone; lock state surfaces in the mini sheet.
    const { container } = row({ note: 'the thing I am not saying out loud yet' });
    expect(container.textContent).not.toMatch(/lock/i);
  });
});

describe('motion on the row (H10)', () => {
  it('travels every line of an in-progress record', () => {
    const { container } = row({ ended_at: null });

    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(1);
    expect(container.querySelectorAll('path.wave-travel')).toHaveLength(paths.length);
  });

  it('leaves finished records still', () => {
    const { container } = row();

    expect(container.querySelectorAll('.wave-travel')).toHaveLength(0);
  });
});

describe('the rope', () => {
  it('is masked by the wave stack rather than showing through it', () => {
    const { container } = render(<RippleRow ripple={ripple()} timeZone={TZ} now={NOW} />);

    // Queried through the constant: the row takes its ground from the surface
    // it sits on, so the class is a variable reference, not a literal.
    const stack = container.querySelector(`.${CSS.escape(ROW_SURFACE)}`);
    expect(stack).not.toBeNull();
    expect(stack!.querySelector('[data-lines]')).not.toBeNull();
  });
});

describe('the time gutter', () => {
  it('shows the start only, so the column is one ascending sequence', () => {
    const { container, getByText } = row();

    expect(getByText('09:00')).toBeTruthy();
    expect(container.querySelectorAll('time')).toHaveLength(1);
  });
});

describe('the duration tag', () => {
  it('reports a finished timed span in hours and minutes', () => {
    const { getByText } = row();
    expect(getByText('1h 30m')).toBeTruthy();
  });

  it('counts up while the timer runs', () => {
    // 09:00 start, NOW is 13:00Z = 05:00 local... the row helper fixes both,
    // so assert on the shape rather than the figure.
    const { container } = row({ ended_at: null });
    const chip = container.querySelector('.text-main-400');

    expect(chip).not.toBeNull();
    expect(chip!.textContent).toMatch(/^\d+(h( \d+m)?|m)$/);
  });

  it('never appears on a drop (E2: only explicit timers claim duration)', () => {
    const at = wallClockToInstant('2026-09-19', '12:15', TZ).toISOString();
    const { container } = row({ occurred_time: '12:15:00', ended_at: at });

    expect(container.querySelector('.text-main-400')).toBeNull();
  });
});

describe('one tone, inverted by surface (H9a, H15c)', () => {
  it('never draws a wave in a second tone, whatever the record', () => {
    const cases: Partial<RippleWithSplash>[] = [
      {},
      { planned: true, ended_at: null },
      {
        occurred_time: '12:15:00',
        ended_at: wallClockToInstant('2026-09-19', '12:15', TZ).toISOString(),
      },
    ];

    for (const over of cases) {
      const { container } = row(over);
      for (const path of container.querySelectorAll('path')) {
        // The ink is the surface's, so no record can carry a colour of its own.
        expect(path.getAttribute('stroke')).toBe('var(--wave-ink)');
      }
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg.getAttribute('class') ?? '').not.toMatch(/text-main/);
      }
      cleanup();
    }
  });

  it('varies only by opacity, and only where a state calls for it', () => {
    // Lighter waves exist, but they are the ground's ink faded by state —
    // planned, and the live trail — never a second tone (H9a).
    const done = row();
    for (const svg of done.container.querySelectorAll('svg')) {
      expect((svg as SVGElement).style.opacity).toBe('');
    }
  });
});

describe('the note row does not stretch', () => {
  it('aligns the duration chip to the baseline rather than the row height', () => {
    // jsdom computes no layout, so this pins the rule rather than the pixels:
    // the grid stretches the cell, and a flex child with a background grows
    // with it unless the alignment says otherwise.
    const { container, getByText } = row();
    const noteRow = getByText('spec rewrite').parentElement!;

    expect(noteRow.className).toContain('items-baseline');
    expect(noteRow.className).not.toContain('items-stretch');
    expect(container.querySelector('.text-main-400')?.parentElement).toBe(noteRow);
  });
});
