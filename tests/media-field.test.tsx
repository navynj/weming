// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Attaching a photo (2026-10-28): made ready on the phone, then a PUT to the
 * URLs the server issued for a path it minted. The browser never names the
 * path and holds no storage client.
 */
const uploads = vi.hoisted(() => ({
  asked: [] as { type: string; display: boolean }[][],
  puts: [] as string[],
  status: 200,
  body: '{}',
  signedOut: false,
}));
const ready = vi.hoisted(() => ({
  display: false,
}));
vi.mock('@/lib/compress-image', async (actual) => ({
  ...(await actual<typeof import('@/lib/compress-image')>()),
  // As outside Safari: a HEIC does not decode; anything else is made ready.
  compressImage: async (file: File) => {
    const real = await actual<typeof import('@/lib/compress-image')>();
    if (real.isHeic(file)) return { refused: real.HEIC_UNREADABLE };
    if (file.type === 'image/gif' && file.size > real.GIF_MAX_BYTES) {
      return { refused: real.GIF_TOO_LARGE };
    }
    const blob = new Blob(['x'.repeat(2048)], { type: 'image/webp' });
    return {
      full: { blob, size: { w: 2048, h: 1536 } },
      display: ready.display
        ? { blob: new Blob(['y'], { type: 'image/webp' }), size: { w: 1024, h: 768 } }
        : null,
    };
  },
}));
vi.mock('@/features/input-sheet/upload-actions', () => ({
  requestMediaUploads: async (asked: { type: string; display: boolean }[]) => {
    uploads.asked.push(asked);
    if (uploads.signedOut) {
      return { ok: false, message: 'You are signed out. Sign in again to attach a photo.' };
    }
    return {
      ok: true,
      uploads: asked.map((a, i) => ({
        path: `u1/0000000${i}-0000-4000-8000-000000000000.webp`,
        upload: { url: 'https://storage/full', headers: { 'content-type': a.type } },
        display: a.display ? { url: 'https://storage/display', headers: {} } : null,
      })),
    };
  },
}));

import { mediaKey } from '@/lib/media-bucket';
import { formatBytes, uploadFailure, useMediaAttach } from '@/features/input-sheet/media-field';

afterEach(cleanup);
beforeEach(() => {
  uploads.asked.length = 0;
  uploads.puts.length = 0;
  uploads.status = 200;
  uploads.body = '{}';
  uploads.signedOut = false;
  ready.display = false;
  URL.createObjectURL = () => 'blob:preview';
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    uploads.puts.push(String(url));
    return new Response(uploads.body, { status: uploads.status });
  }) as typeof fetch;
});

function harness() {
  const changed: string[][] = [];
  let api: ReturnType<typeof useMediaAttach> | null = null;
  function Probe() {
    api = useMediaAttach([], (next) => changed.push(next));
    return <p data-failed>{api.failed}</p>;
  }
  const view = render(<Probe />);
  const attach = (files: File[]) =>
    act(() => api!.attach(files as unknown as FileList) as Promise<void>);
  return { view, changed, attach, meta: () => api!.meta };
}
const file = (name: string, type: string, bytes = 1) =>
  new File(['x'.repeat(bytes)], name, { type });

describe('attaching a photo (review: a friend could not)', () => {
  it('goes up at the path the server minted, never its own name, with its size', async () => {
    const { attach, changed, meta } = harness();
    await attach([file('카카오톡_20261027_사진.jpg', 'image/jpeg')]);
    expect(uploads.asked).toEqual([[{ type: 'image/webp', display: false }]]);
    expect(uploads.puts).toEqual(['https://storage/full']);
    const [path] = changed[0];
    expect(path).toMatch(/^u1\/[0-9a-f-]{36}\.webp$/);
    expect(meta()).toEqual({ [path]: { w: 2048, h: 1536 } });
  });

  it('sends the display copy beside it and records its size', async () => {
    ready.display = true;
    const { attach, changed, meta } = harness();
    await attach([file('big.jpg', 'image/jpeg')]);
    expect(uploads.asked).toEqual([[{ type: 'image/webp', display: true }]]);
    expect(uploads.puts).toEqual(['https://storage/full', 'https://storage/display']);
    expect(meta()[changed[0][0]]).toEqual({ w: 2048, h: 1536, d: { w: 1024, h: 768 } });
  });

  it('mints keys in my folder, by type', () => {
    expect(mediaKey('u1', 'image/png')).toMatch(/^u1\/[0-9a-f-]{36}\.png$/);
    expect(mediaKey('u1', 'application/x-unknown')).toMatch(/\.img$/);
  });

  it('refuses a HEIC that will not decode, saying why, and still adds the rest', async () => {
    const { attach, changed, view } = harness();
    await attach([file('IMG_0001.HEIC', 'image/heic'), file('screen.png', 'image/png')]);
    expect(uploads.puts).toHaveLength(1);
    expect(changed).toHaveLength(1);
    await waitFor(() =>
      expect(view.container.querySelector('[data-failed]')!.textContent).toContain(
        'IMG_0001.HEIC: this HEIC photo could not be read',
      ),
    );
  });

  it('refuses a GIF over 10 MB with its own words', async () => {
    const { attach, changed, view } = harness();
    await attach([file('huge.gif', 'image/gif', 10 * 1024 * 1024 + 1)]);
    expect(changed).toEqual([]);
    expect(uploads.asked).toEqual([]);
    expect(view.container.querySelector('[data-failed]')!.textContent).toBe(
      'huge.gif: This GIF is too large. Try one under 10 MB.',
    );
  });

  it('never fails silently: a refused upload names the file and the reason', async () => {
    uploads.status = 413;
    uploads.body = JSON.stringify({ message: 'Payload too large' });
    const { attach, changed, view } = harness();
    await attach([file('big.jpg', 'image/jpeg')]);
    expect(changed).toEqual([]);
    expect(view.container.querySelector('[data-failed]')!.textContent).toBe(
      'big.jpg: it is too large to upload (50MB at most).',
    );
  });

  it('says so when the server will not issue a URL', async () => {
    uploads.signedOut = true;
    const { attach, changed, view } = harness();
    await attach([file('a.jpg', 'image/jpeg')]);
    expect(changed).toEqual([]);
    expect(view.container.querySelector('[data-failed]')!.textContent).toContain('signed out');
  });

  it('says what each failure means', () => {
    expect(
      uploadFailure({ message: 'new row violates row-level security policy', statusCode: '403' }),
    ).toContain('signed out');
    expect(uploadFailure({ message: 'Failed to fetch' })).toContain('could not reach the server');
    expect(uploadFailure({ message: 'Invalid key: …' })).toBe(
      'it would not upload (Invalid key: …).',
    );
  });

  it('says the size going up in words', () => {
    expect(formatBytes(420_000)).toBe('410 KB');
    expect(formatBytes(3_500_000)).toBe('3.3 MB');
  });
});
