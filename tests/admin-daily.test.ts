import { describe, expect, it } from 'vitest';

import { ADMIN_COLOR, PERSON_COLORS } from '@/features/admin/kinds';
import { poolChart, userChart } from '@/lib/admin/daily';
import type { EventRow, OpenRow, PersonRow, UserEventRow } from '@/lib/admin/queries';

/** The pool page's per-day series (H71): counts, a name and a colour, no id. */
const person = (user: string, joined: string | null, over: Partial<PersonRow> = {}): PersonRow => ({
  pool_id: 'p',
  user_id: user,
  display_name: user.toUpperCase(),
  invited_at: joined,
  joined_at: joined,
  left_at: null,
  is_owner: false,
  ...over,
});
const event = (user: string, kind: string, at: string): EventRow => ({
  pool_id: 'p',
  user_id: user,
  kind,
  at,
  splash_id: 's',
  has_media: false,
});
const open = (user: string, at: string): OpenRow => ({
  id: at,
  user_id: user,
  started_at: at,
  platform: 'ios-pwa',
  kind: 'direct',
  notification_pool_id: null,
});

describe('poolChart', () => {
  const data = poolChart({
    people: [
      person('ana', '2026-10-27T18:00:00Z'),
      person('me', '2026-10-25T18:00:00Z'),
      person('cy', null),
    ],
    events: [
      event('ana', 'reaction', '2026-10-27T19:00:00Z'),
      event('ana', 'splash', '2026-10-27T20:00:00Z'),
      event('ana', 'splash', '2026-10-28T20:00:00Z'),
      event('me', 'ripple', '2026-10-26T20:00:00Z'),
    ],
    opens: [open('ana', '2026-10-28T21:00:00Z')],
    poolCreated: '2026-10-25T18:00:00Z',
    trackingStart: '2026-10-28T00:00:00Z',
    now: Date.parse('2026-10-30T18:00:00Z'),
    zone: 'America/Vancouver',
    adminId: 'me',
  });

  it('runs every day from the pool’s making through today, today included', () => {
    expect(data.days).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
    // Oct 28 00:00 UTC is Oct 27 in Vancouver.
    expect(data.trackingStartIndex).toBe(2);
  });

  it('draws joined members in join order, the admin gray, with no id', () => {
    expect(data.series.map((m) => [m.name, m.color, m.style, m.startIndex])).toEqual([
      ['ME', ADMIN_COLOR, 'mine', 0],
      ['ANA', PERSON_COLORS[0], 'solid', 2],
    ]);
    expect(JSON.stringify(data)).not.toMatch(/"(ana|me|cy)"/);
  });

  it('counts each day in the kind order, opens last', () => {
    const ana = data.series[1];
    expect(ana.counts[2]).toEqual([1, 0, 0, 1, 0]);
    expect(ana.counts[3]).toEqual([1, 0, 0, 0, 1]);
    expect(data.series[0].counts[1]).toEqual([0, 1, 0, 0, 0]);
  });
});

describe('userChart', () => {
  const ev = (pool: string | null, kind: string, at: string, item: string): UserEventRow => ({
    user_id: 'ana',
    pool_id: pool,
    kind,
    at,
    splash_id: 's',
    has_media: false,
    item_key: item,
  });
  // One splash written at home and shown in two pools; a ripple in Crew only.
  const data = userChart({
    name: 'Ana',
    signedUp: '2026-10-26T18:00:00Z',
    events: [
      ev(null, 'splash', '2026-10-27T18:00:00Z', 's1'),
      ev('crew', 'splash', '2026-10-27T18:00:00Z', 's1'),
      ev('club', 'splash', '2026-10-27T18:00:00Z', 's1'),
      ev('crew', 'ripple', '2026-10-28T18:00:00Z', 'r1'),
    ],
    opens: [open('ana', '2026-10-28T19:00:00Z')],
    pools: [
      { poolId: 'crew', name: 'Crew', joinedAt: '2026-10-26T18:00:00Z' },
      { poolId: 'club', name: 'Club', joinedAt: '2026-10-27T17:00:00Z' },
    ],
    trackingStart: '2026-10-26T00:00:00Z',
    now: Date.parse('2026-10-29T18:00:00Z'),
    zone: 'America/Vancouver',
  });

  it('draws Home, then each pool from its join, then the unique line last', () => {
    expect(data.days[0]).toBe('2026-10-26');
    expect(data.series.map((s) => [s.name, s.style, s.startIndex, s.hasOpens])).toEqual([
      ['Home', 'solid', 0, false],
      ['Crew', 'solid', 0, false],
      ['Club', 'solid', 1, false],
      ['Unique (Ana)', 'unique', 0, true],
    ]);
  });

  it('counts a cross-posted splash once per place, and once in the unique line', () => {
    const [home, crew, club, unique] = data.series;
    expect([home, crew, club].map((s) => s.counts[1][0])).toEqual([1, 1, 1]);
    expect(unique.counts[1]).toEqual([1, 0, 0, 0, 0]);
    expect(unique.counts[2]).toEqual([0, 1, 0, 0, 1]);
    expect(data.opensRows).toEqual([
      { name: 'Ana', color: expect.any(String), startIndex: 0, counts: [0, 0, 1, 0] },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/"(crew|club|ana)"/);
  });

  it('marks a pool splash shared from Home on a later day, not one shared the day it was written', () => {
    const later = userChart({
      name: 'Ana',
      signedUp: '2026-10-26T18:00:00Z',
      events: [
        ev(null, 'splash', '2026-10-26T18:00:00Z', 'old'),
        ev('crew', 'splash', '2026-10-28T18:00:00Z', 'old'),
        ev('crew', 'splash', '2026-10-28T19:00:00Z', 'joint'),
        ev(null, 'splash', '2026-10-28T20:00:00Z', 'same'),
        ev('crew', 'splash', '2026-10-28T20:00:00Z', 'same'),
      ],
      opens: [],
      pools: [{ poolId: 'crew', name: 'Crew', joinedAt: '2026-10-26T18:00:00Z' }],
      trackingStart: null,
      now: Date.parse('2026-10-29T18:00:00Z'),
      zone: 'America/Vancouver',
    });
    const [home, crew, unique] = later.series;
    expect(crew.counts[2][0]).toBe(3);
    expect(crew.sharedFromHome?.[2]).toBe(1);
    expect(home.sharedFromHome).toBeUndefined();
    // The gap the hover explains: 3 in Crew, 2 new that day.
    expect(unique.counts[2][0]).toBe(2);
  });
});
