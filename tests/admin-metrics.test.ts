import { describe, expect, it } from 'vitest';

import {
  activityOf,
  DAY_MS,
  funnelOf,
  memberRows,
  notifyStats,
  poolSummaries,
  returnedOn,
} from '@/lib/admin/metrics';
import type { EventRow, NotificationRow, OpenRow, PersonRow } from '@/lib/admin/queries';
import { daysBetween, dayIn, formatDuration } from '@/lib/admin/zones';

/** The dashboard's arithmetic (H71), on metadata rows alone. */
const T0 = Date.parse('2026-10-01T12:00:00Z');
const at = (days: number, hours = 0): string =>
  new Date(T0 + days * DAY_MS + hours * 3_600_000).toISOString();

function person(user: string, over: Partial<PersonRow> = {}): PersonRow {
  return {
    pool_id: 'p',
    user_id: user,
    display_name: user,
    invited_at: at(0),
    joined_at: at(0),
    left_at: null,
    is_owner: false,
    ...over,
  };
}
const event = (user: string, kind: string, when: string, media = false): EventRow => ({
  pool_id: 'p',
  user_id: user,
  kind,
  at: when,
  splash_id: 's',
  has_media: media,
});
const open = (user: string, when: string, kind = 'direct'): OpenRow => ({
  id: `${user}-${when}`,
  user_id: user,
  started_at: when,
  platform: 'ios-pwa',
  kind,
  notification_pool_id: null,
});

describe('returning on day N', () => {
  it('answers strict only once its 24 hours have closed, retained once day N has begun', () => {
    const joined = T0;
    expect(returnedOn(joined, [], 3, T0 + 2 * DAY_MS)).toEqual({ strict: null, retained: null });
    expect(returnedOn(joined, [], 3, T0 + 3.5 * DAY_MS)).toEqual({ strict: null, retained: false });
    expect(returnedOn(joined, [T0 + 3.2 * DAY_MS], 3, T0 + 5 * DAY_MS)).toEqual({
      strict: true,
      retained: true,
    });
  });

  it('counts a return after the window as retained but not strict', () => {
    expect(returnedOn(T0, [T0 + 5 * DAY_MS], 3, T0 + 6 * DAY_MS)).toEqual({
      strict: false,
      retained: true,
    });
  });
});

describe('the funnel', () => {
  it('leaves the owner out, counts invite openers who never joined, and reads opens as returns', () => {
    const people = [
      person('owner', { is_owner: true }),
      person('ana'),
      person('ben'),
      person('cy', { joined_at: null }),
    ];
    const events = [event('ana', 'splash', at(1)), event('ben', 'reaction', at(8))];
    const opens = [open('ana', at(3, 2))];
    const f = funnelOf(people, events, activityOf(events, opens), T0 + 10 * DAY_MS);
    expect(f.invited).toBe(3);
    expect(f.joined).toBe(2);
    expect(f.firstSplash).toBe(1);
    expect(f.day3.strict).toEqual({ yes: 1, of: 2 });
    expect(f.day3.retained).toEqual({ yes: 2, of: 2 });
    expect(f.day7.strict).toEqual({ yes: 0, of: 2 });
    expect(f.day7.retained).toEqual({ yes: 1, of: 2 });
  });
});

describe('pools and members', () => {
  it('marks a pool inactive after three quiet days and knows whether the admin is in it', () => {
    const pools = [
      { pool_id: 'p', name: 'Crew', created_at: at(0), owner_id: 'owner' },
      { pool_id: 'q', name: 'Quiet', created_at: at(0), owner_id: 'owner' },
    ];
    const people = [person('admin'), person('ana', { pool_id: 'q', left_at: at(2) })];
    const events = [
      event('ana', 'ripple', at(9)),
      { ...event('ana', 'splash', at(1)), pool_id: 'q' },
    ];
    const [crew, quiet] = poolSummaries(
      pools,
      people,
      events,
      [{ pool_id: 'q' }],
      'admin',
      T0 + 10 * DAY_MS,
    );
    expect(crew).toMatchObject({ active: true, adminIsMember: true, members: 1, linkVisits: 0 });
    expect(crew.counts.ripple).toBe(1);
    expect(quiet).toMatchObject({ active: false, adminIsMember: false, members: 0, linkVisits: 1 });
  });

  it("splits a member's splashes by photo and times the first one from the join", () => {
    const [row] = memberRows(
      [person('ana', { joined_at: at(1) })],
      [
        event('ana', 'splash', at(0)),
        event('ana', 'splash', at(2), true),
        event('ana', 'splash', at(3)),
        event('ana', 'reply', at(4)),
      ],
      [open('ana', at(2)), open('ana', at(5), 'notification'), open('ana', at(6), 'influenced')],
    );
    expect(row.joinToFirstSplash).toBe(DAY_MS);
    expect(row).toMatchObject({ photoSplashes: 1, textSplashes: 2 });
    expect(row.counts).toEqual({ splash: 3, ripple: 0, reply: 1, reaction: 0 });
    expect(row.opens).toEqual({ notification: 1, direct: 1, influenced: 1 });
    expect(row.lastSeen).toBe(Date.parse(at(6)));
  });
});

describe('notification stats', () => {
  it('rates taps and influenced opens of those sent, and takes the median wait', () => {
    const n = (over: Partial<NotificationRow>): NotificationRow => ({
      notification_id: crypto.randomUUID(),
      user_id: 'ana',
      pool_id: 'p',
      type: 'reply',
      delivered_at: at(0),
      clicked_at: null,
      influenced_open_at: null,
      ...over,
    });
    const stats = notifyStats([
      n({ clicked_at: at(0, 1) }),
      n({ influenced_open_at: new Date(T0 + 10 * 60_000).toISOString() }),
      n({}),
      n({}),
    ]);
    expect(stats).toMatchObject({
      sent: 4,
      tapped: 1,
      influenced: 1,
      tapRate: 0.25,
      influencedRate: 0.25,
    });
    expect(stats.medianToOpen).toBe((3_600_000 + 600_000) / 2);
    expect(notifyStats([]).tapRate).toBeNull();
  });
});

describe('zones', () => {
  it('puts one moment on different days in Vancouver and Seoul', () => {
    const late = Date.parse('2026-10-30T23:30:00-07:00');
    expect(dayIn(late, 'America/Vancouver')).toBe('2026-10-30');
    expect(dayIn(late, 'Asia/Seoul')).toBe('2026-10-31');
  });

  it('walks days across a month end and formats spans', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(26 * 3_600_000)).toBe('26h 0m');
    expect(formatDuration(3 * DAY_MS + 2 * 3_600_000)).toBe('3d 2h');
  });
});
