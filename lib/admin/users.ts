import { returnedOn, WRITE_KINDS, type WriteKind } from './metrics';
import type {
  OpenRow,
  PermissionRow,
  PersonRow,
  PushStatusRow,
  UserEventRow,
  UserRecordRow,
  UserRow,
} from './queries';

/**
 * The per-user view's arithmetic (H71), on metadata rows alone. Home counts
 * here include locked ripples, as time and kind: they are the person's own
 * writing. Pool views leave them out.
 */
const ms = (at: string): number => Date.parse(at);
const latest = (times: number[]): number | null => (times.length ? Math.max(...times) : null);
const earliest = (times: number[]): number | null => (times.length ? Math.min(...times) : null);

export type RecordSplit = { total: number; home: number; onePool: number; manyPools: number };

/** Home-only: on Home and in no pool. Then by how many pools show it. */
export function recordSplit(records: UserRecordRow[]): RecordSplit {
  return {
    total: records.length,
    home: records.filter((r) => r.is_home && r.pool_count === 0).length,
    onePool: records.filter((r) => r.pool_count === 1).length,
    manyPools: records.filter((r) => r.pool_count >= 2).length,
  };
}

export type PushState = { subscriptions: number; permission: string | null };

/**
 * What a browser said, in the dashboard's words (asked in the session:
 * label "granted" as "browser permission granted"). The OS may still
 * silence it, especially on iOS: granted does not mean delivered.
 */
export function permissionLabel(permission: string | null): string {
  switch (permission) {
    case 'granted':
      return 'browser permission granted';
    case 'denied':
      return 'permission denied';
    case 'default':
      return 'not asked yet';
    case 'unsupported':
      return 'not supported';
    default:
      return 'unknown';
  }
}

export type UserListRow = {
  user: UserRow;
  lastSeen: number | null;
  lastWrite: number | null;
  /** Pools they are in now. */
  pools: number;
  records: RecordSplit;
  push: PushState;
};

/** Everyone, quietest first: oldest last write at the top, and nobody-wrote-yet above that. */
export function userListRows(input: {
  users: UserRow[];
  events: UserEventRow[];
  records: UserRecordRow[];
  people: PersonRow[];
  opens: OpenRow[];
  push: PushStatusRow[];
  permissions: PermissionRow[];
}): UserListRow[] {
  const group = <T>(rows: T[], by: (row: T) => string): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) map.set(by(row), [...(map.get(by(row)) ?? []), row]);
    return map;
  };
  const events = group(input.events, (e) => e.user_id);
  const records = group(input.records, (r) => r.user_id);
  const opens = group(input.opens, (o) => o.user_id);
  const push = new Map(input.push.map((p) => [p.user_id, p.subscriptions]));
  const permission = new Map(input.permissions.map((p) => [p.user_id, p.permission]));
  const pools = new Map<string, number>();
  for (const p of input.people) {
    if (p.joined_at && !p.left_at) pools.set(p.user_id, (pools.get(p.user_id) ?? 0) + 1);
  }

  return input.users
    .map((user) => ({
      user,
      lastSeen: latest((opens.get(user.user_id) ?? []).map((o) => ms(o.started_at))),
      lastWrite: latest((events.get(user.user_id) ?? []).map((e) => ms(e.at))),
      pools: pools.get(user.user_id) ?? 0,
      records: recordSplit(records.get(user.user_id) ?? []),
      push: {
        subscriptions: push.get(user.user_id) ?? 0,
        permission: permission.get(user.user_id) ?? null,
      },
    }))
    .sort(
      (a, b) =>
        (a.lastWrite ?? -Infinity) - (b.lastWrite ?? -Infinity) ||
        a.user.display_name.localeCompare(b.user.display_name),
    );
}

export type Returned = { strict: boolean | null; retained: boolean | null };

/**
 * Back on day 3 and day 7 from sign-up (not per pool), the funnel's two
 * ways: any write anywhere, or any open, in the 24 hours from day N
 * (strict), or at any point from day N on (retained).
 */
export function signupRetention(
  signedUp: string,
  events: UserEventRow[],
  opens: OpenRow[],
  now: number,
): { day3: Returned; day7: Returned } {
  const times = [...events.map((e) => ms(e.at)), ...opens.map((o) => ms(o.started_at))];
  return {
    day3: returnedOn(ms(signedUp), times, 3, now),
    day7: returnedOn(ms(signedUp), times, 7, now),
  };
}

export type UserTiming = {
  signedUp: number;
  firstRecord: number | null;
  firstPoolJoin: number | null;
  signupToFirstRecord: number | null;
  lastSeen: number | null;
  lastWrite: number | null;
};

export function userTiming(input: {
  user: UserRow;
  records: UserRecordRow[];
  memberships: PersonRow[];
  events: UserEventRow[];
  opens: OpenRow[];
}): UserTiming {
  const signedUp = ms(input.user.signed_up_at);
  const firstRecord = earliest(input.records.map((r) => ms(r.created_at)));
  return {
    signedUp,
    firstRecord,
    firstPoolJoin: earliest(
      input.memberships.flatMap((m) => (m.joined_at ? [ms(m.joined_at)] : [])),
    ),
    signupToFirstRecord: firstRecord === null ? null : Math.max(0, firstRecord - signedUp),
    lastSeen: latest(input.opens.map((o) => ms(o.started_at))),
    lastWrite: latest(input.events.map((e) => ms(e.at))),
  };
}

export type UserPoolRow = {
  poolId: string;
  name: string;
  joinedAt: string;
  leftAt: string | null;
  lastWrite: number | null;
  counts: Record<WriteKind, number>;
};

/** Each pool they joined, in join order, with their writes there. */
export function userPoolRows(
  memberships: PersonRow[],
  poolNames: Map<string, string>,
  events: UserEventRow[],
): UserPoolRow[] {
  return memberships
    .filter((m) => m.joined_at)
    .sort((a, b) => a.joined_at!.localeCompare(b.joined_at!))
    .map((m) => {
      const here = events.filter((e) => e.pool_id === m.pool_id);
      const counts = Object.fromEntries(WRITE_KINDS.map((k) => [k, 0])) as Record<
        WriteKind,
        number
      >;
      for (const e of here) if (e.kind in counts) counts[e.kind as WriteKind] += 1;
      return {
        poolId: m.pool_id,
        name: poolNames.get(m.pool_id) ?? m.pool_id,
        joinedAt: m.joined_at!,
        leftAt: m.left_at,
        lastWrite: latest(here.map((e) => ms(e.at))),
        counts,
      };
    });
}
