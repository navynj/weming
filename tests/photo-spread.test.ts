import { describe, expect, it } from 'vitest';

import {
  FOLLOW,
  MIN_VISIBLE,
  photoBoxOf,
  spreadPhotos,
  turned,
  visibleShare,
} from '@/features/month-board/photo-spread';

/** The board's pile of prints (review, 2026-10-27), and photos never cropped. */

function hashOf(seed: number) {
  return (salt: string): number => {
    let h = seed;
    for (const c of salt) h = (h * 31 + c.charCodeAt(0)) % 1000;
    return h / 1000;
  };
}

const MIXES = [
  [3, 1 / 3],
  [1 / 3, 3],
  [1, 3, 1 / 3],
  [3, 1 / 3, 1],
  [1 / 3, 1 / 3, 1 / 3],
  [3, 3, 3],
  [4 / 3, 1, 3 / 4],
];

describe('a photo’s box', () => {
  it('keeps its ratio, width as given', () => {
    expect(photoBoxOf(120, 3)).toEqual({ w: 120, h: 40 });
    expect(photoBoxOf(120, 1)).toEqual({ w: 120, h: 120 });
  });

  it('scales a very tall one down to twice its width, narrower, never cropped', () => {
    const box = photoBoxOf(120, 1 / 3);
    expect(box.h).toBe(240);
    expect(box.w).toBe(80);
    expect(box.w / box.h).toBeCloseTo(1 / 3, 2);
  });
});

describe('the pile', () => {
  it('lays one photo as before: untilted, at the top-left', () => {
    const { cards, w, h } = spreadPhotos([{ path: 'a', size: 100, ratio: 4 / 3 }], 100, hashOf(1));
    expect(cards).toEqual([{ path: 'a', size: 100, x: 0, y: 0, w: 100, h: 75, tilt: 0 }]);
    expect([w, h]).toEqual([100, 75]);
  });

  for (const [index, ratios] of MIXES.entries()) {
    for (const seed of [1, 7, 42, 99]) {
      it(`shows at least half of every photo (${ratios.map((r) => r.toFixed(2)).join(', ')}; seed ${seed})`, () => {
        const photos = ratios.map((ratio, at) => ({
          path: `p${index}-${at}`,
          size: at === 0 ? 120 : null,
          ratio,
        }));
        const { cards, w, h } = spreadPhotos(photos, 120, hashOf(seed));
        // Front first: the first photo at the recipe's size, the rest at 65%.
        expect(cards[0].size).toBe(120);
        for (const card of cards.slice(1)) expect(card.size).toBe(Math.round(120 * FOLLOW));
        for (const [at, card] of cards.entries()) {
          // Its own ratio, never cropped.
          expect(card.w / card.h).toBeCloseTo(ratios[at], 1);
          // Under every photo before it, at least half of it shows.
          expect(visibleShare(card, cards.slice(0, at))).toBeGreaterThanOrEqual(MIN_VISIBLE);
          // Small stable tilts, alternating either way.
          expect(Math.abs(card.tilt)).toBeGreaterThanOrEqual(1);
          expect(Math.abs(card.tilt)).toBeLessThanOrEqual(4);
          if (at > 0) expect(Math.sign(card.tilt)).toBe(-Math.sign(cards[at - 1].tilt));
          // The group's box holds every photo as turned.
          const b = turned(card, card.tilt);
          expect(b.x).toBeGreaterThanOrEqual(-1);
          expect(b.y).toBeGreaterThanOrEqual(-1);
          expect(b.x + b.w).toBeLessThanOrEqual(w + 1);
          expect(b.y + b.h).toBeLessThanOrEqual(h + 1);
        }
        // Each following photo sits right of and below the one before.
        for (let at = 1; at < cards.length; at += 1) {
          expect(cards[at].x).toBeGreaterThan(cards[at - 1].x);
          expect(cards[at].y).toBeGreaterThan(cards[at - 1].y);
        }
      });
    }
  }

  it('is stable: the same piece lays out the same way', () => {
    const photos = [
      { path: 'a', size: 100, ratio: 1 },
      { path: 'b', size: null, ratio: 3 },
    ];
    expect(spreadPhotos(photos, 100, hashOf(5))).toEqual(spreadPhotos(photos, 100, hashOf(5)));
  });

  it('keeps a following photo’s size set by hand', () => {
    const { cards } = spreadPhotos(
      [
        { path: 'a', size: 100, ratio: 1 },
        { path: 'b', size: 90, ratio: 1 },
      ],
      100,
      hashOf(3),
    );
    expect(cards[1].size).toBe(90);
  });
});
