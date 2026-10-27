'use client';

import type { IsoDate } from '@/lib/time';

import { shortDay } from './block';
import { rangeDays } from './block-day';
import type { DateRange } from './summary';

/**
 * A ripple's own day on a range splash (0031): one small chip, "Oct 8",
 * whose picker offers only the range's days. No time, no duration.
 */
export function DayChip({
  range,
  value,
  onChange,
}: {
  range: DateRange;
  value: IsoDate;
  onChange: (day: IsoDate) => void;
}) {
  return (
    <label
      data-day-chip
      className="bg-pool-100 text-pool-500 inline-flex h-[23px] items-center rounded-[5px] px-1.5 text-[10px] tabular-nums"
    >
      <select
        aria-label="Day"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-ink cursor-pointer appearance-none bg-transparent outline-none"
      >
        {rangeDays(range).map((day) => (
          <option key={day} value={day}>
            {shortDay(day)}
          </option>
        ))}
      </select>
    </label>
  );
}
