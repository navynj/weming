import { describe, expect, it } from 'vitest';

import { placeCard, type Card } from '@/features/home/grid';
import type { BoardLayoutJson } from '@/features/month-board/board-layout';
import { layoutWeekBoard } from '@/features/month-board/layout';
import { stackingOf, zOf } from '@/features/month-board/stacking';
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

  it('steps each part within its piece: slot, label and photos, wave, sticker', () => {
    expect([
      zOf(0, 'slot'),
      zOf(0, 'label'),
      zOf(0, 'photos'),
      zOf(0, 'wave'),
      zOf(0, 'sticker'),
    ]).toEqual([1, 2, 2, 3, 4]);
    // Every part of a higher piece over every part of a lower one.
    expect(zOf(1, 'slot')).toBeGreaterThan(zOf(0, 'sticker'));
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
