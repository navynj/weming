import { describe, expect, it } from 'vitest';

import { ROW_SURFACE } from '@/features/home-daily/depth';
import { splitByRegion, type RippleWithCategory } from '@/lib/queries/ripples';
import {
  elapsedMinutes,
  minutesIntoDay,
  rippleDurationMinutes,
  rippleKind,
  rippleState,
  wallClockToInstant,
} from '@/lib/ripple-kind';
import { written } from './written-on';

const VANCOUVER = 'America/Vancouver';
const SEOUL = 'Asia/Seoul';

function ripple(over: Partial<RippleWithCategory> = {}): RippleWithCategory {
  return written({
    id: 'r1',
    author_id: 'a1',
    thread_pool_id: null,
    category_id: 'c1',
    note: 'note',
    media: [],
    occurred_on: '2026-09-19',
    occurred_time: '09:00:00',
    ended_at: null,
    planned: false,
    participants: [],
    created_at: '2026-09-19T16:00:00.000Z',
    parent_ripple_id: null,
    splash_id: null,
    started_at: null,
    category: { name: 'Focus', icon: '🔍' },
    ...over,
  });
}

describe('author-local placement', () => {
  it("reads a wall clock in the author's own zone", () => {
    // The same 12:00 is a different instant in each place, which is the whole
    // reason occurred_time is stored as a wall clock and not as a timestamp.
    expect(wallClockToInstant('2026-01-15', '12:00', VANCOUVER).toISOString()).toBe(
      '2026-01-15T20:00:00.000Z',
    );
    expect(wallClockToInstant('2026-01-15', '12:00', SEOUL).toISOString()).toBe(
      '2026-01-15T03:00:00.000Z',
    );
  });

  it('follows daylight saving rather than a fixed offset', () => {
    // Vancouver is UTC-8 in January and UTC-7 in July. A fixed offset would
    // put every summer record an hour off.
    expect(wallClockToInstant('2026-07-15', '12:00', VANCOUVER).toISOString()).toBe(
      '2026-07-15T19:00:00.000Z',
    );
  });

  it('orders the axis by wall clock, earliest first', () => {
    expect(minutesIntoDay('09:00:00')).toBeLessThan(minutesIntoDay('12:15:00'));
    expect(minutesIntoDay('00:00:00')).toBe(0);
    expect(minutesIntoDay('23:59:00')).toBe(1439);
  });
});

describe('kind, read off the two nullable columns', () => {
  it('is date-only when there is no time', () => {
    expect(rippleKind(ripple({ occurred_time: null, ended_at: null }), VANCOUVER)).toBe(
      'date-only',
    );
  });

  it('is a drop when the end equals the start', () => {
    const at = wallClockToInstant('2026-09-19', '12:15', VANCOUVER).toISOString();
    expect(rippleKind(ripple({ occurred_time: '12:15:00', ended_at: at }), VANCOUVER)).toBe('drop');
  });

  it('is timed while running, and timed once stopped', () => {
    expect(rippleKind(ripple({ ended_at: null }), VANCOUVER)).toBe('timed');

    const end = wallClockToInstant('2026-09-19', '10:30', VANCOUVER).toISOString();
    expect(rippleKind(ripple({ ended_at: end }), VANCOUVER)).toBe('timed');
  });

  it('measures a duration across the author zone, not the server zone', () => {
    const end = wallClockToInstant('2026-09-19', '10:30', VANCOUVER).toISOString();
    expect(rippleDurationMinutes(ripple({ ended_at: end }), VANCOUVER)).toBe(90);
  });

  it('measures a running timer from its start to now', () => {
    const start = wallClockToInstant('2026-09-19', '09:00', VANCOUVER);
    const now = new Date(start.getTime() + 45 * 60_000);
    expect(elapsedMinutes(ripple(), VANCOUVER, now)).toBe(45);
  });
});

describe('vitality', () => {
  it('is planned because it was committed as one, not because of the clock', () => {
    // A plan whose hour has passed is still a plan until it is checked.
    expect(rippleState(ripple({ planned: true, ended_at: null }))).toBe('planned');
  });

  it('is active while a timer runs', () => {
    expect(rippleState(ripple({ ended_at: null }))).toBe('active');
  });

  it('is done for a finished record and for a date-only one', () => {
    expect(rippleState(ripple({ ended_at: '2026-09-19T17:30:00.000Z' }))).toBe('done');
    expect(rippleState(ripple({ occurred_time: null, ended_at: null }))).toBe('done');
  });
});

describe('the two regions of a day', () => {
  it('keeps date-only records off the axis', () => {
    const { notes, timeline } = splitByRegion([
      ripple({ id: 'note', occurred_time: null }),
      ripple({ id: 'timed' }),
      ripple({ id: 'note2', occurred_time: null }),
    ]);

    expect(notes.map((r) => r.id)).toEqual(['note', 'note2']);
    expect(timeline.map((r) => r.id)).toEqual(['timed']);
  });

  it('allows several notes on one day (H5)', () => {
    const { notes } = splitByRegion([
      ripple({ id: 'a', occurred_time: null }),
      ripple({ id: 'b', occurred_time: null }),
    ]);
    expect(notes).toHaveLength(2);
  });
});

describe('the ground', () => {
  it('is the surface the row sits on, never the row itself', () => {
    expect(ROW_SURFACE).toContain('--row-surface');
  });
});
