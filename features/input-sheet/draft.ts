import type { MyCategory } from '@/lib/queries/profile';
import type { SplashSummary } from '@/features/splash/summary';
import { RESIDUAL_CATEGORY } from '@/features/auth/preset-categories';
import type { IsoDate } from '@/lib/time';

/**
 * An `occurred` annotation (H20c): an instruction to place the fragment where
 * it happened, for **not-now only** — occurred = now is redundant with
 * posting, so there is no *now* option anywhere. A date alone is a date-only
 * fragment; a time makes it a point; an end makes it a manual span.
 */
export type Annotation = {
  date: IsoDate;
  time: string | null;
  /** Both or neither: an end is a time, and a time has a date (H18). */
  endDate: IsoDate | null;
  endTime: string | null;
};

export type Draft = {
  /** Null = no lane chosen; the residual lane (Day) takes it (H20i). */
  categoryId: string | null;
  note: string;
  /** Storage paths, never URLs: a URL expires and the row would rot. */
  media: string[];
  /** Unset is the default: a plain posted fragment. */
  annotation: Annotation | null;
  /** The post this block composes, or none (H21a). */
  splashId: string | null;
};

export type Prefill = {
  categoryId?: string;
  /** Dormant (H20b): the old ripple sheet opened preset to a post. */
  splashId?: string;
  /** Dormant (H20b): a post carried inline before the page's data had it. */
  splash?: SplashSummary;
};

/**
 * The lane rule a post gives a new block (H21f): a declared lane is a
 * **default, never an override**. The chip row is always the author's; the
 * declared lane is merely where the selection starts.
 *
 *   default   the post declares a lane: a new block starts there
 *   free      none declared: the residual lane takes an unchosen block
 */
export type LaneRule = { kind: 'default'; categoryId: string } | { kind: 'free' };

export function laneRule(splash: Pick<SplashSummary, 'declaredLaneId'> | null): LaneRule {
  if (!splash || splash.declaredLaneId === null) return { kind: 'free' };
  return { kind: 'default', categoryId: splash.declaredLaneId };
}

/**
 * The category a draft commits with: what was chosen; else the post's
 * declared lane; else the residual lane (H20i). A choice always wins — a
 * block may take another lane, and the post then carries both as tags.
 */
export function resolveCategory(
  chosen: string | null,
  rule: LaneRule,
  categories: MyCategory[],
): string | null {
  if (chosen) return chosen;
  if (rule.kind === 'default') return rule.categoryId;
  return residualCategory(categories)?.id ?? null;
}

/** Day, if the account still has it; else the first lane, else nothing. */
export function residualCategory(categories: MyCategory[]): MyCategory | null {
  return categories.find((c) => c.name === RESIDUAL_CATEGORY) ?? categories[0] ?? null;
}

export function emptyDraft(prefill: Prefill): Draft {
  return {
    // No lane pre-chosen: a note-only commit is valid and lands in Day. A chip
    // tap alone is still the zero-character diary.
    categoryId: prefill.categoryId ?? null,
    note: '',
    media: [],
    annotation: null,
    splashId: prefill.splashId ?? prefill.splash?.id ?? null,
  };
}

/**
 * The draft that corrects an existing Ripple. Edit is the same sheet, not a
 * second editor — there is one place to say what a record is (H17).
 */
export function draftFrom(
  ripple: {
    note: string | null;
    media: string[];
    occurred_on: string | null;
    occurred_time: string | null;
    ended_at: string | null;
    started_at: string | null;
    splash_id: string | null;
  },
  timeZone: string,
): Draft {
  let annotation: Annotation | null = null;
  if (ripple.occurred_on) {
    const time = ripple.occurred_time ? ripple.occurred_time.slice(0, 5) : null;
    // With a clock, a span is an end past the start instant. Without one, an
    // end is a span by dates alone: the close of its end day, read back as
    // a date with no clock.
    const spans =
      ripple.ended_at !== null &&
      (time === null || (ripple.started_at !== null && ripple.ended_at !== ripple.started_at));
    annotation = {
      date: ripple.occurred_on,
      time,
      endDate: spans ? wallDate(ripple.ended_at!, timeZone) : null,
      endTime: spans && time !== null ? wallTime(ripple.ended_at!, timeZone) : null,
    };
  }

  return {
    // A block's lane is its post's (H24, 0042): none of its own to read back.
    categoryId: null,
    note: ripple.note ?? '',
    media: ripple.media,
    annotation,
    splashId: ripple.splash_id,
  };
}

/**
 * The chip a set annotation renders as, in the author's own calendar:
 * `14:30` today, `8. 17` for a date, `8. 17 14:30` for a placed time on
 * another day, `8. 17 ~ 8. 18` for a span across days, `14:30 ~ 16:00` for
 * one inside today.
 */
export function annotationLabel(annotation: Annotation, today: IsoDate): string {
  const day = (date: IsoDate): string =>
    `${Number(date.slice(5, 7))}. ${Number(date.slice(8, 10))}`;
  const start =
    annotation.date === today
      ? (annotation.time ?? 'Today')
      : annotation.time
        ? `${day(annotation.date)} ${annotation.time}`
        : day(annotation.date);

  if (!annotation.endDate) return start;
  if (annotation.endDate === annotation.date) {
    // A same-day end is a span only with clocks; by dates alone it is nothing.
    return annotation.endTime ? `${start} ~ ${annotation.endTime}` : start;
  }
  return `${annotation.date === today ? 'Today' : day(annotation.date)} ~ ${day(annotation.endDate)}`;
}

/**
 * The keys a span is compared on. Without clocks a day runs from its open to
 * its close, so a same-day end by dates alone is not backwards — it is
 * simply no span, and the commit drops it.
 */
export function spanKeys(annotation: Annotation): { start: string; end: string | null } {
  const start = `${annotation.date}T${annotation.time ?? '00:00'}`;
  if (!annotation.endDate) return { start, end: null };
  const endClock = annotation.time === null ? '23:59' : (annotation.endTime ?? annotation.time);
  return { start, end: `${annotation.endDate}T${endClock}` };
}

/** True when the end adds nothing: the same day, no clocks. */
export function spanIsEmpty(annotation: Annotation): boolean {
  return (
    annotation.endDate === annotation.date &&
    annotation.time === null &&
    annotation.endTime === null
  );
}

/** End after start, and nothing else (H20c: the present is no longer policed). */
export function annotationVerdict(annotation: Annotation): 'ok' | 'backwards' {
  const { start, end } = spanKeys(annotation);
  if (end === null) return 'ok';
  return end > start ? 'ok' : 'backwards';
}

function wallDate(instant: string, timeZone: string): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

function wallTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instant));
}
