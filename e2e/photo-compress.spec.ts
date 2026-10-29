import { expect, test } from '@playwright/test';

/**
 * What a photo becomes before it leaves the phone (2026-10-28), in Chrome's
 * own decoder and encoder, on /dev/compress: a large JPEG carrying a GPS
 * location and a turn comes out at most 2048px, turned upright, with no
 * metadata left; a transparent PNG keeps its alpha; both get a 1024px
 * display copy.
 */

/** An EXIF block, by hand: Orientation 6 (turned a quarter) and a GPS latitude. */
function exifSegment(): number[] {
  const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
  const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const entry = (tag: number, type: number, count: number, value: number[]) => [
    ...be16(tag),
    ...be16(type),
    ...be32(count),
    ...value,
  ];
  const IFD0 = 8;
  const GPS = IFD0 + 2 + 2 * 12 + 4;
  const DATA = GPS + 2 + 2 * 12 + 4;
  const tiff = [
    ...[0x4d, 0x4d, 0x00, 0x2a],
    ...be32(IFD0),
    ...be16(2),
    ...entry(0x0112, 3, 1, [...be16(6), 0, 0]), // Orientation: 6
    ...entry(0x8825, 4, 1, be32(GPS)), // GPSInfo
    ...be32(0),
    ...be16(2),
    ...entry(0x0001, 2, 2, [0x4e, 0, 0, 0]), // GPSLatitudeRef: "N"
    ...entry(0x0002, 5, 3, be32(DATA)), // GPSLatitude
    ...be32(0),
    ...[49, 1, 16, 1, 3012, 100].flatMap(be32),
  ];
  const payload = [...[0x45, 0x78, 0x69, 0x66, 0, 0], ...tiff]; // "Exif\0\0"
  return [0xff, 0xe1, ...be16(payload.length + 2), ...payload];
}

/** Whether the bytes hold an ASCII marker. */
function holds(bytes: number[], marker: string): boolean {
  const want = [...marker].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i + want.length <= bytes.length; i += 1) {
    for (let j = 0; j < want.length; j += 1) if (bytes[i + j] !== want[j]) continue outer;
    return true;
  }
  return false;
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser run is enough: no layout here');
  await page.goto('/dev/compress');
  await page.waitForFunction(() => typeof window.__compress === 'function');
});

test('a large JPEG: at most 2048px, upright, no EXIF or location, and a display copy', async ({
  page,
}) => {
  const result = await page.evaluate(async (exif) => {
    // 4000×3000, stored sideways: Orientation 6 means it is shown 3000×4000.
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 3000;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 4000, 3000);
    gradient.addColorStop(0, '#0507C9');
    gradient.addColorStop(1, '#F1F3F7');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4000, 3000);
    const plain = new Uint8Array(
      await (
        await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.9))
      ).arrayBuffer(),
    );
    // After the SOI marker, the APP1 block: what a phone's camera writes.
    const withExif = new Uint8Array([...plain.slice(0, 2), ...exif, ...plain.slice(2)]);
    const input = [...withExif];
    const out = await window.__compress!(
      new File([withExif], 'IMG_0001.jpg', { type: 'image/jpeg' }),
    );
    if ('refused' in out) throw new Error(out.refused);
    const decoded = await createImageBitmap(new Blob([new Uint8Array(out.full.bytes)]));
    return { input, out, decoded: { w: decoded.width, h: decoded.height } };
  }, exifSegment());

  // The fixture really carried the location.
  expect(holds(result.input, 'Exif')).toBe(true);

  const { full, display } = result.out;
  expect(Math.max(full.w, full.h)).toBe(2048);
  // Turned upright: the orientation is in the pixels, not a tag.
  expect(full).toMatchObject({ w: 1536, h: 2048 });
  expect(result.decoded).toEqual({ w: 1536, h: 2048 });
  expect(full.type).toBe('image/webp');
  for (const copy of [full, display!]) {
    expect(holds(copy.bytes, 'Exif')).toBe(false);
    expect(holds(copy.bytes, 'EXIF')).toBe(false);
    expect(holds(copy.bytes, 'XMP')).toBe(false);
  }
  expect(display).toMatchObject({ w: 768, h: 1024, type: 'image/webp' });
  expect(display!.bytes.length).toBeLessThan(full.bytes.length);
});

test('a transparent PNG keeps its alpha, in both copies', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 1500;
    const context = canvas.getContext('2d')!;
    // The left half a cutout's subject, the right half nothing at all.
    context.fillStyle = '#161621';
    context.fillRect(0, 0, 1500, 1500);
    const png = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    const out = await window.__compress!(new File([png], 'cutout.png', { type: 'image/png' }));
    if ('refused' in out) throw new Error(out.refused);
    const alphaAt = async (bytes: number[], x: number, y: number) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const cx = c.getContext('2d')!;
      cx.drawImage(bitmap, 0, 0);
      return cx.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data[3];
    };
    return {
      full: { type: out.full.type, w: out.full.w, h: out.full.h },
      display: out.display && { type: out.display.type, w: out.display.w, h: out.display.h },
      alpha: {
        fullSubject: await alphaAt(out.full.bytes, 0.25, 0.5),
        fullEmpty: await alphaAt(out.full.bytes, 0.75, 0.5),
        displayEmpty: out.display ? await alphaAt(out.display.bytes, 0.75, 0.5) : null,
      },
    };
  });

  expect(result.full).toEqual({ type: 'image/webp', w: 2048, h: 1024 });
  expect(result.display).toEqual({ type: 'image/webp', w: 1024, h: 512 });
  expect(result.alpha.fullSubject).toBe(255);
  expect(result.alpha.fullEmpty).toBe(0);
  expect(result.alpha.displayEmpty).toBe(0);
});

test('a small photo is drawn again all the same, so its metadata never leaves', async ({
  page,
}) => {
  const result = await page.evaluate(async (exif) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvas.getContext('2d')!.fillRect(0, 0, 640, 480);
    const plain = new Uint8Array(
      await (
        await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg'))
      ).arrayBuffer(),
    );
    const withExif = new Uint8Array([...plain.slice(0, 2), ...exif, ...plain.slice(2)]);
    const out = await window.__compress!(new File([withExif], 'small.jpg', { type: 'image/jpeg' }));
    if ('refused' in out) throw new Error(out.refused);
    return out;
  }, exifSegment());

  expect(result.display).toBeNull();
  expect(result.full).toMatchObject({ w: 480, h: 640 });
  expect(holds(result.full.bytes, 'Exif')).toBe(false);
});

test('the metadata scrub leaves a real photo drawable and upright, its location gone', async ({
  page,
}) => {
  const { strip, inspect } = await import('../scripts/image-metadata.mjs');
  const original = await page.evaluate(async (exif) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    canvas.getContext('2d')!.fillRect(0, 0, 400, 300);
    const plain = new Uint8Array(
      await (
        await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg'))
      ).arrayBuffer(),
    );
    return [...plain.slice(0, 2), ...exif, ...plain.slice(2)];
  }, exifSegment());
  expect(inspect(new Uint8Array(original))).toMatchObject({ gps: true, orientation: 6 });

  const clean = [...strip(new Uint8Array(original))!];
  expect(inspect(new Uint8Array(clean))).toMatchObject({ metadata: false, gps: false });
  const drawn = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]), {
      imageOrientation: 'from-image',
    });
    return { w: bitmap.width, h: bitmap.height };
  }, clean);
  // Still turned a quarter, by the one tag it kept.
  expect(drawn).toEqual({ w: 300, h: 400 });
});
