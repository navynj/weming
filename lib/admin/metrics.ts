import type { EventRow, NotificationRow, OpenRow, PersonRow, PoolRow } from './queries';

/**
 * The dashboard's arithmetic (H71), on rows that hold no content. Pure, so
 * it is tested without a database; times are epoch milliseconds.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const INACTIVE_AFTER_MS = 3 * DAY_MS;

export type WriteKind = 'splash' | 'ripple' | 'reply' | 'reaction';
export const WRITE_KINDS: WriteKind[] = ['splash', 'ripple', 'reply', 'reaction'];
export type OpenKind = 'notification' | 'direct' | 'influenced';

export type Ratio = { yes: number; of: number };
export type Returned = { strict: Ratio; retained: Ratio };

export type Funnel = {
  invited: number;
  joined: number;
  firstSplash: number;
  day3: Returned;
  day7: Returned;
};

const ms = (at: string): number => Date.parse(at);

/** Writes per pool and person, and opens per person, as sorted times. */
export type Activity = {
  writes: Map<string, number[]>;
  opens: Map<string, number[]>;
};

const key = (pool: string, user: string): string => `${pool}:${user}`;

export function activityOf(events: EventRow[], opens: OpenRow[]): Activity {
  const writes = new Map<string, number[]>();
  for (const e of events) {
    const k = key(e.pool_id, e.user_id);
    writes.set(k, [...(writes.get(k) ?? []), ms(e.at)]);
  }
  const byUser = new Map<string, number[]>();
  for (const o of opens)
    byUser.set(o.user_id, [...(byUser.get(o.user_id) ?? []), ms(o.started_at)]);
  return { writes, opens: byUser };
}

/** A person's writes in a pool, and their opens anywhere: an open is not in a pool. */
function activityTimes(activity: Activity, pool: string, user: string): number[] {
  return [...(activity.writes.get(key(pool, user)) ?? []), ...(activity.opens.get(user) ?? [])];
}

/**
 * Back on day N after joining, two ways. Strict: any write or open in the
 * 24 hours that start N days after the join. Retained: any at all from
 * then on. Null until it can be answered: strict once its window has
 * closed, retained once it has opened.
 */
export function returnedOn(
  joined: number,
  times: number[],
  n: number,
  now: number,
): { strict: boolean | null; retained: boolean | null } {
  const start = joined + n * DAY_MS;
  const end = start + DAY_MS;
  return {
    strict: now < end ? null : times.some((t) => t >= start && t < end),
    retained: now < start ? null : times.some((t) => t >= start),
  };
}

function tally(ratio: Ratio, answer: boolean | null): void {
  if (answer === null) return;
  ratio.of += 1;
  if (answer) ratio.yes += 1;
}

/**
 * A pool's owner joined when their member row says, and when the pool was
 * made only without one (asked in the session: "use their own
 * pool_members.joined_at if it exists, and fall back to pools.created_at
 * only when it doesn't"). An owner handed the pool keeps their own join.
 */
export function withOwnersJoined(people: PersonRow[], pools: PoolRow[]): PersonRow[] {
  const created = new Map(pools.map((p) => [p.pool_id, p.created_at]));
  return people.map((p) =>
    p.is_owner && !p.joined_at && created.has(p.pool_id)
      ? { ...p, joined_at: created.get(p.pool_id)! }
      : p,
  );
}

/**
 * invited → joined → first splash → back on day 3 → on day 7. A pool's
 * owner made it and was never invited, so is left out of that step alone:
 * they count from joined on, so Joined can exceed Invited. Expects people
 * through withOwnersJoined.
 */
export function funnelOf(
  people: PersonRow[],
  events: EventRow[],
  activity: Activity,
  now: number,
): Funnel {
  const splashed = new Set(
    events.filter((e) => e.kind === 'splash').map((e) => key(e.pool_id, e.user_id)),
  );
  const funnel: Funnel = {
    invited: 0,
    joined: 0,
    firstSplash: 0,
    day3: { strict: { yes: 0, of: 0 }, retained: { yes: 0, of: 0 } },
    day7: { strict: { yes: 0, of: 0 }, retained: { yes: 0, of: 0 } },
  };
  for (const p of people) {
    if (!p.is_owner) funnel.invited += 1;
    if (!p.joined_at) continue;
    funnel.joined += 1;
    if (splashed.has(key(p.pool_id, p.user_id))) funnel.firstSplash += 1;
    const times = activityTimes(activity, p.pool_id, p.user_id);
    for (const [n, slot] of [
      [3, funnel.day3],
      [7, funnel.day7],
    ] as const) {
      const back = returnedOn(ms(p.joined_at), times, n, now);
      tally(slot.strict, back.strict);
      tally(slot.retained, back.retained);
    }
  }
  return funnel;
}

export type PoolSummary = {
  pool: PoolRow;
  members: number;
  counts: Record<WriteKind, number>;
  lastActivity: number | null;
  /** The newest write by anyone but the admin, who posts to every pool. */
  lastOthersActivity: number | null;
  /** By others' activity: the admin's own writes do not keep a pool alive. */
  active: boolean;
  adminIsMember: boolean;
  linkVisits: number;
};

export function poolSummaries(
  poolRows: PoolRow[],
  people: PersonRow[],
  events: EventRow[],
  linkVisits: { pool_id: string }[],
  adminId: string,
  now: number,
): PoolSummary[] {
  const summaries = new Map<string, PoolSummary>(
    poolRows.map((pool) => [
      pool.pool_id,
      {
        pool,
        members: 0,
        counts: { splash: 0, ripple: 0, reply: 0, reaction: 0 },
        lastActivity: null,
        lastOthersActivity: null,
        active: false,
        adminIsMember: false,
        linkVisits: 0,
      },
    ]),
  );
  for (const p of people) {
    const s = summaries.get(p.pool_id);
    if (!s || !p.joined_at || p.left_at) continue;
    s.members += 1;
    if (p.user_id === adminId) s.adminIsMember = true;
  }
  for (const e of events) {
    const s = summaries.get(e.pool_id);
    if (!s) continue;
    s.counts[e.kind as WriteKind] += 1;
    s.lastActivity = Math.max(s.lastActivity ?? 0, ms(e.at));
    if (e.user_id !== adminId) {
      s.lastOthersActivity = Math.max(s.lastOthersActivity ?? 0, ms(e.at));
    }
  }
  for (const v of linkVisits) {
    const s = summaries.get(v.pool_id);
    if (s) s.linkVisits += 1;
  }
  for (const s of summaries.values()) {
    s.active = s.lastOthersActivity !== null && now - s.lastOthersActivity < INACTIVE_AFTER_MS;
  }
  return [...summaries.values()].sort(
    (a, b) =>
      (b.lastOthersActivity ?? 0) - (a.lastOthersActivity ?? 0) ||
      (b.lastActivity ?? 0) - (a.lastActivity ?? 0) ||
      a.pool.name.localeCompare(b.pool.name),
  );
}

export type MemberRow = {
  person: PersonRow;
  lastSeen: number | null;
  lastWrite: number | null;
  joinToFirstSplash: number | null;
  counts: Record<WriteKind, number>;
  photoSplashes: number;
  textSplashes: number;
  opens: Record<OpenKind, number>;
};

/** A pool's people, each with their own writes there and their opens anywhere. */
export function memberRows(people: PersonRow[], events: EventRow[], opens: OpenRow[]): MemberRow[] {
  return people.map((person) => {
    const mine = events.filter((e) => e.user_id === person.user_id && e.pool_id === person.pool_id);
    const myOpens = opens.filter((o) => o.user_id === person.user_id);
    const counts: Record<WriteKind, number> = { splash: 0, ripple: 0, reply: 0, reaction: 0 };
    for (const e of mine) counts[e.kind as WriteKind] += 1;
    const splashes = mine.filter((e) => e.kind === 'splash');
    const joined = person.joined_at ? ms(person.joined_at) : null;
    const after = joined === null ? [] : splashes.map((e) => ms(e.at)).filter((t) => t >= joined);
    const opensBy: Record<OpenKind, number> = { notification: 0, direct: 0, influenced: 0 };
    for (const o of myOpens) opensBy[o.kind as OpenKind] += 1;
    return {
      person,
      lastSeen: myOpens.length ? Math.max(...myOpens.map((o) => ms(o.started_at))) : null,
      lastWrite: mine.length ? Math.max(...mine.map((e) => ms(e.at))) : null,
      joinToFirstSplash: joined !== null && after.length ? Math.min(...after) - joined : null,
      counts,
      photoSplashes: splashes.filter((e) => e.has_media).length,
      textSplashes: splashes.filter((e) => !e.has_media).length,
      opens: opensBy,
    };
  });
}

export type NotifyStats = {
  sent: number;
  tapped: number;
  influenced: number;
  /** Of those sent. */
  tapRate: number | null;
  /** Of those sent: not tapped, and a direct open followed within 30 minutes. */
  influencedRate: number | null;
  /** Send to open, tapped or influenced. */
  medianToOpen: number | null;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function notifyStats(rows: NotificationRow[]): NotifyStats {
  const waits: number[] = [];
  let tapped = 0;
  let influenced = 0;
  for (const n of rows) {
    const sent = ms(n.delivered_at);
    const opened = n.clicked_at ?? n.influenced_open_at;
    if (n.clicked_at) tapped += 1;
    else if (n.influenced_open_at) influenced += 1;
    // A folded reaction pushed again can land after its tap: no wait to read.
    if (opened && ms(opened) >= sent) waits.push(ms(opened) - sent);
  }
  const sent = rows.length;
  return {
    sent,
    tapped,
    influenced,
    tapRate: sent ? tapped / sent : null,
    influencedRate: sent ? influenced / sent : null,
    medianToOpen: median(waits),
  };
}

/** Rows grouped by a key, each group's stats, busiest first. */
export function notifyStatsBy(
  rows: NotificationRow[],
  by: (row: NotificationRow) => string,
): { key: string; stats: NotifyStats }[] {
  const groups = new Map<string, NotificationRow[]>();
  for (const row of rows) groups.set(by(row), [...(groups.get(by(row)) ?? []), row]);
  return [...groups.entries()]
    .map(([k, group]) => ({ key: k, stats: notifyStats(group) }))
    .sort((a, b) => b.stats.sent - a.stats.sent);
}
