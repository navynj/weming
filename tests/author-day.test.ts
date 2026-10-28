import { describe, expect, it } from 'vitest';

import { placeCard } from '@/features/home/grid';
import { poolCards } from '@/features/pool/pool-cards';
import { authorClock } from '@/features/pool/times';
import { summarizeSplash, type Splash } from '@/features/splash/summary';
import { compareNewestFirst } from '@/lib/flow-key';
import type { PoolRipple, PoolView } from '@/lib/queries/pools';

/**
 * A record's day is its author's local date when written (0013), stored;
 * the reader's zone never moves its row. Within a day, the order follows
 * the timestamps.
 */
const VAN = 'America/Vancouver';
const SEOUL = 'Asia/Seoul';
const NOW = new Date('2026-10-24T00:00:00Z');

function splash(
  over: Partial<Splash> & { id: string; created_at: string; written_on: string },
): Splash {
  return {
    owner_id: 'u-van',
    title: over.id,
    declared_start: null,
    declared_end: null,
    declared_lane_id: null,
    icon: null,
    session_id: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    description: null,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    ...over,
  };
}

function ripple(
  over: Partial<PoolRipple> & {
    id: string;
    splash_id: string;
    created_at: string;
    written_on: string;
  },
): PoolRipple {
  return {
    author_id: 'u-van',
    thread_pool_id: null,
    note: 'words',
    media: [],
    occurred_on: null,
    occurred_time: null,
    ended_at: null,
    started_at: null,
    ...over,
  };
}

// 23:30 on Oct 22 in Vancouver is 06:30Z on Oct 23 — already the 23rd in Seoul.
const LATE = '2026-10-23T06:30:00.000Z';

describe('the author’s local day', () => {
  it('keeps a splash written at 23:30 in Vancouver on that date for a reader in Seoul', () => {
    const post = splash({ id: 'late', created_at: LATE, written_on: '2026-10-22' });
    const block = ripple({
      id: 'b',
      splash_id: 'late',
      created_at: LATE,
      written_on: '2026-10-22',
    });
    for (const reader of [VAN, SEOUL, 'UTC']) {
      const card = placeCard(summarizeSplash(post, [block], reader, NOW), 'words', reader);
      expect(card.day, reader).toBe('2026-10-22');
    }
  });

  it('keeps it there in a pool read from Seoul', () => {
    const view: PoolView = {
      pool: { id: 'p', name: 'Our Pool', ownerId: 'u-van' },
      members: [
        {
          userId: 'u-van',
          name: 'Van',
          initials: 'VA',
          joinedAt: '2026-10-01',
          former: false,
          timeZone: VAN,
        },
        {
          userId: 'u-seoul',
          name: 'Seoul',
          initials: 'SE',
          joinedAt: '2026-10-02',
          former: false,
          timeZone: SEOUL,
        },
      ],
      lanes: [{ id: 'l', pool_id: 'p', name: 'Food', icon: '🍽️', description: null, position: 0 }],
      placements: [
        { splashId: 'late', poolId: 'p', poolLaneId: 'l', shared: true, ownerId: 'u-van' },
      ],
      splashes: [splash({ id: 'late', created_at: LATE, written_on: '2026-10-22' })],
      ripples: [ripple({ id: 'b', splash_id: 'late', created_at: LATE, written_on: '2026-10-22' })],
      invites: [],
    };
    const [card] = poolCards(view, 'lane', 'u-seoul', SEOUL, NOW);
    expect(card.day).toBe('2026-10-22');
  });

  it('orders within a day by timestamp, across authors in different zones', () => {
    // Both on Oct 22 by their authors' days: Seoul at 19:00 local (10:00Z),
    // Vancouver at 23:30 local (06:30Z the next UTC day) — the later instant.
    const seoul = {
      occurred_on: null,
      occurred_time: null,
      created_at: '2026-10-22T10:00:00.000Z',
      written_on: '2026-10-22',
    };
    const van = {
      occurred_on: null,
      occurred_time: null,
      created_at: LATE,
      written_on: '2026-10-22',
    };
    const day = {
      occurred_on: '2026-10-22',
      occurred_time: null,
      created_at: '2026-10-22T01:00:00.000Z',
      written_on: '2026-10-21',
    };
    const earlier = {
      occurred_on: null,
      occurred_time: null,
      created_at: '2026-10-21T23:00:00.000Z',
      written_on: '2026-10-21',
    };
    for (const reader of [VAN, SEOUL]) {
      const sorted = [seoul, earlier, van, day].sort((a, b) => compareNewestFirst(a, b, reader));
      // The day-only block heads its day; then the later instant; the 21st last.
      expect(sorted, reader).toEqual([day, van, seoul, earlier]);
    }
  });
});

describe('times on the card detail', () => {
  it('shows my time, and the author’s after it when our zones differ', () => {
    expect(authorClock(LATE, SEOUL, VAN)).toEqual({
      mine: '3:30 PM',
      theirs: '11:30 PM in Vancouver',
    });
    expect(authorClock(LATE, VAN, VAN)).toEqual({ mine: '11:30 PM', theirs: null });
  });
});
