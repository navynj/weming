import { describe, expect, it } from 'vitest';

import { placeCard, type Card } from '@/features/home/grid';
import type { BoardLayoutJson } from '@/features/month-board/board-layout';
import { layoutWeekBoard } from '@/features/month-board/layout';
import { ORDER_MAX } from '@/features/month-board/board-layout';
import {
  defaultPartOrder,
  partOrder,
  partRanks,
  RING_RANK,
  SLOT_RANK,
  stackingOf,
  zOf,
} from '@/features/month-board/stacking';
import { summarizeSplash, type Splash } from '@/features/splash/summary';
import { written } from './written-on';

const TZ = 'America/Vancouver';

function card(id: string, day: string, layout?: BoardLayoutJson): Card {
  const splash = summarizeSplash(
    written({
      id,
      owner_id: 'a1',
      title: id,
      declared_start: day,
      declared_end: null,
      declared_lane_id: 'c-food',
      session_id: null,
      icon: null,
      pinned_at: null,
      pool_id: null,
      pool_lane_id: null,
      own_pool_id: null,
      created_by: null,
      type: 'free',
      prompt: null,
      ends_at: null,
      created_at: `${day}T18:00:00.000Z`,
    } as Splash),
    [
      {
        id: `${id}-b`,
        note: id,
        occurred_on: day,
        occurred_time: null,
        created_at: `${day}T18:00:00.000Z`,
      },
    ],
    TZ,
    new Date('2026-10-26T20:00:00.000Z'),
  );
  return { ...placeCard(splash, '', TZ), layout };
}

const view = (cards: Card[]) => {
  const board = layoutWeekBoard(cards, '2026-10-18', { width: 980 });
  return stackingOf(board.pieces, board.metrics.column);
};

describe('one stacking order for a board view (review, 2026-10-27)', () => {
  it('stacks later days over earlier ones, and a hand-set layer over that', () => {
    const plain = view([card('wed', '2026-10-21'), card('thu', '2026-10-22')]);
    expect(plain.order.get('thu')).toBeGreaterThan(plain.order.get('wed')!);
    const lifted = view([
      card('wed', '2026-10-21', { piece: { layer: 1 } }),
      card('thu', '2026-10-22'),
    ]);
    expect(lifted.order.get('wed')).toBeGreaterThan(lifted.order.get('thu')!);
    const under = view([
      card('wed', '2026-10-21'),
      card('thu', '2026-10-22', { piece: { layer: -1 } }),
    ]);
    expect(under.order.get('thu')).toBeLessThan(under.order.get('wed')!);
  });

  it('never lifts a piece for being moved by hand (0044 retired)', () => {
    const s = view([card('wed', '2026-10-21', { label: { x: 1 } }), card('thu', '2026-10-22')]);
    expect(s.order.get('thu')).toBeGreaterThan(s.order.get('wed')!);
  });

  it('ranks each part within its piece, every part of a higher piece over a lower one', () => {
    expect(zOf(0, SLOT_RANK)).toBeLessThan(zOf(0, 1));
    expect(zOf(0, RING_RANK)).toBeGreaterThan(zOf(0, ORDER_MAX));
    // The highest part of a lower piece, and its ring, under the slot of the next.
    expect(zOf(1, SLOT_RANK)).toBeGreaterThan(zOf(0, RING_RANK));
  });

  it('moves one step past the nearest overlapping piece, or past every piece; none when nothing it overlaps is there', () => {
    // Wednesday's label moved a lane right, over Thursday's; Saturday far off.
    const cards = [
      card('wed', '2026-10-21', { label: { x: 1 } }),
      card('thu', '2026-10-22'),
      card('sat', '2026-10-24', { piece: { layer: 3 } }),
    ];
    const s = view(cards);
    // Wednesday is under Thursday: forward puts it one past, at Thursday's layer + 1.
    expect(s.move('wed', 'forward')).toBe(1);
    expect(s.move('wed', 'backward')).toBeNull();
    expect(s.move('wed', 'back')).toBeNull();
    // To the front is over every piece in the view, Saturday's 3 included.
    expect(s.move('wed', 'front')).toBe(4);
    // Thursday is over Wednesday: back goes under it, and under everything.
    expect(s.move('thu', 'forward')).toBeNull();
    expect(s.move('thu', 'backward')).toBe(-1);
    expect(s.move('thu', 'back')).toBe(-1);
    // Saturday overlaps nothing: no move has a visible effect.
    for (const how of ['forward', 'backward', 'front', 'back'] as const)
      expect(s.move('sat', how)).toBeNull();
  });
});

describe('the order within a post (0055)', () => {
  const present = { label: true, photos: ['first.webp', 'second.webp'], wave: true, icon: true };

  it('by default: photos above the label, the first uploaded on top, then wave and icon', () => {
    expect(defaultPartOrder(present)).toEqual([
      'label',
      'photo:second.webp',
      'photo:first.webp',
      'wave',
      'icon',
    ]);
  });

  it('keeps a saved order, for the parts the post has now', () => {
    const saved = [
      'icon',
      'photo:first.webp',
      'label',
      'photo:gone.webp',
      'photo:second.webp',
      'wave',
    ];
    expect(partOrder(saved, defaultPartOrder(present))).toEqual([
      'icon',
      'photo:first.webp',
      'label',
      'photo:second.webp',
      'wave',
    ]);
  });

  it('puts a part the saved order lacks where the default would have it', () => {
    // A third photo uploaded after the order was saved; the wave turned on.
    const now = { ...present, photos: [...present.photos, 'third.webp'] };
    const saved = ['icon', 'label', 'photo:second.webp', 'photo:first.webp'];
    expect(partOrder(saved, defaultPartOrder(now))).toEqual([
      'icon',
      'label',
      'photo:third.webp',
      'photo:second.webp',
      'photo:first.webp',
      'wave',
    ]);
    expect(partRanks(['label', 'icon']).get('icon')).toBe(2);
  });

  it('gives a hidden part no place', () => {
    expect(defaultPartOrder({ ...present, label: false, icon: false })).not.toContain('label');
  });
});
