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
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrls: sign, remove }) } }),
}));

import { removeRippleMedia, signOwnMedia } from '@/lib/media';

const MINE = ['u1/a.jpg', 'u1/b.jpg'];
let key: string | undefined;
let reported: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
  sign.mockReset();
  remove.mockReset();
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
    await expect(signOwnMedia(MINE)).resolves.toEqual({
      'u1/a.jpg': 'https://signed/a',
      'u1/b.jpg': null,
    });
  });

  it('returns placeholders, not a throw, when signing itself throws', async () => {
    sign.mockRejectedValue(new Error('storage is down'));
    await expect(signOwnMedia(MINE)).resolves.toEqual({ 'u1/a.jpg': null, 'u1/b.jpg': null });
    expect(reported).toHaveBeenCalledWith(expect.stringContaining('storage is down'));
  });

  it('returns placeholders when the batch fails', async () => {
    sign.mockResolvedValue({ data: null, error: { message: 'refused' } });
    await expect(signOwnMedia(MINE)).resolves.toEqual({ 'u1/a.jpg': null, 'u1/b.jpg': null });
  });

  it('names the missing service key in the log and still renders placeholders', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(signOwnMedia(MINE)).resolves.toEqual({ 'u1/a.jpg': null, 'u1/b.jpg': null });
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
    await expect(signOwnMedia(['u1/a.jpg', 'u2/theirs.jpg'])).resolves.toEqual({
      'u1/a.jpg': 'https://signed/a',
      'u2/theirs.jpg': null,
    });
    expect(sign).toHaveBeenCalledWith(['u1/a.jpg'], expect.any(Number));
  });

  it('asks nothing of storage for no paths', async () => {
    await expect(signOwnMedia([])).resolves.toEqual({});
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
    await expect(signOwnMedia([SHELL, 'u1/a.jpg'])).resolves.toEqual({
      [SHELL]: '/welcome/shell.png',
      'u1/a.jpg': 'https://signed/a',
    });
    expect(sign).toHaveBeenCalledWith(['u1/a.jpg'], expect.any(Number));
  });

  it('keeps its URL when storage is down', async () => {
    sign.mockRejectedValue(new Error('storage is down'));
    await expect(signOwnMedia([SHELL])).resolves.toEqual({ [SHELL]: '/welcome/shell.png' });
  });

  it('is never removed with the record that carried it', async () => {
    await removeRippleMedia([SHELL]);
    expect(remove).not.toHaveBeenCalled();
    await removeRippleMedia([SHELL, 'u1/a.jpg']);
    expect(remove).toHaveBeenCalledWith(['u1/a.jpg']);
  });
});
