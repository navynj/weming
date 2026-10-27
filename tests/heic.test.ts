import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const decoder = vi.hoisted(() => ({
  calls: 0,
  fail: false,
}));
vi.mock('heic2any', () => ({
  default: async ({ blob }: { blob: Blob }) => {
    decoder.calls += 1;
    if (decoder.fail) throw new Error('unsupported');
    return new Blob([await blob.arrayBuffer()], { type: 'image/jpeg' });
  },
}));

import { isHeic, readableImage } from '@/lib/heic';

/** Whether the browser draws HEIC itself: Safari yes, Chrome no. */
let drawsHeic = false;
beforeEach(() => {
  decoder.calls = 0;
  decoder.fail = false;
  drawsHeic = false;
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
    if (/hei[cf]/.test(blob.type) && !drawsHeic) throw new Error('cannot decode');
    return { close: () => {} };
  });
});
afterEach(() => vi.unstubAllGlobals());

const heic = new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' });

describe('a HEIC, wherever it is picked (review)', () => {
  it('knows one by its type or its name', () => {
    expect(isHeic(heic)).toBe(true);
    expect(isHeic({ type: '', name: 'photo.heif' })).toBe(true);
    expect(isHeic({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
  });

  it('leaves anything else alone, and never loads the decoder for it', async () => {
    const jpeg = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(await readableImage(jpeg)).toBe(jpeg);
    expect(decoder.calls).toBe(0);
  });

  it('leaves a HEIC the browser draws itself (Safari) as it is', async () => {
    drawsHeic = true;
    expect(await readableImage(heic)).toBe(heic);
    expect(decoder.calls).toBe(0);
  });

  it('decodes one the browser cannot draw into a JPEG', async () => {
    const out = await readableImage(heic);
    expect(decoder.calls).toBe(1);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
  });

  it('hands it back as it was when even the decoder cannot, for the caller to refuse', async () => {
    decoder.fail = true;
    expect(await readableImage(heic)).toBe(heic);
  });
});
