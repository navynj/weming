import { describe, expect, it } from 'vitest';

import {
  formatPillDate,
  ghostTitle,
  lastDayOf,
  monthsBetween,
  monthsOf,
  positionInMonth,
  summarizeAll,
  summarizeOrphan,
  summarizeSplash,
  type Splash,
  type SplashBlock,
} from '@/features/splash/summary';
import { dayOf, flowInstant, restingInstant } from '@/lib/flow-key';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const NOW = new Date('2026-09-25T20:00:00.000Z');

function block(over: Partial<SplashBlock> & { id: string }): SplashBlock {
  return {
    category_id: 'c-day',
    note: 'fixture words',
    occurred_on: null,
    occurred_time: null,
    created_at: '2026-09-20T16:00:00.000Z',
    ...over,
  };
}

function splash(over: Partial<Splash> = {}): Splash {
  return written({
    id: 's1',
    owner_id: 'a1',
    title: 'Whistler',
    declared_start: null,
    declared_end: null,
    declared_lane_id: null,
    session_id: null,
    icon: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: '2026-09-01T16:00:00.000Z',
    ...over,
  });
}

describe('a declaration is a default, never an override (H21f)', () => {
  it('rests an unannotated block at the declared date, and lets an annotation win', () => {
    const resting = { ...block({ id: 'r' }), splash: { declared_start: '2026-08-17' } };
    const placed = { ...resting, occurred_on: '2026-09-02' };
    const plain = block({ id: 'p' });

    expect(dayOf(resting, TZ)).toBe('2026-08-17');
    expect(dayOf(placed, TZ)).toBe('2026-09-02');
    expect(dayOf(plain, TZ)).toBe('2026-09-20');
    // A resting block sits above every real instant of its day, like a
    // date-only one — a rank, so no reader's zone can move it (0013).
    expect(flowInstant(resting, TZ)).toBe(restingInstant('2026-08-17'));
  });
});

describe('a block inherits its post’s lane and date (H24)', () => {
  it('places its blocks on its own range, before any join exists', () => {
    const summary = summarizeSplash(
      splash({ declared_start: '2026-08-17', declared_end: '2026-08-20' }),
      [block({ id: 'a', occurred_on: '2026-09-02' })],
      TZ,
      NOW,
    );
    expect(summary.blocks[0].day).toBe('2026-08-20');
  });

  it('carries its own lane alone: a block’s frozen lane adds no tag', () => {
    const blocks = [
      block({ id: 'a', category_id: 'c-media', created_at: '2026-09-21T16:00:00Z' }),
      block({ id: 'b', category_id: 'c-day', created_at: '2026-09-23T16:00:00Z' }),
    ];
    expect(summarizeSplash(splash({ declared_lane_id: 'c-day' }), blocks, TZ, NOW).laneIds).toEqual(
      ['c-day'],
    );
    // Joint and Just mine have no lane of mine: their pool lane stands in elsewhere.
    expect(summarizeSplash(splash(), blocks, TZ, NOW).laneIds).toEqual([]);
  });

  it('orders its blocks by when they were written, not by their own dates', () => {
    const summary = summarizeSplash(
      splash({ declared_start: '2026-09-01' }),
      [
        block({ id: 'later', occurred_on: '2026-08-01', created_at: '2026-09-22T16:00:00Z' }),
        block({ id: 'earlier', occurred_on: '2026-09-30', created_at: '2026-09-21T16:00:00Z' }),
      ],
      TZ,
      NOW,
    );
    expect(summary.blocks.map((b) => b.instant)).toEqual([
      Date.parse('2026-09-21T16:00:00Z'),
      Date.parse('2026-09-22T16:00:00Z'),
    ]);
  });
});

describe('a post’s range and months (H21e)', () => {
  it('is placed by its own range: a block’s date outside it moves nothing', () => {
    const summary = summarizeSplash(
      splash({ declared_start: '2026-08-17', declared_end: '2026-08-20' }),
      [block({ id: 'late', occurred_on: '2026-09-02' })],
      TZ,
      NOW,
    );
    expect(summary.declaredRange).toEqual({ start: '2026-08-17', end: '2026-08-20' });
    expect(summary.range).toEqual({ start: '2026-08-17', end: '2026-08-20' });
    expect(monthsOf(summary)).toEqual(['2026-08']);
  });

  it('appears in every month its range touches, at the range’s end clipped to each', () => {
    const summary = summarizeSplash(
      splash({ declared_start: '2026-08-28', declared_end: '2026-09-03' }),
      [block({ id: 'a', occurred_on: '2026-08-29' })],
      TZ,
      NOW,
    );
    expect(monthsOf(summary)).toEqual(['2026-08', '2026-09']);
    expect(positionInMonth(summary, '2026-08').date).toBe('2026-08-31');
    expect(positionInMonth(summary, '2026-09').date).toBe('2026-09-03');
  });

  it('reads its own range as the period on the pill', () => {
    // A block's own span (frozen) adds nothing: the post's range is the period.
    const span = block({
      id: 'trip',
      occurred_on: '2026-09-12',
      ended_at: '2026-09-20T06:59:59.999Z',
      created_at: '2026-09-12T16:00:00.000Z',
    });
    const summary = summarizeSplash(
      splash({ declared_start: '2026-09-12', declared_end: '2026-09-14' }),
      [span],
      TZ,
      NOW,
    );
    expect(summary.range).toEqual({ start: '2026-09-12', end: '2026-09-14' });
    const at = positionInMonth(summary, '2026-09');
    expect(at.date).toBe('2026-09-14');
    expect(at.span).toEqual({ start: '2026-09-12', end: '2026-09-14' });
    expect(formatPillDate(at.span)).toBe('Sep 12–14');
  });

  it('sits on the day it was made while it has no range of its own', () => {
    const summary = summarizeSplash(splash({ created_at: '2026-09-23T16:00:00Z' }), [], TZ, NOW);
    expect(summary.declaredRange).toBeNull();
    expect(summary.range).toEqual({ start: '2026-09-23', end: '2026-09-23' });
    expect(monthsOf(summary)).toEqual(['2026-09']);
    expect(positionInMonth(summary, '2026-09').date).toBe('2026-09-23');
  });

  it('walks months inclusively, across a year', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
  });
});

describe('an untitled post (H21a)', () => {
  it('shows its first block’s first words as a ghost title', () => {
    expect(ghostTitle('coffee went cold while I read the whole thing')).toBe(
      'coffee went cold while I read…',
    );
    expect(ghostTitle('short')).toBe('short');
    expect(ghostTitle(null)).toBeNull();
    const summary = summarizeSplash(
      splash({ title: '' }),
      [
        block({ id: 'later', note: 'later words', created_at: '2026-09-22T16:00:00Z' }),
        block({ id: 'first', note: 'first words here', created_at: '2026-09-21T16:00:00Z' }),
      ],
      TZ,
      NOW,
    );
    expect(summary.ghostTitle).toBe('first words here');
    expect(summarizeSplash(splash(), [block({ id: 'a' })], TZ, NOW).ghostTitle).toBeNull();
  });

  it('is what a splashless block becomes, with the block’s own id and lane', () => {
    const lone = summarizeOrphan(block({ id: 'r-lone', category_id: 'c-place' }), TZ, NOW);
    expect(lone).toMatchObject({
      id: 'r-lone',
      orphan: true,
      title: '',
      laneIds: ['c-place'],
      count: 1,
      range: { start: '2026-09-20', end: '2026-09-20' },
    });
  });

  it('is summarised alongside the posts, recent first', () => {
    const all = summarizeAll(
      [splash()],
      [
        { ...block({ id: 'member', created_at: '2026-09-10T16:00:00Z' }), splash_id: 's1' },
        { ...block({ id: 'lone', created_at: '2026-09-24T16:00:00Z' }), splash_id: null },
      ],
      TZ,
      NOW,
    );
    expect(all.map((s) => s.id)).toEqual(['lone', 's1']);
  });
});

describe('a pill’s date', () => {
  it('reads a day, a run within a month, or a span across months', () => {
    expect(formatPillDate({ start: '2026-09-12', end: '2026-09-12' })).toBe('Sep 12');
    expect(formatPillDate({ start: '2026-08-17', end: '2026-08-20' })).toBe('Aug 17–20');
    expect(formatPillDate({ start: '2026-08-28', end: '2026-09-03' })).toBe('Aug 28 – Sep 3');
  });
});

describe('a block whose post cannot be read (H23)', () => {
  it('is never dropped: it reads as a post of one', () => {
    const all = summarizeAll(
      [splash()],
      [
        { ...block({ id: 'member' }), splash_id: 's1' },
        { ...block({ id: 'unseen' }), splash_id: 'joint-of-a-pool-i-left' },
      ],
      TZ,
      NOW,
    );
    expect(all.map((s) => s.id).sort()).toEqual(['s1', 'unseen']);
  });
});
