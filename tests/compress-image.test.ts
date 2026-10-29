import { describe, expect, it } from 'vitest';

import {
  compressImage,
  DISPLAY_EDGE,
  fallbackType,
  fitWithin,
  FULL_EDGE,
  GIF_MAX_BYTES,
  GIF_TOO_LARGE,
  mayBeTransparent,
  plannedSizes,
} from '@/lib/compress-image';
import { displayPathOf, mediaMetaFor, mediaMetaOf, variantPath } from '@/lib/ripple-media';

/**
 * What a photo becomes before it leaves the phone (2026-10-28): the sizes
 * and formats chosen here; the pixels themselves are drawn by the browser,
 * which e2e/photo-compress.spec.ts checks in Chromium.
 */
describe('sizes', () => {
  it('caps the long edge at 2048, the ratio kept', () => {
    expect(fitWithin({ w: 4032, h: 3024 }, FULL_EDGE)).toEqual({ w: 2048, h: 1536 });
    expect(fitWithin({ w: 3024, h: 4032 }, FULL_EDGE)).toEqual({ w: 1536, h: 2048 });
  });

  it('never draws a photo larger than it was', () => {
    expect(fitWithin({ w: 800, h: 600 }, FULL_EDGE)).toEqual({ w: 800, h: 600 });
  });

  it('makes a 1024 display copy only when the photo is larger than that', () => {
    expect(plannedSizes({ w: 4032, h: 3024 })).toEqual({
      full: { w: 2048, h: 1536 },
      display: { w: 1024, h: 768 },
    });
    expect(plannedSizes({ w: 1024, h: 500 }).display).toBeNull();
    expect(plannedSizes({ w: 1200, h: 300 }).display).toEqual({ w: DISPLAY_EDGE, h: 256 });
  });

  it('keeps a very thin panorama at least a pixel high', () => {
    expect(fitWithin({ w: 40000, h: 10 }, FULL_EDGE)).toEqual({ w: 2048, h: 1 });
  });
});

describe('formats', () => {
  it('falls back to PNG for a cutout and JPEG for anything opaque', () => {
    expect(fallbackType(true)).toBe('image/png');
    expect(fallbackType(false)).toBe('image/jpeg');
  });

  it('checks transparency only where the type can carry it', () => {
    expect(mayBeTransparent('image/png')).toBe(true);
    expect(mayBeTransparent('image/webp')).toBe(true);
    expect(mayBeTransparent('image/jpeg')).toBe(false);
  });

  it('refuses a GIF over 10 MB before reading it, in its own words', async () => {
    const big = new File([new Uint8Array(GIF_MAX_BYTES + 1)], 'loop.gif', { type: 'image/gif' });
    await expect(compressImage(big)).resolves.toEqual({ refused: GIF_TOO_LARGE });
  });
});

describe('the display copy and sizes on the row (0070)', () => {
  it('sits beside the photo, `.d` before its extension', () => {
    expect(displayPathOf('u1/abc.webp')).toBe('u1/abc.d.webp');
    expect(displayPathOf('u1/abc')).toBe('u1/abc.d');
  });

  it('is what a display surface loads, only when the row says it exists', () => {
    const meta = { 'u1/a.webp': { w: 2048, h: 1536, d: { w: 1024, h: 768 } } };
    expect(variantPath('u1/a.webp', meta, 'display')).toBe('u1/a.d.webp');
    expect(variantPath('u1/a.webp', meta, 'full')).toBe('u1/a.webp');
    // An older photo is its own display image.
    expect(variantPath('u1/old.jpg', meta, 'display')).toBe('u1/old.jpg');
  });

  it('keeps only the paths the row names, an edit keeping what it had', () => {
    const before = { 'u1/a.webp': { w: 10, h: 5 }, 'u1/gone.webp': { w: 1, h: 1 } };
    const added = { 'u1/b.webp': { w: 3, h: 4 } };
    expect(mediaMetaFor(['u1/a.webp', 'u1/b.webp'], before, added)).toEqual({
      'u1/a.webp': { w: 10, h: 5 },
      'u1/b.webp': { w: 3, h: 4 },
    });
  });

  it('reads the column leniently, never throwing on a shape it does not know', () => {
    expect(mediaMetaOf(null)).toEqual({});
    expect(mediaMetaOf([1])).toEqual({});
    expect(mediaMetaOf({ a: { w: 'x' }, b: { w: 2, h: 1, d: { w: 0 } } })).toEqual({
      b: { w: 2, h: 1 },
    });
  });
});
