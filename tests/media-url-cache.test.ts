// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The browser keeps one signed URL per photo copy (2026-10-30): the first one
 * it is handed is the one every later render draws, so the photo's bytes come
 * from its own cache instead of being fetched again under a new token.
 */
const signBoardPhotos = vi.hoisted(() => vi.fn());
vi.mock('@/lib/media', () => ({ signBoardPhotos }));

const DAY = 24 * 60 * 60 * 1000;

/** A signed URL whose token says it expires `ms` from now, as Storage writes it. */
function urlFor(path: string, ms: number, nonce = 'a'): string {
  const payload = btoa(JSON.stringify({ url: path, exp: Math.floor((Date.now() + ms) / 1000) }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `https://x.supabase.co/storage/v1/object/sign/ripple-media/${path}?token=h.${payload}.${nonce}`;
}

async function freshModule() {
  vi.resetModules();
  return import('@/lib/media-url-cache');
}

beforeEach(() => {
  window.localStorage.clear();
  signBoardPhotos.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('one URL per photo copy', () => {
  it('reads when a URL ends from its token', async () => {
    const { signedUrlExpiry } = await freshModule();
    const url = urlFor('u1/a.webp', 7 * DAY);
    expect(signedUrlExpiry(url)).toBeGreaterThan(Date.now() + 6 * DAY);
    expect(signedUrlExpiry('https://x/plain.png')).toBeNull();
  });

  it('keeps the first URL it is handed while it has time left', async () => {
    const cache = await freshModule();
    const first = urlFor('u1/a.webp', 7 * DAY, 'first');
    cache.rememberMediaUrls('thumb', { 'u1/a.webp': first });
    cache.rememberMediaUrls('thumb', { 'u1/a.webp': urlFor('u1/a.webp', 7 * DAY, 'second') });
    expect(cache.cachedMediaUrl('thumb', 'u1/a.webp')).toBe(first);
    // Each copy is its own object.
    expect(cache.cachedMediaUrl('display', 'u1/a.webp')).toBeNull();
  });

  it('takes a new URL once the kept one nears its end', async () => {
    const cache = await freshModule();
    cache.rememberMediaUrls('thumb', { 'u1/a.webp': urlFor('u1/a.webp', 2 * 60 * 60 * 1000) });
    expect(cache.cachedMediaUrl('thumb', 'u1/a.webp')).toBeNull();
    const next = urlFor('u1/a.webp', 7 * DAY, 'next');
    cache.rememberMediaUrls('thumb', { 'u1/a.webp': next });
    expect(cache.cachedMediaUrl('thumb', 'u1/a.webp')).toBe(next);
  });

  it('survives a reload, and is gone after sign-out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const before = await freshModule();
    const url = urlFor('u1/a.webp', 7 * DAY);
    before.rememberMediaUrls('thumb', { 'u1/a.webp': url });
    vi.runAllTimers();
    const after = await freshModule();
    expect(after.cachedMediaUrl('thumb', 'u1/a.webp')).toBe(url);
    after.clearMediaUrls();
    expect(after.cachedMediaUrl('thumb', 'u1/a.webp')).toBeNull();
    expect(window.localStorage.getItem('weming.media-urls.v1')).toBeNull();
  });

  it('keeps a URL whose token says nothing, for the day the server promises', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cache = await freshModule();
    cache.rememberMediaUrls('thumb', {
      'u1/a.webp': 'https://r2.example/u1/a.webp?X-Amz-Expires=1',
    });
    expect(cache.cachedMediaUrl('thumb', 'u1/a.webp')).toBe(
      'https://r2.example/u1/a.webp?X-Amz-Expires=1',
    );
    vi.advanceTimersByTime(5 * 60 * 60 * 1000);
    expect(cache.cachedMediaUrl('thumb', 'u1/a.webp')).toBeNull();
  });

  it('keeps no app asset and no video: only storage paths are signed', async () => {
    const cache = await freshModule();
    cache.rememberMediaUrls('thumb', { 'app:welcome/shell.png': '/welcome/shell.png' });
    expect(cache.cachedMediaUrl('thumb', 'app:welcome/shell.png')).toBeNull();
  });
});

describe('asking the server', () => {
  it('asks once, in one call, for what every list wants in the same tick', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const cache = await freshModule();
    const a = urlFor('u1/a.webp', 7 * DAY);
    signBoardPhotos.mockResolvedValue({ 'u1/a.webp': a, 'u1/b.webp': null });
    cache.requestMediaUrls('thumb', [{ rippleId: 'r1', path: 'u1/a.webp' }]);
    cache.requestMediaUrls('thumb', [
      { rippleId: 'r1', path: 'u1/a.webp' },
      { rippleId: 'r2', path: 'u1/b.webp' },
    ]);
    vi.runAllTimers();
    expect(signBoardPhotos).toHaveBeenCalledTimes(1);
    expect(signBoardPhotos).toHaveBeenCalledWith(
      [
        { rippleId: 'r1', path: 'u1/a.webp' },
        { rippleId: 'r2', path: 'u1/b.webp' },
      ],
      'thumb',
    );
    await vi.waitFor(() => expect(cache.cachedMediaUrl('thumb', 'u1/a.webp')).toBe(a));
    expect(cache.isRefusedMedia('thumb', 'u1/b.webp')).toBe(true);

    // Kept or refused: neither is asked for again.
    cache.requestMediaUrls('thumb', [
      { rippleId: 'r1', path: 'u1/a.webp' },
      { rippleId: 'r2', path: 'u1/b.webp' },
    ]);
    vi.runAllTimers();
    expect(signBoardPhotos).toHaveBeenCalledTimes(1);
  });
});
