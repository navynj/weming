import type { Card } from '@/features/home/grid';
import {
  addDays,
  boardTitle,
  COLUMNS,
  HALF_COLUMNS,
  rangeTitle,
  shiftMonth,
  WEEK_START,
  weekOf,
} from '@/features/month-board/layout';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

/** What a shared image covers (H63): this week or this month. Custom waits for phase 2. */
export type ShareSpan = 'week' | 'month';

export type ShareRange = {
  span: ShareSpan;
  first: IsoDate;
  last: IsoDate;
  /** As the board titles it: *Oct 25 – 31*, *2026 OCT*. */
  title: string;
  /** A week's two rows (H63): Sun–Wed over Thu–Sat. */
  rows?: [IsoDate, IsoDate];
};

/**
 * This week or this month, counted from today in my zone (`today` is
 * already mine), the week starting where the board's does.
 */
export function shareRange(span: ShareSpan, today: IsoDate): ShareRange {
  if (span === 'week') {
    const first = weekOf(today, WEEK_START);
    const last = addDays(first, COLUMNS - 1);
    return {
      span,
      first,
      last,
      title: rangeTitle(first, last),
      rows: [first, addDays(first, HALF_COLUMNS)],
    };
  }
  const month = monthKey(today);
  return {
    span,
    first: `${month}-01`,
    last: addDays(`${shiftMonth(month, 1)}-01`, -1),
    title: boardTitle(month),
  };
}

/**
 * The records a range holds: one on a day inside it, or a range that
 * touches it. A month's grid shows the days around it too; a shared image
 * does not carry what is outside the range it names.
 */
export function inRange(cards: Card[], range: Pick<ShareRange, 'first' | 'last'>): Card[] {
  return cards.filter((card) => {
    const start = card.splash.range?.start ?? card.day;
    const end = card.splash.range?.end ?? card.day;
    return start <= range.last && end >= range.first;
  });
}
