import { describe, expect, it } from 'vitest';

import { poolCards } from '@/features/pool/pool-cards';
import { declaredRange, orderBlocks } from '@/features/splash/block-day';
import type { Splash } from '@/features/splash/summary';
import type { PoolRipple, PoolView } from '@/lib/queries/pools';

import { written } from './written-on';

/**
 * One order for a post's ripples (H42g): the stack card and the detail sheet
 * read them alike, whatever zone each author writes in. Mina is in
 * Vancouver, Jun in Seoul, and they write across midnight, where the clock
 * text and the instant disagree.
 */
const VAN = 'America/Vancouver';
const SEOUL = 'Asia/Seoul';
const MINA = 'u-mina';
const JUN = 'u-jun';

function splash(over: Partial<Splash> & { id: string }): Splash {
  return written({
    owner_id: null,
    title: 'Night',
    declared_start: null,
    declared_end: null,
    declared_lane_id: null,
    icon: null,
    session_id: null,
    pinned_at: null,
    pool_id: 'p',
    pool_lane_id: 'l',
    own_pool_id: null,
    joint_invite_all: true,
    description: null,
    created_by: MINA,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: '2026-10-21T20:00:00-07:00',
    ...over,
  });
}

/** A ripple as its author's database row reads: its day is the author's, its time carries their offset. */
function ripple(
  id: string,
  author: string,
  createdAt: string,
  zone: string,
  occurredOn: string,
): PoolRipple {
  return written(
    {
      id,
      splash_id: 'joint',
      author_id: author,
      thread_pool_id: null,
      note: id,
      media: [],
      occurred_on: occurredOn,
      occurred_time: null,
      ended_at: null,
      created_at: createdAt,
      started_at: null,
    },
    zone,
  );
}

// Absolute order: m1 (06:10Z) < j1 (06:20Z) < m2 (06:40Z) < j2 (07:00Z).
// As clock text, every Vancouver row ("2026-10-21T23…") sorts before every
// Seoul row ("2026-10-22T15…"), and as author-local days Vancouver's 21st
// before Seoul's 22nd: both wrong.
const ROWS = [
  ripple('j2', JUN, '2026-10-22T16:00:00+09:00', SEOUL, '2026-10-22'),
  ripple('m2', MINA, '2026-10-21T23:40:00-07:00', VAN, '2026-10-21'),
  ripple('j1', JUN, '2026-10-22T15:20:00+09:00', SEOUL, '2026-10-22'),
  ripple('m1', MINA, '2026-10-21T23:10:00-07:00', VAN, '2026-10-21'),
];

function view(of: Splash): PoolView {
  return {
    pool: { id: 'p', name: 'Night', ownerId: MINA },
    members: [
      {
        userId: MINA,
        name: 'Mina',
        initials: 'MI',
        joinedAt: '2026-10-01',
        former: false,
        timeZone: VAN,
      },
      {
        userId: JUN,
        name: 'Jun',
        initials: 'JU',
        joinedAt: '2026-10-01',
        former: false,
        timeZone: SEOUL,
      },
    ],
    lanes: [{ id: 'l', pool_id: 'p', name: 'Days', icon: '🌙', description: null, position: 0 }],
    myLinks: [],
    placements: [],
    splashes: [of],
    ripples: ROWS,
    invites: [],
    together: { joint: [MINA, JUN] },
  };
}

/** The card's ripples, as a viewer in `zone` reads them: the order is not the zone's to change. */
function cardOrder(of: Splash, zone: string): string[] {
  const card = poolCards(view(of), 'lane', MINA, zone).find((c) => c.splash.id === 'joint')!;
  return card.ripples.map((r) => r.id);
}

/** The detail sheet's, as pool-splash orders them. */
function sheetOrder(of: Splash): string[] {
  return orderBlocks(ROWS, declaredRange(of)).map((r) => r.id);
}

describe('one order for a post’s ripples, across zones (H42g)', () => {
  it('reads a record with no range by when each was written, as instants', () => {
    const plain = splash({ id: 'joint' });
    expect(sheetOrder(plain)).toEqual(['m1', 'j1', 'm2', 'j2']);
    for (const zone of [VAN, SEOUL]) expect(cardOrder(plain, zone)).toEqual(sheetOrder(plain));
  });

  it('reads a range record by each ripple’s day, then by when it was written', () => {
    const range = splash({ id: 'joint', declared_start: '2026-10-21', declared_end: '2026-10-22' });
    expect(sheetOrder(range)).toEqual(['m1', 'm2', 'j1', 'j2']);
    for (const zone of [VAN, SEOUL]) expect(cardOrder(range, zone)).toEqual(sheetOrder(range));
  });

  it('breaks an exact tie by id, the same in every list', () => {
    const same = '2026-10-22T06:00:00Z';
    const tied = [
      { id: 'b', occurred_on: null, created_at: same },
      { id: 'a', occurred_on: null, created_at: '2026-10-21T23:00:00-07:00' },
    ];
    expect(orderBlocks(tied, null).map((r) => r.id)).toEqual(['a', 'b']);
    expect(orderBlocks([...tied].reverse(), null).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
