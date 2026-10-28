import { describe, expect, it } from 'vitest';

import { drawnLayout, storedClear, storedLayout } from '@/features/month-board/board-layout';
import { rippleMedia } from '@/lib/ripple-media';

const ID = 'dQw4w9WgXcQ';

describe('a ripple’s media: its photos, then the videos its words link to (part 5)', () => {
  it('lists photos first, then each video, by a key that is the video’s id alone', () => {
    const media = rippleMedia({
      id: 'r1',
      media: ['a/one.webp'],
      note: `watch https://youtu.be/${ID}?t=30`,
    });
    expect(media.map((m) => m.path)).toEqual(['a/one.webp', `yt:${ID}`]);
    expect(media[1].video).toEqual({ id: ID, start: 30, short: false });
  });

  it('keeps a video’s key when the words around it change, so its layout stays with it', () => {
    const before = rippleMedia({ id: 'r1', media: [], note: `https://youtu.be/${ID}` });
    const after = rippleMedia({
      id: 'r1',
      media: [],
      note: `rewritten, a new line, and https://www.youtube.com/watch?v=${ID}&t=5 again`,
    });
    expect(after.map((m) => m.path)).toEqual(before.map((m) => m.path));
  });

  it('lists none with video previews turned off', () => {
    expect(
      rippleMedia({ id: 'r1', media: [], note: `https://youtu.be/${ID}`, video_previews: false }),
    ).toEqual([]);
  });
});

describe('a video’s layout, stored by its id and drawn as a photo (part 5)', () => {
  it('goes there and back unchanged', () => {
    const stored = {
      photos: { 'a/one.webp': { size: 0.5 } },
      videos: { [ID]: { tilt: 4, hidden: true } },
      order: ['label', `video:${ID}`, 'photo:a/one.webp'],
    };
    const drawn = drawnLayout(stored);
    expect(drawn.photos?.[`yt:${ID}`]).toEqual({ tilt: 4, hidden: true });
    expect(drawn.order).toEqual(['label', `photo:yt:${ID}`, 'photo:a/one.webp']);
    expect(drawn.videos).toBeUndefined();
    expect(storedLayout(drawn)).toEqual(stored);
  });

  it('stores an edit to it, and a clear, under its id', () => {
    expect(storedLayout({ photos: { [`yt:${ID}`]: { size: 1 } } })).toEqual({
      videos: { [ID]: { size: 1 } },
    });
    expect(storedClear(`photos.yt:${ID}.tilt`)).toBe(`videos.${ID}.tilt`);
    expect(storedClear('photos.a/one.webp.tilt')).toBe('photos.a/one.webp.tilt');
  });
});
