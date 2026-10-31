import { describe, expect, it } from 'vitest';

import { ADMIN_COLOR, PERSON_COLORS } from '@/features/admin/kinds';
import { chartData } from '@/lib/admin/daily';
import type { EventRow, OpenRow, PersonRow } from '@/lib/admin/queries';

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

describe('chartData', () => {
  const data = chartData({
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
    expect(data.members.map((m) => [m.name, m.color, m.joinedIndex])).toEqual([
      ['ME', ADMIN_COLOR, 0],
      ['ANA', PERSON_COLORS[0], 2],
    ]);
    expect(JSON.stringify(data)).not.toMatch(/"(ana|me|cy)"/);
  });

  it('counts each day in the kind order, opens last', () => {
    const ana = data.members[1];
    expect(ana.counts[2]).toEqual([1, 0, 0, 1, 0]);
    expect(ana.counts[3]).toEqual([1, 0, 0, 0, 1]);
    expect(data.members[0].counts[1]).toEqual([0, 1, 0, 0, 0]);
  });
});
