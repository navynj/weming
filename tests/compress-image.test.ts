import { describe, expect, it } from 'vitest';

import {
  capsCutout,
  compressImage,
  CUTOUT_MAX_BYTES,
  DISPLAY_EDGE,
  fallbackType,
  fitWithin,
  FULL_EDGE,
  GIF_MAX_BYTES,
  GIF_TOO_LARGE,
  mayBeTransparent,
  plannedSizes,
  THUMB_EDGE,
} from '@/lib/compress-image';
import {
  displayPathOf,
  mediaMetaFor,
  mediaMetaOf,
  thumbPathOf,
  variantPath,
} from '@/lib/ripple-media';

/**
 * What a photo becomes before it leaves the phone (2026-10-28, sizes
 * 2026-10-30): the sizes
 * and formats chosen here; the pixels themselves are drawn by the browser,
 * which e2e/photo-compress.spec.ts checks in Chromium.
 */
describe('sizes', () => {
  it('caps the long edge at 1600, the ratio kept', () => {
    expect(fitWithin({ w: 4032, h: 3024 }, FULL_EDGE)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin({ w: 3024, h: 4032 }, FULL_EDGE)).toEqual({ w: 1200, h: 1600 });
  });

  it('never draws a photo larger than it was', () => {
    expect(fitWithin({ w: 800, h: 600 }, FULL_EDGE)).toEqual({ w: 800, h: 600 });
  });

  it('makes a 1024 display copy and a 400 thumbnail only when the photo is larger than each', () => {
    expect(plannedSizes({ w: 4032, h: 3024 })).toEqual({
      full: { w: 1600, h: 1200 },
      display: { w: 1024, h: 768 },
      thumb: { w: 400, h: 300 },
    });
    expect(plannedSizes({ w: 1024, h: 500 }).display).toBeNull();
    expect(plannedSizes({ w: 1024, h: 500 }).thumb).toEqual({ w: THUMB_EDGE, h: 195 });
    expect(plannedSizes({ w: 1200, h: 300 }).display).toEqual({ w: DISPLAY_EDGE, h: 256 });
    expect(plannedSizes({ w: 400, h: 300 })).toEqual({
      full: { w: 400, h: 300 },
      display: null,
      thumb: null,
    });
  });

  it('keeps a very thin panorama at least a pixel high', () => {
    expect(fitWithin({ w: 40000, h: 10 }, FULL_EDGE)).toEqual({ w: 1600, h: 1 });
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

  it('sends a heavy PNG cutout up at its display size, never a WebP or a light one', () => {
    const blob = (type: string, bytes: number) => new Blob([new Uint8Array(bytes)], { type });
    const display = { blob: blob('image/png', 200_000), size: { w: 1024, h: 768 } };
    const full = (type: string, bytes: number) => ({
      blob: blob(type, bytes),
      size: { w: 1600, h: 1200 },
    });
    expect(capsCutout(full('image/png', CUTOUT_MAX_BYTES + 1), display)).toBe(true);
    expect(capsCutout(full('image/png', CUTOUT_MAX_BYTES), display)).toBe(false);
    expect(capsCutout(full('image/webp', CUTOUT_MAX_BYTES * 4), display)).toBe(false);
    // Already at most 1024: nothing smaller to send.
    expect(capsCutout(full('image/png', CUTOUT_MAX_BYTES * 4), null)).toBe(false);
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

  it('has a thumbnail beside it, `.t`, loaded where the row says there is one', () => {
    expect(thumbPathOf('u1/abc.webp')).toBe('u1/abc.t.webp');
    const meta = {
      'u1/a.webp': { w: 1600, h: 1200, d: { w: 1024, h: 768 }, t: { w: 400, h: 300 } },
      'u1/b.webp': { w: 1600, h: 1200, d: { w: 1024, h: 768 } },
    };
    expect(variantPath('u1/a.webp', meta, 'thumb')).toBe('u1/a.t.webp');
    expect(variantPath('u1/a.webp', meta, 'display')).toBe('u1/a.d.webp');
    // Before thumbnails: the display copy, else the photo itself.
    expect(variantPath('u1/b.webp', meta, 'thumb')).toBe('u1/b.d.webp');
    expect(variantPath('u1/old.jpg', meta, 'thumb')).toBe('u1/old.jpg');
    expect(mediaMetaOf(meta)).toEqual(meta);
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
