import { describe, expect, it } from 'vitest';

import { inRange, shareRange } from '@/features/share-image/range';
import { todayIn } from '@/lib/time';

import { shareCards } from './share-fixtures';

describe('a shared image’s range (H63)', () => {
  it('is this week, Sunday to Saturday, from any day in it, in two rows from Thursday', () => {
    for (const today of ['2026-10-25', '2026-10-28', '2026-10-31']) {
      const range = shareRange('week', today);
      expect([range.first, range.last]).toEqual(['2026-10-25', '2026-10-31']);
      expect(range.rows).toEqual(['2026-10-25', '2026-10-29']);
      expect(range.title).toBe('Oct 25 – 31');
    }
  });

  it('crosses a month and a year as the week does', () => {
    const range = shareRange('week', '2026-12-31');
    expect([range.first, range.last]).toEqual(['2026-12-27', '2027-01-02']);
  });

  it('is this month, first to last day', () => {
    expect(shareRange('month', '2026-02-14')).toMatchObject({
      first: '2026-02-01',
      last: '2026-02-28',
      title: '2026 FEB',
    });
    expect(shareRange('month', '2028-02-14').last).toBe('2028-02-29');
  });

  it('counts this week from today where I am: a Saturday night in Vancouver is Sunday in Seoul', () => {
    const instant = new Date('2026-10-31T23:00:00-07:00');
    expect(shareRange('week', todayIn('America/Vancouver', instant)).first).toBe('2026-10-25');
    expect(shareRange('week', todayIn('Asia/Seoul', instant)).first).toBe('2026-11-01');
  });

  it('holds the records on its days and the ranges that touch them, nothing around it', () => {
    const cards = shareCards();
    const ids = (first: string, last: string) =>
      inRange(cards, { first, last }).map((c) => c.splash.id);
    expect(ids('2026-10-25', '2026-10-31').sort()).toEqual(
      ['joint', 'mine', 'ranged', 'theirs', 'unflagged', 'with-side'].sort(),
    );
    // Oct 27 holds my swim, and the range Oct 25–27 still touches it.
    expect(ids('2026-10-27', '2026-10-27').sort()).toEqual(['mine', 'ranged']);
    expect(ids('2026-11-01', '2026-11-07')).toEqual([]);
  });
});
