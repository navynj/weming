import { describe, expect, it } from 'vitest';

import {
  blockDay,
  defaultBlockDay,
  isRange,
  orderBlocks,
  rangeDays,
} from '@/features/splash/block-day';

const RANGE = { start: '2026-10-08', end: '2026-10-12' };
const ONE_DAY = { start: '2026-10-08', end: '2026-10-08' };

function block(id: string, occurred_on: string | null, created_at: string) {
  return { id, occurred_on, created_at };
}

describe('a ripple’s own day inside a range (0031)', () => {
  it('counts a range only when it spans more than a day', () => {
    expect(isRange(RANGE)).toBe(true);
    expect(isRange(ONE_DAY)).toBe(false);
    expect(isRange(null)).toBe(false);
  });

  it('reads its own day inside a range, else the splash’s start', () => {
    expect(blockDay('2026-10-10', RANGE)).toBe('2026-10-10');
    expect(blockDay(null, RANGE)).toBe('2026-10-08');
    // A frozen day outside the range, or on a one-day splash, counts for nothing.
    expect(blockDay('2026-09-01', RANGE)).toBe('2026-10-08');
    expect(blockDay('2026-10-10', ONE_DAY)).toBe('2026-10-08');
  });

  it('defaults to today inside the range, else its last day', () => {
    expect(defaultBlockDay(RANGE, '2026-10-09')).toBe('2026-10-09');
    expect(defaultBlockDay(RANGE, '2026-10-26')).toBe('2026-10-12');
    expect(defaultBlockDay(RANGE, '2026-10-01')).toBe('2026-10-12');
  });

  it('offers only the range’s days', () => {
    expect(rangeDays(RANGE)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
  });

  it('orders Oct 10 before Oct 12 regardless of written order; undated take the start', () => {
    const ordered = orderBlocks(
      [
        block('oct12', '2026-10-12', '2026-10-13T01:00:00Z'),
        block('oct10', '2026-10-10', '2026-10-14T01:00:00Z'),
        block('undated', null, '2026-10-15T01:00:00Z'),
        block('oct10-later', '2026-10-10', '2026-10-16T01:00:00Z'),
      ],
      RANGE,
    );
    expect(ordered.map((b) => b.id)).toEqual(['undated', 'oct10', 'oct10-later', 'oct12']);
  });

  it('orders by when written on a one-day splash, whatever frozen days say', () => {
    const ordered = orderBlocks(
      [
        block('b', '2026-01-01', '2026-10-09T01:00:00Z'),
        block('a', '2026-12-31', '2026-10-08T01:00:00Z'),
      ],
      ONE_DAY,
    );
    expect(ordered.map((b) => b.id)).toEqual(['a', 'b']);
  });
});
