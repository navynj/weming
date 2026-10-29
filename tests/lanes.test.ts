import { describe, expect, it } from 'vitest';

import { laneRows, monthsBack, quietLabel, QUIET_RUN } from '@/features/lanes/matrix';
import { groupByDay } from '@/lib/queries/trail';
import { depthSurface, DEPTH_SURFACES } from '@/lib/depth';
import { impressionLineCount, MAX_IMPRESSION_LINES } from '@/components/ui/waves';
import { tallyLaneCounts, type LaneCounts } from '@/lib/queries/lanes';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { written } from './written-on';

const FOCUS = 'c-focus';
const PLACE = 'c-place';

function counts(entries: Record<string, Record<string, number>>): LaneCounts {
  return new Map(Object.entries(entries));
}

describe('the matrix, newest day first', () => {
  it('runs from today back to the first record', () => {
    const rows = laneRows('2027-07-08', '2027-07-06', counts({ '2027-07-06': { [FOCUS]: 1 } }));

    expect(rows.map((row) => (row.kind === 'day' ? row.date : 'quiet'))).toEqual([
      '2027-07-08',
      '2027-07-07',
      '2027-07-06',
    ]);
  });

  it('has nothing to draw before the first record exists', () => {
    expect(laneRows('2027-07-08', null, counts({}))).toEqual([]);
  });

  it('reaches a record dated after today rather than cutting it off', () => {
    // A plan or a backfill written on tomorrow's page.
    const rows = laneRows(
      '2027-07-08',
      '2027-07-08',
      counts({ '2027-07-10': { [FOCUS]: 1 }, '2027-07-08': { [FOCUS]: 1 } }),
    );

    expect(rows[0]).toMatchObject({ kind: 'day', date: '2027-07-10' });
  });
});

describe('a cell reads the coalesced day (H20c, H21f)', () => {
  const row = (over: Partial<Parameters<typeof tallyLaneCounts>[0][number]>) => ({
    occurred_on: null,
    occurred_time: null,
    created_at: '2027-07-08T16:00:00.000Z',
    lane_id: PLACE,
    ...over,
  });

  it("shelves an unannotated block at its post's declared date", () => {
    const { counts } = tallyLaneCounts(
      [row({ splash: { declared_start: '2027-05-02' } })],
      'America/Vancouver',
      '2027-07-08',
    );
    expect([...counts.keys()]).toEqual(['2027-05-02']);
  });

  it("lets a block's own annotation win over the declared date", () => {
    const { counts } = tallyLaneCounts(
      [row({ occurred_on: '2027-07-01', splash: { declared_start: '2027-05-02' } })],
      'America/Vancouver',
      '2027-07-08',
    );
    expect([...counts.keys()]).toEqual(['2027-07-01']);
  });

  it('falls back to the day it was written', () => {
    const { counts } = tallyLaneCounts([row({})], 'America/Vancouver', '2027-07-08');
    expect([...counts.keys()]).toEqual(['2027-07-08']);
  });
});

describe('a cell counts what the day held', () => {
  it('counts inner ripples too: they contribute their count, never their time', () => {
    // The aggregation rule (H15a2) read the other way round. A break inside a
    // session is one more thing that happened, not a subtraction from it.
    const day = { [FOCUS]: 3 };
    expect(laneRows('2027-07-08', '2027-07-08', counts({ '2027-07-08': day }))[0]).toMatchObject({
      counts: { [FOCUS]: 3 },
    });
  });

  it('is an impression, log-scaled, never a tally (law 2)', () => {
    expect(impressionLineCount(0)).toBe(0);
    expect(impressionLineCount(1)).toBe(1);
    expect(impressionLineCount(2)).toBe(2);
    expect(impressionLineCount(3)).toBe(2);
    expect(impressionLineCount(4)).toBe(3);
    expect(impressionLineCount(8)).toBe(4);
  });

  it('stops at the cap, so a busy day cannot draw a chart', () => {
    expect(impressionLineCount(10_000)).toBe(MAX_IMPRESSION_LINES);
  });
});

describe('quiet stretches fold', () => {
  it('folds a run at the threshold into one row', () => {
    const rows = laneRows(
      '2027-07-08',
      '2027-07-01',
      counts({ '2027-07-08': { [FOCUS]: 1 }, '2027-07-01': { [PLACE]: 2 } }),
    );

    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ kind: 'quiet', from: '2027-07-02', to: '2027-07-07', days: 6 });
  });

  it('leaves a short gap as itself: two quiet days are still part of the week', () => {
    const rows = laneRows(
      '2027-07-08',
      '2027-07-05',
      counts({ '2027-07-08': { [FOCUS]: 1 }, '2027-07-05': { [FOCUS]: 1 } }),
    );

    expect(rows.every((row) => row.kind === 'day')).toBe(true);
    expect(rows).toHaveLength(4);
  });

  it('takes its threshold as an argument, because it is tunable', () => {
    const quiet = counts({ '2027-07-08': { [FOCUS]: 1 }, '2027-07-06': { [FOCUS]: 1 } });

    expect(laneRows('2027-07-08', '2027-07-06', quiet, QUIET_RUN)).toHaveLength(3);
    expect(laneRows('2027-07-08', '2027-07-06', quiet, 1)).toHaveLength(3);
    expect(laneRows('2027-07-08', '2027-07-06', quiet, 1)[1]).toMatchObject({ kind: 'quiet' });
  });

  it('names the stretch earliest-first, as a period', () => {
    expect(quietLabel('2027-09-02', '2027-09-06')).toBe('Sep 2 to 6');
  });

  it('names the month again when the stretch crosses one', () => {
    expect(quietLabel('2027-08-30', '2027-09-03')).toBe('Aug 30 to Sep 3');
  });
});

describe('the past sinks, by month (law 1)', () => {
  it('keeps the newest section on white', () => {
    expect(depthSurface(0)).toBe('#ffffff');
  });

  it('steps down once per month back', () => {
    expect(monthsBack('2027-07-08', '2027-06-30')).toBe(1);
    expect(depthSurface(monthsBack('2027-07-08', '2027-06-30'))).toBe('#f1f3f7');
  });

  it('stops at the bottom step rather than inventing a fourth tone', () => {
    expect(depthSurface(9)).toBe(DEPTH_SURFACES[DEPTH_SURFACES.length - 1]);
  });

  it('never steps forward for a record dated ahead of the newest section', () => {
    expect(monthsBack('2027-07-08', '2027-08-01')).toBe(0);
  });
});

describe("the Trail groups by the author's own days", () => {
  function ripple(over: Partial<RippleWithSplash>): RippleWithSplash {
    return written({
      id: 'r',
      author_id: 'a1',
      thread_pool_id: null,
      video_previews: true,
      media_meta: {},
      note: 'fixture',
      media: [],
      occurred_on: '2027-07-08',
      occurred_time: '09:00:00',
      started_at: '2027-07-08T16:00:00.000Z',
      ended_at: '2027-07-08T16:00:00.000Z',
      planned: false,
      participants: [],
      created_at: '2027-07-08T16:00:00.000Z',
      parent_ripple_id: null,
      splash_id: null,
      ...over,
    });
  }

  it('sections newest day first, each day still reading early to late', () => {
    const days = groupByDay(
      [
        ripple({ id: 'a', occurred_on: '2027-07-08', occurred_time: '09:00:00' }),
        ripple({ id: 'b', occurred_on: '2027-07-08', occurred_time: '18:00:00' }),
        ripple({ id: 'c', occurred_on: '2027-07-06', occurred_time: '11:00:00' }),
      ],
      'Asia/Seoul',
    );

    expect(days.map((day) => day.date)).toEqual(['2027-07-08', '2027-07-06']);
    expect(days[0].ripples.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps a late-night record on the day its author was living', () => {
    // 23:30 in Seoul is the previous afternoon in UTC. `occurred_on` is the
    // author's own calendar date, so the grouping never re-reads the instant.
    const days = groupByDay(
      [
        ripple({ id: 'late', occurred_on: '2027-07-08', occurred_time: '23:30:00' }),
        ripple({ id: 'early', occurred_on: '2027-07-08', occurred_time: '00:10:00' }),
      ],
      'Asia/Seoul',
    );

    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2027-07-08');
  });

  it('lands an unannotated fragment on the author-local day it was written (H20c)', () => {
    // 15:30Z on the 8th is 00:30 on the 9th in Seoul: the coalesced day is
    // the day the author was living, not the server's. Since 0013 it is
    // stored when written, from the author's zone.
    const days = groupByDay(
      [
        ripple({
          id: 'posted',
          occurred_on: null,
          occurred_time: null,
          created_at: '2027-07-08T15:30:00.000Z',
          written_on: '2027-07-09',
        }),
      ],
      'Asia/Seoul',
    );

    expect(days[0].date).toBe('2027-07-09');
  });

  it('moves a fragment to its annotation and back when the annotation is removed', () => {
    // Written in Seoul on the 9th (16:00Z on the 8th), as the trigger stores it.
    const annotated = ripple({
      id: 'x',
      occurred_on: '2027-06-02',
      occurred_time: null,
      created_at: '2027-07-08T16:00:00.000Z',
      written_on: '2027-07-09',
    });
    expect(groupByDay([annotated], 'Asia/Seoul')[0].date).toBe('2027-06-02');

    const plain = { ...annotated, occurred_on: null };
    expect(groupByDay([plain], 'Asia/Seoul')[0].date).toBe('2027-07-09');
  });
});
