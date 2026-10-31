import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Avatar URLs (0018): signed for a week (2026-10-30) and cached per (person, version), so
 * the same photo is the same URL across renders and the browser's cache
 * holds; a new version is a new URL. Only whom `visible_avatars` allows is
 * signed, and a failure is initials, never a throw.
 */
const sign = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrls: sign }) } }),
}));

import { AVATAR_TTL_SECONDS, clearAvatarCache, signAvatars } from '@/lib/avatars';
import type { DuringClient } from '@/lib/queries/profile';

const viewer = (visible: string[]) =>
  ({ rpc: async () => ({ data: visible, error: null }) }) as unknown as DuringClient;

let key: string | undefined;
let n = 0;
beforeEach(() => {
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
  clearAvatarCache();
  sign.mockReset();
  sign.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({
      path,
      signedUrl: `https://signed/${path}?t=${++n}`,
      error: null,
    })),
    error: null,
  }));
});
afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
});

describe('signAvatars', () => {
  it('signs for a week, once per version', async () => {
    const first = await signAvatars(viewer(['ben']), [{ id: 'ben', version: 1 }]);
    const again = await signAvatars(viewer(['ben']), [{ id: 'ben', version: 1 }]);
    expect(again.ben).toBe(first.ben);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith(['ben'], AVATAR_TTL_SECONDS);
    expect(AVATAR_TTL_SECONDS).toBe(7 * 86400);
    // The version keys the browser's kept URL; a fragment is never sent.
    expect(first.ben).toMatch(/#v1$/);

    const next = await signAvatars(viewer(['ben']), [{ id: 'ben', version: 2 }]);
    expect(next.ben).not.toBe(first.ben);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('leaves out whom I may not see, and anyone without a photo', async () => {
    const urls = await signAvatars(viewer(['ben']), [
      { id: 'ben', version: 1 },
      { id: 'cal', version: 3 },
      { id: 'dee', version: null },
    ]);
    expect(urls).toEqual({
      ben: expect.stringMatching(/^https:\/\/signed\/ben/),
      cal: null,
      dee: null,
    });
    expect(sign).toHaveBeenCalledWith(['ben'], AVATAR_TTL_SECONDS);
  });

  it('is initials, not a throw, when signing fails', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    sign.mockRejectedValue(new Error('storage is down'));
    await expect(signAvatars(viewer(['ben']), [{ id: 'ben', version: 1 }])).resolves.toEqual({
      ben: null,
    });
    expect(reported).toHaveBeenCalledWith(expect.stringContaining('storage is down'));
    reported.mockRestore();
  });
});
