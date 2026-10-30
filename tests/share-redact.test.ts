import { describe, expect, it } from 'vitest';

import { redactForExport, SHAPE_WORDS } from '@/features/share-image/redact';

import { ME, MINA, MY_VIDEO, SENTINELS, shareCards } from './share-fixtures';

const byId = (cards: ReturnType<typeof shareCards>) =>
  Object.fromEntries(cards.map((c) => [c.splash.id, c]));

describe('a shared image’s records (H63)', () => {
  it('keeps nothing of anyone else’s, in any field, whatever the switch', () => {
    for (const faces of [false, true]) {
      const { cards, shapes } = redactForExport(shareCards(), { faces });
      const of = byId(cards);
      for (const id of ['theirs', 'ranged', 'unflagged']) {
        expect(shapes.has(id)).toBe(true);
        const json = JSON.stringify(of[id]);
        for (const s of SENTINELS) expect(json).not.toContain(s);
        expect(of[id].splash.title).toBe(SHAPE_WORDS);
        expect(of[id].ripples).toEqual([]);
        expect(of[id].photos).toBeUndefined();
        expect(of[id].lane).toBeNull();
        expect(of[id].splash.icon).toBeNull();
      }
    }
  });

  it('draws my record as it is: its title and my photo', () => {
    const { cards, shapes } = redactForExport(shareCards(), { faces: false });
    const mine = byId(cards).mine;
    expect(shapes.has('mine')).toBe(false);
    expect(mine.splash.title).toBe('Morning swim');
    // My photo and the video my words link to.
    expect(mine.photos?.map((p) => p.path)).toEqual([`${ME}/swim.webp`, `yt:${MY_VIDEO}`]);
    // My own face after my title, in a pool.
    expect(mine.authorFace).toBe(true);
  });

  it('keeps my title and my photos on my record with a side, never the side’s', () => {
    const { cards } = redactForExport(shareCards(), { faces: false });
    const side = byId(cards)['with-side'];
    expect(side.splash.title).toBe('Dinner at home');
    expect(side.photos?.map((p) => p.path)).toEqual([`${ME}/side.webp`]);
    expect(side.ripples.map((r) => r.id)).toEqual(['side-me']);
    const json = JSON.stringify(side);
    for (const s of SENTINELS) expect(json).not.toContain(s);
  });

  it('shows the pool and its faces on my records only with the switch on', () => {
    const on = byId(redactForExport(shareCards(), { faces: true }).cards)['with-side'];
    expect(on.pools).toEqual(['SENTINEL-POOL']);
    expect(on.writers?.map((w) => w.authorId)).toEqual([ME, MINA]);
    // Still never her words, photo, or the record's other tags.
    expect(on.ripples.map((r) => r.id)).toEqual(['side-me']);
    expect(on.sides).toBeUndefined();
    expect(on.origins).toBeUndefined();
  });

  it('draws someone’s record I wrote on as my photos alone: no label, nothing of hers', () => {
    for (const faces of [false, true]) {
      const { cards, shapes } = redactForExport(shareCards(), { faces });
      const joint = byId(cards).joint;
      expect(shapes.has('joint')).toBe(false);
      expect(joint.photos?.map((p) => p.path)).toEqual([`${ME}/side.webp`]);
      expect(joint.layout?.label?.hidden).toBe(true);
      expect(joint.layout?.icon?.hidden).toBe(true);
      expect(joint.ripples).toEqual([]);
      expect(joint.waitsForMe).toBeUndefined();
      const json = JSON.stringify(joint);
      for (const s of SENTINELS) expect(json).not.toContain(s);
    }
  });

  it('leaves out someone’s record I wrote on with no photo of mine', () => {
    const joint = shareCards().find((c) => c.splash.id === 'joint')!;
    const wordsOnly = { ...joint, photos: [] };
    const { cards, shapes } = redactForExport([wordsOnly], { faces: false });
    expect(cards).toEqual([]);
    expect(shapes.size).toBe(0);
  });

  it('reads an untitled record’s first words only when they are mine', () => {
    const [mine] = shareCards();
    const untitled = {
      ...mine,
      splash: { ...mine.splash, title: '', ghostTitle: 'SENTINEL-GHOST' },
      ripples: [
        {
          id: 'x',
          note: 'SENTINEL-GHOST theirs',
          createdAt: mine.splash.createdAt,
          authorId: MINA,
        },
        ...mine.ripples,
      ],
    };
    const [out] = redactForExport([untitled], { faces: false }).cards;
    expect(out.splash.ghostTitle).toBeNull();
    const own = {
      ...untitled,
      ripples: mine.ripples,
      splash: { ...untitled.splash, ghostTitle: 'Cold water' },
    };
    expect(redactForExport([own], { faces: false }).cards[0].splash.ghostTitle).toBe('Cold water');
  });
});
