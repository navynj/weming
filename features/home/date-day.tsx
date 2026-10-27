import type { ReactNode } from 'react';

import type { IsoDate } from '@/lib/time';

import { monthAbbrev, weekdayOf } from './grid';

/** The date rail's width, for the grid and every day list. */
export const DAY_RAIL_PX = 56;
/** A day list's columns: the rail, then the day's rows. */
export const DAY_LIST_TEMPLATE = `${DAY_RAIL_PX}px minmax(0, 1fr)`;

/**
 * A day in a day list (review) — the List view and a lane's page alike:
 * a date divider, then the day's rows. The divider is the day's number and
 * weekday as one unit at the left, then a thin white line at 20% across the
 * rest; the month, when it changes, is a line of its own above it. No
 * backgrounds: the dividers alone join the rows. Laid out across the whole
 * of a `DAY_LIST_TEMPLATE` grid.
 */
export function DateDay({
  day,
  monthChanges,
  children,
}: {
  day: IsoDate;
  monthChanges: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {monthChanges ? (
        <div
          data-month-label
          className="col-span-full pt-1 pb-1 pl-6 text-[10px]/none font-medium text-white/50"
        >
          {day.slice(0, 4)} {monthAbbrev(day)}
        </div>
      ) : null}
      <div
        data-day-row={day}
        data-labelled=""
        className="col-span-full flex min-w-0 items-center gap-3 pt-4 pr-4 pb-1 pl-6"
      >
        <span className="flex shrink-0 items-baseline gap-1 text-white/70">
          <span className="text-sm/none font-medium tabular-nums">{Number(day.slice(8, 10))}</span>
          <span className="text-[10px]/none font-medium text-white/50">{weekdayOf(day)}</span>
        </span>
        <span aria-hidden data-day-divider className="h-px min-w-0 flex-1 bg-white/20" />
      </div>
      <div data-cell="date" className="col-span-full flex min-w-0 flex-col pr-4 pb-1 pl-6">
        {children}
      </div>
    </>
  );
}
