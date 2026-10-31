import { describe, expect, it } from 'vitest';

import { DAY_MS } from '@/lib/admin/metrics';
import type { OpenRow, PersonRow, UserEventRow, UserRecordRow, UserRow } from '@/lib/admin/queries';
import {
  permissionLabel,
  recordSplit,
  signupRetention,
  userListRows,
  userPoolRows,
  userTiming,
} from '@/lib/admin/users';

/** The per-user view's arithmetic (H71), on metadata rows alone. */
const T0 = Date.parse('2026-10-01T12:00:00Z');
const at = (days: number, hours = 0): string =>
  new Date(T0 + days * DAY_MS + hours * 3_600_000).toISOString();

const user = (id: string, signedUp = at(0)): UserRow => ({
  user_id: id,
  display_name: id.toUpperCase(),
  signed_up_at: signedUp,
});
const ev = (
  u: string,
  pool: string | null,
  kind: string,
  when: string,
  item = when,
): UserEventRow => ({
  user_id: u,
  pool_id: pool,
  kind,
  at: when,
  splash_id: 's',
  has_media: false,
  item_key: item,
});
const rec = (u: string, isHome: boolean, pools: number, when = at(1)): UserRecordRow => ({
  user_id: u,
  splash_id: crypto.randomUUID(),
  created_at: when,
  is_home: isHome,
  pool_count: pools,
  has_media: false,
});
const member = (
  u: string,
  pool: string,
  joined: string | null,
  left: string | null = null,
): PersonRow => ({
  pool_id: pool,
  user_id: u,
  display_name: u,
  invited_at: joined,
  joined_at: joined,
  left_at: left,
  is_owner: false,
});
const open = (u: string, when: string): OpenRow => ({
  id: `${u}-${when}`,
  user_id: u,
  started_at: when,
  platform: 'ios-pwa',
  kind: 'direct',
  notification_pool_id: null,
});

describe('the record split', () => {
  it('counts Home only as on Home and in no pool, then by how many pools show it', () => {
    expect(
      recordSplit([
        rec('a', true, 0),
        rec('a', true, 0),
        rec('a', true, 1),
        rec('a', false, 1),
        rec('a', true, 3),
      ]),
    ).toEqual({ total: 5, home: 2, onePool: 2, manyPools: 1 });
  });
});

describe('the users list', () => {
  it('puts the quietest first, nobody-wrote-yet at the very top, and counts current pools only', () => {
    const rows = userListRows({
      users: [user('ana'), user('ben'), user('cy')],
      events: [ev('ana', null, 'splash', at(9)), ev('ben', 'p', 'ripple', at(2))],
      records: [rec('ana', true, 0)],
      people: [
        member('ana', 'p', at(0)),
        member('ana', 'q', at(0), at(3)),
        member('ana', 'r', null),
      ],
      opens: [open('ana', at(9, 1))],
      push: [{ user_id: 'ana', subscriptions: 2, last_used_at: null }],
      permissions: [{ user_id: 'ben', permission: 'denied', at: at(2) }],
    });
    expect(rows.map((r) => r.user.user_id)).toEqual(['cy', 'ben', 'ana']);
    const ana = rows[2];
    expect(ana).toMatchObject({
      pools: 1,
      lastSeen: Date.parse(at(9, 1)),
      push: { subscriptions: 2, permission: null },
    });
    expect(rows[1].push).toEqual({ subscriptions: 0, permission: 'denied' });
  });

  it('says what a browser reported, in the dashboard’s words', () => {
    expect(permissionLabel('granted')).toBe('browser permission granted');
    expect(permissionLabel('denied')).toBe('permission denied');
    expect(permissionLabel(null)).toBe('unknown');
  });
});

describe('one person', () => {
  it('counts back on day 3 and 7 from sign-up, anywhere, two ways', () => {
    const back = signupRetention(
      at(0),
      [ev('a', 'p', 'reply', at(3, 2))],
      [open('a', at(9))],
      T0 + 10 * DAY_MS,
    );
    expect(back.day3).toEqual({ strict: true, retained: true });
    expect(back.day7).toEqual({ strict: false, retained: true });
  });

  it('reads the timing from sign-up, records, joins, opens and writes', () => {
    const t = userTiming({
      user: user('a', at(0)),
      records: [rec('a', true, 0, at(2)), rec('a', true, 0, at(1, 6))],
      memberships: [member('a', 'p', at(4)), member('a', 'q', null)],
      events: [ev('a', null, 'splash', at(5))],
      opens: [open('a', at(6))],
    });
    expect(t).toEqual({
      signedUp: T0,
      firstRecord: Date.parse(at(1, 6)),
      firstPoolJoin: Date.parse(at(4)),
      signupToFirstRecord: DAY_MS + 6 * 3_600_000,
      lastSeen: Date.parse(at(6)),
      lastWrite: Date.parse(at(5)),
    });
  });

  it('lists each pool joined, in join order, with their writes there only', () => {
    const rows = userPoolRows(
      [member('a', 'q', at(3), at(5)), member('a', 'p', at(1)), member('a', 'r', null)],
      new Map([
        ['p', 'Crew'],
        ['q', 'Club'],
      ]),
      [
        ev('a', 'p', 'splash', at(2)),
        ev('a', 'p', 'reaction', at(4)),
        ev('a', null, 'splash', at(6)),
      ],
    );
    expect(
      rows.map((r) => [r.name, r.leftAt !== null, r.counts.splash, r.counts.reaction]),
    ).toEqual([
      ['Crew', false, 1, 1],
      ['Club', true, 0, 0],
    ]);
    expect(rows[0].lastWrite).toBe(Date.parse(at(4)));
  });
});
