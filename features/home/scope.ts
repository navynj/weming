import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';
import { splashPath } from '@/lib/routes';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The month the ground shows (H21h): `?m=YYYY-MM`, else the current month.
 * Scope, not scroll: the ground shows that month and nothing else.
 */
export function scopedMonth(param: string | string[] | undefined, today: IsoDate): string {
  const candidate = Array.isArray(param) ? param[0] : param;
  return candidate && MONTH.test(candidate) ? candidate : monthKey(today);
}

/** Home's three views (round 3; Calendar first). */
export type HomeView = 'lane' | 'date' | 'board';

/**
 * `?view=`: a lane page's tabs send Home back on that view (review);
 * anything else, the Calendar. Here, not beside the toggle, so the server
 * may call it: the toggle's module is the client's.
 */
export function homeViewParam(value: string | undefined): HomeView {
  return value === 'lane' || value === 'date' ? value : 'board';
}

/** The link that scopes the ground to a month. */
export function monthHref(month: string): string {
  return `/?m=${month}`;
}

/**
 * A post's URL. Opened in the app it is a sheet over the current screen,
 * which stays as it was beneath (review), so it carries no way back.
 */
export function splashHref(id: string): string {
  return splashPath(id);
}

/** `September`, from `2026-09`. */
export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
}
