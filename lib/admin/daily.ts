import type { ActivityData, ActivitySeries, OpensRow } from '@/features/admin/activity-charts';
import { ADMIN_COLOR, PERSON_COLORS, WRITE_KIND_ORDER } from '@/features/admin/kinds';

import type { EventRow, OpenRow, PersonRow, UserEventRow } from './queries';
import { dayIn, daysBetween, type Zone } from './zones';

/** A day's counts, in the dashboard's kind order: splash, ripple, reply, reaction, opens. */
export type DayCounts = [number, number, number, number, number];

/** The colour of Home on a person's page; pools take PERSON_COLORS in turn. */
export const HOME_COLOR = '#161621';
/** The faint line counting each record once. */
export const UNIQUE_COLOR = '#6B79A3';

type Clock = { now: number; zone: Zone; trackingStart: string | null };

/**
 * The days a chart spans and how to find one: every day from the first
 * through today, in the zone.
 */
function calendar(first: string, clock: Clock) {
  const days = daysBetween(dayIn(Date.parse(first), clock.zone), dayIn(clock.now, clock.zone));
  const index = new Map(days.map((d, i) => [d, i]));
  const dayOf = (iso: string): number | undefined => index.get(dayIn(Date.parse(iso), clock.zone));
  /** The first day on or after a moment: a series' start. */
  const startOf = (iso: string): number => {
    const day = dayIn(Date.parse(iso), clock.zone);
    return Math.max(
      0,
      days.findIndex((d) => d >= day),
    );
  };
  const start = clock.trackingStart ? dayIn(Date.parse(clock.trackingStart), clock.zone) : null;
  return {
    days,
    dayOf,
    startOf,
    trackingStartIndex: start !== null && index.has(start) ? index.get(start)! : null,
  };
}

const blank = (days: string[]): DayCounts[] => days.map(() => [0, 0, 0, 0, 0]);
const kindIndex = (kind: string): number =>
  WRITE_KIND_ORDER.indexOf(kind as (typeof WRITE_KIND_ORDER)[number]);

/**
 * A pool's activity per member and day (H71), what the pool page's charts
 * draw: counts only, a name and a colour per person, and no id. Members
 * who joined, in join order; the admin gray, the rest in turn.
 */
export function poolChart(
  input: Clock & {
    people: PersonRow[];
    events: EventRow[];
    opens: OpenRow[];
    poolCreated: string;
    adminId: string;
  },
): ActivityData {
  const cal = calendar(input.poolCreated, input);
  const joined = input.people
    .filter((p) => p.joined_at)
    .sort((a, b) => a.joined_at!.localeCompare(b.joined_at!));

  let next = 0;
  const series = joined.map((p): ActivitySeries => {
    const isAdmin = p.user_id === input.adminId;
    const counts = blank(cal.days);
    for (const e of input.events) {
      if (e.user_id !== p.user_id) continue;
      const i = cal.dayOf(e.at);
      const k = kindIndex(e.kind);
      if (i !== undefined && k >= 0) counts[i][k] += 1;
    }
    for (const o of input.opens) {
      if (o.user_id !== p.user_id) continue;
      const i = cal.dayOf(o.started_at);
      if (i !== undefined) counts[i][4] += 1;
    }
    return {
      name: p.display_name,
      color: isAdmin ? ADMIN_COLOR : PERSON_COLORS[next++ % PERSON_COLORS.length],
      style: isAdmin ? 'mine' : 'solid',
      startIndex: cal.startOf(p.joined_at!),
      counts,
      hasOpens: true,
      bars: true,
    };
  });

  return {
    days: cal.days,
    series,
    opensRows: series.map((s): OpensRow => ({
      name: s.name,
      color: s.color,
      startIndex: s.startIndex,
      counts: s.counts.map((c) => c[4]),
    })),
    trackingStartIndex: cal.trackingStartIndex,
    axisLabel: 'Actions in this pool',
    rowLabel: 'Member',
    barsLabel:
      'Per member, stacked by kind (same scale for everyone; shaded days are before they joined).',
  };
}

/**
 * One person's activity per place and day (H71): Home, then each pool they
 * joined, from their join there. A record shown in several places counts
 * in each; the faint "unique" series counts each thing written once, and
 * carries the person's opens. Pool names are the only names; no lane.
 */
export function userChart(
  input: Clock & {
    name: string;
    signedUp: string;
    events: UserEventRow[];
    opens: OpenRow[];
    /** The pools they joined, with their names, in join order. */
    pools: { poolId: string; name: string; joinedAt: string }[];
  },
): ActivityData {
  const cal = calendar(input.signedUp, input);
  const places: ActivitySeries[] = [
    {
      name: 'Home',
      color: HOME_COLOR,
      style: 'solid',
      startIndex: 0,
      counts: blank(cal.days),
      hasOpens: false,
      bars: false,
    },
    ...input.pools.map((p, k) => ({
      name: p.name,
      color: PERSON_COLORS[k % PERSON_COLORS.length],
      style: 'solid' as const,
      startIndex: cal.startOf(p.joinedAt),
      counts: blank(cal.days),
      hasOpens: false,
      bars: false,
    })),
  ];
  // Home first, then the pools in the order given.
  const byPlace = new Map<string | null, ActivitySeries>(
    places.map((p, k) => [k === 0 ? null : input.pools[k - 1].poolId, p]),
  );
  const unique: ActivitySeries = {
    name: `Unique (${input.name})`,
    color: UNIQUE_COLOR,
    style: 'unique',
    startIndex: 0,
    counts: blank(cal.days),
    hasOpens: true,
    bars: false,
  };
  const seen = new Set<string>();
  // In time order, so a thing counts in the unique line on the day it was first written.
  const events = [...input.events].sort((a, b) => a.at.localeCompare(b.at));
  // The day each Home record was written, to tell a pool's new splashes from shared ones.
  const homeDay = new Map<string, number>();
  for (const e of events) {
    const i = cal.dayOf(e.at);
    if (e.pool_id === null && e.kind === 'splash' && i !== undefined) homeDay.set(e.item_key, i);
  }
  for (const e of events) {
    const i = cal.dayOf(e.at);
    const k = kindIndex(e.kind);
    if (i === undefined || k < 0) continue;
    const place = byPlace.get(e.pool_id);
    if (place) {
      place.counts[i][k] += 1;
      const written =
        e.pool_id !== null && e.kind === 'splash' ? homeDay.get(e.item_key) : undefined;
      if (written !== undefined && written < i) {
        place.sharedFromHome ??= cal.days.map(() => 0);
        place.sharedFromHome[i] += 1;
      }
    }
    // Once per thing written, wherever it shows.
    const key = `${e.kind}:${e.item_key}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.counts[i][k] += 1;
    }
  }
  for (const o of input.opens) {
    const i = cal.dayOf(o.started_at);
    if (i !== undefined) unique.counts[i][4] += 1;
  }

  return {
    days: cal.days,
    series: [...places, unique],
    opensRows: [
      {
        name: input.name,
        color: HOME_COLOR,
        startIndex: 0,
        counts: unique.counts.map((c) => c[4]),
      },
    ],
    trackingStartIndex: cal.trackingStartIndex,
    axisLabel: 'Actions by place',
    rowLabel: 'Place',
  };
}
