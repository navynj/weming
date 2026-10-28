import type { IsoDate } from '@/lib/time';

import type { DateRange } from './summary';

/**
 * A ripple's own day inside its splash's range (0031). The lane is always the
 * splash's (H24); a day of its own is allowed only on a splash with an end
 * date, and only within its range. Everywhere else a ripple has none.
 */

/** A splash whose ripples may carry a day: one with a range of more than a day. */
export function isRange(range: DateRange | null | undefined): range is DateRange {
  return Boolean(range && range.end > range.start);
}

/**
 * The day a ripple reads as: its own inside a range, else its splash's start.
 * A day frozen before H24, or one outside the range, counts for nothing here.
 */
export function blockDay(occurredOn: IsoDate | null, range: DateRange | null): IsoDate | null {
  if (!range) return occurredOn;
  if (isRange(range) && occurredOn && occurredOn >= range.start && occurredOn <= range.end) {
    return occurredOn;
  }
  return range.start;
}

/** A new ripple's day on a range splash: today when today is inside it, else its last day. */
export function defaultBlockDay(range: DateRange, today: IsoDate): IsoDate {
  return today >= range.start && today <= range.end ? today : range.end;
}

/** Every day of a range, first to last: what a ripple's day may be. */
export function rangeDays(range: DateRange): IsoDate[] {
  const days: IsoDate[] = [];
  const at = new Date(`${range.start}T00:00:00Z`);
  const end = Date.parse(`${range.end}T00:00:00Z`);
  while (at.getTime() <= end) {
    days.push(at.toISOString().slice(0, 10));
    at.setUTCDate(at.getUTCDate() + 1);
  }
  return days;
}

/** A splash's declared range, or none: what `orderBlocks` reads a ripple's day against. */
export function declaredRange(splash: {
  declared_start: IsoDate | null;
  declared_end: IsoDate | null;
}): DateRange | null {
  return splash.declared_start
    ? { start: splash.declared_start, end: splash.declared_end ?? splash.declared_start }
    : null;
}

/** When a ripple was written, as an instant: never its clock text, which carries an offset. */
function writtenAt(createdAt: string): number {
  const at = Date.parse(createdAt);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * Ripples inside a splash, in reading order (0031, H42g) — the one order
 * every list of them uses: the stack card, the detail sheet, a pool's
 * threads, Home's per-pool tabs, a notification's ripple, the board's ring.
 * On a range record, by the ripple's day (its own inside the range, else
 * the start), then by when it was written; on any other, by when it was
 * written alone — a frozen own date places nothing (H24). Written times
 * compare as instants, never as local or author-local clock text, so the
 * authors' zones cannot change the order; then by id, so a tie reads the
 * same everywhere.
 */
export function orderBlocks<
  T extends { occurred_on: IsoDate | null; created_at: string; id?: string },
>(blocks: T[], range: DateRange | null): T[] {
  const day = (b: T): string => (isRange(range) ? (blockDay(b.occurred_on, range) ?? '') : '');
  return [...blocks].sort(
    (a, b) =>
      day(a).localeCompare(day(b)) ||
      writtenAt(a.created_at) - writtenAt(b.created_at) ||
      (a.id ?? '').localeCompare(b.id ?? ''),
  );
}
