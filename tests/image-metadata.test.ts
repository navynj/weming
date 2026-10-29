import { crc32 } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  formatOf,
  inspect,
  orientationOnlyTiff,
  readTiff,
  strip,
} from '../scripts/image-metadata.mjs';

/**
 * The metadata scrub (2026-10-28), on files built by hand: what each format
 * carries is found, a location among it is counted, and stripping leaves the
 * pixels byte for byte — keeping only a non-default orientation.
 */
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const has = (bytes: Uint8Array, s: string) => Buffer.from(bytes).includes(Buffer.from(s, 'latin1'));

/** A TIFF block: an orientation, and a GPS pointer with a latitude. */
function tiff(orientation: number): number[] {
  const entry = (tag: number, type: number, count: number, value: number[]) => [
    ...be16(tag),
    ...be16(type),
    ...be32(count),
    ...value,
  ];
  const gps = 8 + 2 + 2 * 12 + 4;
  return [
    ...text('MM'),
    ...be16(42),
    ...be32(8),
    ...be16(2),
    ...entry(0x0112, 3, 1, [...be16(orientation), 0, 0]),
    ...entry(0x8825, 4, 1, be32(gps)),
    ...be32(0),
    ...be16(1),
    ...entry(0x0001, 2, 2, [0x4e, 0, 0, 0]),
    ...be32(0),
  ];
}

const SCAN = [0xff, 0xda, ...be16(8), 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0x00, 0x56];

function jpeg(orientation: number): Uint8Array {
  const segment = (marker: number, payload: number[]) => [
    0xff,
    marker,
    ...be16(payload.length + 2),
    ...payload,
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...text('Exif\0\0'), ...tiff(orientation)]),
    ...segment(0xe1, [
      ...text('http://ns.adobe.com/xap/1.0/\0'),
      ...text('<exif:GPSLatitude>49</exif:GPSLatitude>'),
    ]),
    ...segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1, 9, 9]),
    ...segment(0xfe, text('a comment')),
    ...SCAN,
    0xff,
    0xd9,
    ...text('MPF trailing image'),
  ]);
}

function png(): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const body = [...text(type), ...data];
    return [...be32(data.length), ...body, ...be32(crc32(Buffer.from(body)))];
  };
  return new Uint8Array([
    ...[0x89, ...text('PNG\r\n'), 0x1a, 0x0a],
    ...chunk('IHDR', [...be32(2), ...be32(2), 8, 6, 0, 0, 0]),
    ...chunk('tEXt', text('Software\0Phone')),
    ...chunk('eXIf', tiff(1)),
    ...chunk('IDAT', [1, 2, 3, 4]),
    ...chunk('IEND', []),
  ]);
}

function webp(): Uint8Array {
  const chunk = (fourcc: string, data: number[]) => [
    ...text(fourcc),
    ...le32(data.length),
    ...data,
    ...(data.length & 1 ? [0] : []),
  ];
  const body = [
    ...text('WEBP'),
    ...chunk('VP8X', [0x1c, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
    ...chunk('VP8L', [0x2f, 1, 2, 3, 4]),
    ...chunk('EXIF', tiff(1)),
    ...chunk('XMP ', text('<x GPSLongitude="1"/>')),
  ];
  return new Uint8Array([...text('RIFF'), ...le32(body.length), ...body]);
}

describe('finding metadata', () => {
  it('names formats by their bytes', () => {
    expect([formatOf(jpeg(1)), formatOf(png()), formatOf(webp())]).toEqual(['jpeg', 'png', 'webp']);
    expect(formatOf(new Uint8Array(text('GIF89a')))).toBe('gif');
  });

  it('reads the orientation and a location from TIFF', () => {
    expect(readTiff(new Uint8Array(tiff(6)))).toEqual({ orientation: 6, gps: true });
  });

  it('finds a location in a JPEG, a PNG and a WebP', () => {
    for (const file of [jpeg(1), png(), webp()]) {
      expect(inspect(file)).toMatchObject({ supported: true, metadata: true, gps: true });
    }
  });

  it('does not rewrite what it cannot', () => {
    expect(inspect(new Uint8Array([0, 0, 0, 0, ...text('ftypavif')])).supported).toBe(false);
  });
});

describe('stripping it', () => {
  it('leaves a JPEG its JFIF, colour profile and scan, and nothing else', () => {
    const clean = strip(jpeg(1))!;
    expect(inspect(clean)).toMatchObject({ metadata: false, gps: false });
    expect(has(clean, 'Exif')).toBe(false);
    expect(has(clean, 'GPSLatitude')).toBe(false);
    expect(has(clean, 'a comment')).toBe(false);
    expect(has(clean, 'MPF trailing')).toBe(false);
    expect(has(clean, 'JFIF')).toBe(true);
    expect(has(clean, 'ICC_PROFILE')).toBe(true);
    // The scan, byte for byte, through EOI.
    expect([...clean.slice(-SCAN.length - 2)]).toEqual([...SCAN, 0xff, 0xd9]);
  });

  it('keeps a non-default orientation as the only tag left', () => {
    const clean = strip(jpeg(6))!;
    const found = inspect(clean);
    expect(found).toMatchObject({ metadata: false, gps: false, orientation: 6 });
    expect(has(clean, Buffer.from(orientationOnlyTiff(6)).toString('latin1'))).toBe(true);
    // Run again, nothing changes.
    expect(strip(clean)).toBe(clean);
  });

  it('drops a PNG’s text and EXIF chunks, the rest valid', () => {
    const clean = strip(png())!;
    expect(inspect(clean)).toMatchObject({ metadata: false, gps: false });
    expect(has(clean, 'tEXt')).toBe(false);
    expect(has(clean, 'eXIf')).toBe(false);
    expect(has(clean, 'IHDR') && has(clean, 'IDAT') && has(clean, 'IEND')).toBe(true);
  });

  it('drops a WebP’s EXIF and XMP chunks, clears their flags and fixes its size', () => {
    const clean = strip(webp())!;
    expect(inspect(clean)).toMatchObject({ metadata: false, gps: false });
    expect(has(clean, 'EXIF') || has(clean, 'XMP ')).toBe(false);
    const flags = clean[20];
    expect(flags & 0x0c).toBe(0);
    expect(flags & 0x10).toBe(0x10); // alpha kept
    const riffSize = clean[4] | (clean[5] << 8) | (clean[6] << 16) | (clean[7] << 24);
    expect(riffSize).toBe(clean.length - 8);
    expect(has(clean, 'VP8L')).toBe(true);
  });

  it('returns a clean file as it is', () => {
    const clean = strip(png())!;
    expect(strip(clean)).toBe(clean);
  });
});
