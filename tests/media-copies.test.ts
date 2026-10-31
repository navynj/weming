import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { copyPathOf, formatOfPath, thumbLike, webpCopies } from '../scripts/media-copies.mjs';

/**
 * What the one-off re-encode (scripts/reencode-media.mjs) makes of a stored
 * photo: the copies an upload makes now (2026-10-30), drawn by sharp.
 */
async function photo(w: number, h: number, opts: { orientation?: number } = {}) {
  let image = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 5, g: 7, b: 201 } },
  }).jpeg();
  if (opts.orientation) image = image.withMetadata({ orientation: opts.orientation });
  return new Uint8Array(await image.toBuffer());
}

/** A cutout whose subject is noise, so it stays heavy however it is drawn. */
async function heavyCutout(w: number, h: number) {
  const raw = Buffer.alloc(w * h * 4);
  for (let i = 0; i < raw.length; i += 4) {
    const inside = (i / 4) % w < w / 2;
    raw[i] = Math.floor(Math.random() * 256);
    raw[i + 1] = Math.floor(Math.random() * 256);
    raw[i + 2] = Math.floor(Math.random() * 256);
    raw[i + 3] = inside ? 255 : 0;
  }
  return new Uint8Array(
    await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer(),
  );
}

describe('a stored photo drawn again', () => {
  it('as WebP at most 1600px, with a 1024 display copy and a 400 thumbnail', async () => {
    const out = await webpCopies(await photo(4000, 3000));
    expect(out.full.size).toEqual({ w: 1600, h: 1200 });
    expect(out.display?.size).toEqual({ w: 1024, h: 768 });
    expect(out.thumb?.size).toEqual({ w: 400, h: 300 });
    expect((await sharp(out.full.bytes).metadata()).format).toBe('webp');
    expect(out.capped).toBe(false);
  });

  it('upright, its EXIF turn applied and none of its metadata kept', async () => {
    const out = await webpCopies(await photo(4000, 3000, { orientation: 6 }));
    expect(out.source).toEqual({ w: 3000, h: 4000 });
    expect(out.full.size).toEqual({ w: 1200, h: 1600 });
    const meta = await sharp(out.full.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('a heavy cutout keeps its alpha and goes at 1024', async () => {
    const out = await webpCopies(await heavyCutout(2400, 2400));
    expect(out.transparent).toBe(true);
    expect(out.capped).toBe(true);
    expect(out.full.size).toEqual({ w: 1024, h: 1024 });
    expect(out.display).toBeNull();
    expect((await sharp(out.full.bytes).metadata()).hasAlpha).toBe(true);
  }, 30_000);

  it('a thumbnail in the photo’s own format, none for a small one', async () => {
    const big = await thumbLike(await photo(1200, 900), 'jpeg');
    expect(big.thumb?.size).toEqual({ w: 400, h: 300 });
    expect((await sharp(big.thumb!.bytes).metadata()).format).toBe('jpeg');
    expect((await thumbLike(await photo(400, 300), 'jpeg')).thumb).toBeNull();
  });

  it('names its copies as the app does', () => {
    expect(copyPathOf('u1/a.png', 't')).toBe('u1/a.t.png');
    expect(copyPathOf('u1/a.png', 'd')).toBe('u1/a.d.png');
    expect(formatOfPath('u1/a.JPG')).toBe('jpeg');
    expect(formatOfPath('u1/a.heic')).toBeNull();
  });
});
