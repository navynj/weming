import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Signing is per-item fallible and never throws: Home must never 500 because
 * one fragment's media could not sign (the prod photo incident). Every
 * requested path comes back, signed or `null` for a placeholder.
 */
const sign = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: 'u1' } } }) },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrls: sign, remove }) } }),
}));

import { removeRippleMedia, signOwnMedia } from '@/lib/media';
import { clearSignedMediaCache } from '@/lib/signed-media-objects';

const MINE = ['u1/a.jpg', 'u1/b.jpg'];
let key: string | undefined;
let reported: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
  sign.mockReset();
  remove.mockReset();
  clearSignedMediaCache();
  reported = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  reported.mockRestore();
});

describe('signOwnMedia never throws', () => {
  it('signs per item: one refused photo is one placeholder, not a failed page', async () => {
    sign.mockResolvedValue({
      data: [
        { path: 'u1/a.jpg', signedUrl: 'https://signed/a', error: null },
        { path: 'u1/b.jpg', signedUrl: null, error: 'Object not found' },
      ],
      error: null,
    });
    await expect(signOwnMedia(MINE, {}, 'display')).resolves.toEqual({
      'u1/a.jpg': 'https://signed/a',
      'u1/b.jpg': null,
    });
  });

  it('returns placeholders, not a throw, when signing itself throws', async () => {
    sign.mockRejectedValue(new Error('storage is down'));
    await expect(signOwnMedia(MINE, {}, 'display')).resolves.toEqual({
      'u1/a.jpg': null,
      'u1/b.jpg': null,
    });
    expect(reported).toHaveBeenCalledWith(expect.stringContaining('storage is down'));
  });

  it('returns placeholders when the batch fails', async () => {
    sign.mockResolvedValue({ data: null, error: { message: 'refused' } });
    await expect(signOwnMedia(MINE, {}, 'display')).resolves.toEqual({
      'u1/a.jpg': null,
      'u1/b.jpg': null,
    });
  });

  it('names the missing service key in the log and still renders placeholders', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(signOwnMedia(MINE, {}, 'display')).resolves.toEqual({
      'u1/a.jpg': null,
      'u1/b.jpg': null,
    });
    expect(reported).toHaveBeenCalledWith(
      expect.stringContaining('Missing SUPABASE_SERVICE_ROLE_KEY'),
    );
    expect(sign).not.toHaveBeenCalled();
  });

  it('never signs a path that is not mine, and still returns it as a placeholder', async () => {
    sign.mockResolvedValue({
      data: [{ path: 'u1/a.jpg', signedUrl: 'https://signed/a', error: null }],
      error: null,
    });
    await expect(signOwnMedia(['u1/a.jpg', 'u2/theirs.jpg'], {}, 'display')).resolves.toEqual({
      'u1/a.jpg': 'https://signed/a',
      'u2/theirs.jpg': null,
    });
    expect(sign).toHaveBeenCalledWith(['u1/a.jpg'], expect.any(Number));
  });

  it('asks nothing of storage for no paths', async () => {
    await expect(signOwnMedia([], {}, 'display')).resolves.toEqual({});
    expect(sign).not.toHaveBeenCalled();
  });
});

describe('an app asset (H58) is the app’s, not the account’s', () => {
  const SHELL = 'app:welcome/shell.png';

  it('comes back as its own URL, never sent to storage to sign', async () => {
    sign.mockResolvedValue({
      data: [{ path: 'u1/a.jpg', signedUrl: 'https://signed/a', error: null }],
      error: null,
    });
    await expect(signOwnMedia([SHELL, 'u1/a.jpg'], {}, 'display')).resolves.toEqual({
      [SHELL]: '/welcome/shell.png',
      'u1/a.jpg': 'https://signed/a',
    });
    expect(sign).toHaveBeenCalledWith(['u1/a.jpg'], expect.any(Number));
  });

  it('keeps its URL when storage is down', async () => {
    sign.mockRejectedValue(new Error('storage is down'));
    await expect(signOwnMedia([SHELL], {}, 'display')).resolves.toEqual({
      [SHELL]: '/welcome/shell.png',
    });
  });

  it('is never removed with the record that carried it', async () => {
    remove.mockResolvedValue({ data: [], error: null });
    await removeRippleMedia([SHELL]);
    expect(remove).not.toHaveBeenCalled();
    await removeRippleMedia([SHELL, 'u1/a.jpg']);
    // The display copy's and thumbnail's paths are derived, so they go too.
    expect(remove).toHaveBeenCalledWith(['u1/a.jpg', 'u1/a.d.jpg', 'u1/a.t.jpg']);
  });
});

describe('the display copy (0070)', () => {
  it('signs the display copy where the row says there is one, keyed by the photo', async () => {
    sign.mockResolvedValue({
      data: [
        { path: 'u1/a.d.webp', signedUrl: 'https://signed/a-display', error: null },
        { path: 'u1/b.jpg', signedUrl: 'https://signed/b', error: null },
      ],
      error: null,
    });
    const meta = { 'u1/a.webp': { w: 2048, h: 1536, d: { w: 1024, h: 768 } } };
    await expect(signOwnMedia(['u1/a.webp', 'u1/b.jpg'], meta, 'display')).resolves.toEqual({
      'u1/a.webp': 'https://signed/a-display',
      'u1/b.jpg': 'https://signed/b',
    });
    // An older photo (no entry) is its own display image.
    expect(sign).toHaveBeenCalledWith(['u1/a.d.webp', 'u1/b.jpg'], expect.any(Number));
  });

  it('signs the full photo when asked for it', async () => {
    sign.mockResolvedValue({
      data: [{ path: 'u1/a.webp', signedUrl: 'https://signed/a', error: null }],
      error: null,
    });
    const meta = { 'u1/a.webp': { w: 2048, h: 1536, d: { w: 1024, h: 768 } } };
    await expect(signOwnMedia(['u1/a.webp'], meta, 'full')).resolves.toEqual({
      'u1/a.webp': 'https://signed/a',
    });
    expect(sign).toHaveBeenCalledWith(['u1/a.webp'], expect.any(Number));
  });
});

describe('the thumbnail (2026-10-30)', () => {
  const meta = {
    'u1/a.webp': { w: 1600, h: 1200, d: { w: 1024, h: 768 }, t: { w: 400, h: 300 } },
    'u1/b.webp': { w: 1600, h: 1200, d: { w: 1024, h: 768 } },
  };

  it('signs the thumbnail, else the display copy, else the photo', async () => {
    sign.mockResolvedValue({
      data: [
        { path: 'u1/a.t.webp', signedUrl: 'https://signed/a-thumb', error: null },
        { path: 'u1/b.d.webp', signedUrl: 'https://signed/b-display', error: null },
        { path: 'u1/c.jpg', signedUrl: 'https://signed/c', error: null },
      ],
      error: null,
    });
    await expect(
      signOwnMedia(['u1/a.webp', 'u1/b.webp', 'u1/c.jpg'], meta, 'thumb'),
    ).resolves.toEqual({
      'u1/a.webp': 'https://signed/a-thumb',
      'u1/b.webp': 'https://signed/b-display',
      'u1/c.jpg': 'https://signed/c',
    });
  });
});

describe('one URL per object (2026-10-30)', () => {
  it('hands the same URL to the next call, asking storage once, for a week', async () => {
    sign.mockResolvedValue({
      data: [{ path: 'u1/a.jpg', signedUrl: 'https://signed/a?token=1', error: null }],
      error: null,
    });
    const first = await signOwnMedia(['u1/a.jpg'], {}, 'display');
    sign.mockResolvedValue({
      data: [{ path: 'u1/a.jpg', signedUrl: 'https://signed/a?token=2', error: null }],
      error: null,
    });
    const second = await signOwnMedia(['u1/a.jpg'], {}, 'display');
    expect(second).toEqual(first);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith(['u1/a.jpg'], 7 * 24 * 60 * 60);
  });

  it('signs only the objects it has not issued yet', async () => {
    sign.mockResolvedValueOnce({
      data: [{ path: 'u1/a.jpg', signedUrl: 'https://signed/a', error: null }],
      error: null,
    });
    await signOwnMedia(['u1/a.jpg'], {}, 'display');
    sign.mockResolvedValueOnce({
      data: [{ path: 'u1/b.jpg', signedUrl: 'https://signed/b', error: null }],
      error: null,
    });
    await expect(signOwnMedia(['u1/a.jpg', 'u1/b.jpg'], {}, 'display')).resolves.toEqual({
      'u1/a.jpg': 'https://signed/a',
      'u1/b.jpg': 'https://signed/b',
    });
    expect(sign).toHaveBeenLastCalledWith(['u1/b.jpg'], expect.any(Number));
  });
});
