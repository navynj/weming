import { ADMIN_COLOR, PERSON_COLORS, WRITE_KIND_ORDER } from '@/features/admin/kinds';

import type { EventRow, OpenRow, PersonRow } from './queries';
import { dayIn, daysBetween, type Zone } from './zones';

/** A day's counts, in the dashboard's kind order: splash, ripple, reply, reaction, opens. */
export type DayCounts = [number, number, number, number, number];

export type ChartMember = {
  name: string;
  color: string;
  isAdmin: boolean;
  /** The first day drawn for them: the day they joined, or the pool's first. */
  joinedIndex: number;
  /** One per day of `days`; before `joinedIndex` they are zero and drawn blank. */
  counts: DayCounts[];
};

export type ChartData = {
  /** Every day from the pool's making through today, YYYY-MM-DD. */
  days: string[];
  members: ChartMember[];
  /** Where opens start being recorded, when it falls inside the range. */
  trackingStartIndex: number | null;
};

/**
 * A pool's activity per member and day (H71), what the pool page's charts
 * draw: counts only, a name and a colour per person, and no id. Members
 * who joined, in join order; the admin gray, the rest in turn.
 */
export function chartData(input: {
  people: PersonRow[];
  events: EventRow[];
  opens: OpenRow[];
  poolCreated: string;
  trackingStart: string | null;
  now: number;
  zone: Zone;
  adminId: string;
}): ChartData {
  const { zone } = input;
  const days = daysBetween(dayIn(Date.parse(input.poolCreated), zone), dayIn(input.now, zone));
  const index = new Map(days.map((d, i) => [d, i]));
  const at = (iso: string): number | undefined => index.get(dayIn(Date.parse(iso), zone));
  const joined = input.people
    .filter((p) => p.joined_at)
    .sort((a, b) => a.joined_at!.localeCompare(b.joined_at!));

  let next = 0;
  const members = joined.map((p): ChartMember => {
    const isAdmin = p.user_id === input.adminId;
    const joinDay = dayIn(Date.parse(p.joined_at!), zone);
    const counts: DayCounts[] = days.map(() => [0, 0, 0, 0, 0]);
    for (const e of input.events) {
      if (e.user_id !== p.user_id) continue;
      const i = at(e.at);
      const k = WRITE_KIND_ORDER.indexOf(e.kind as (typeof WRITE_KIND_ORDER)[number]);
      if (i !== undefined && k >= 0) counts[i][k] += 1;
    }
    for (const o of input.opens) {
      if (o.user_id !== p.user_id) continue;
      const i = at(o.started_at);
      if (i !== undefined) counts[i][4] += 1;
    }
    return {
      name: p.display_name,
      color: isAdmin ? ADMIN_COLOR : PERSON_COLORS[next++ % PERSON_COLORS.length],
      isAdmin,
      joinedIndex: Math.max(
        0,
        days.findIndex((d) => d >= joinDay),
      ),
      counts,
    };
  });

  const start = input.trackingStart ? dayIn(Date.parse(input.trackingStart), zone) : null;
  return {
    days,
    members,
    trackingStartIndex: start !== null && index.has(start) ? index.get(start)! : null,
  };
}
