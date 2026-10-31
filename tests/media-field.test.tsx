// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Attaching a photo (2026-10-28): made ready on the phone, then a PUT to the
 * URLs the server issued for a path it minted. The browser never names the
 * path and holds no storage client.
 */
const uploads = vi.hoisted(() => ({
  asked: [] as { type: string; display: boolean; thumb: boolean }[][],
  puts: [] as string[],
  status: 200,
  body: '{}',
  signedOut: false,
  minted: 0,
  discarded: [] as string[][],
}));
const ready = vi.hoisted(() => ({
  display: false,
  thumb: false,
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
      full: { blob, size: { w: 1600, h: 1200 } },
      display: ready.display
        ? { blob: new Blob(['y'], { type: 'image/webp' }), size: { w: 1024, h: 768 } }
        : null,
      thumb: ready.thumb
        ? { blob: new Blob(['z'], { type: 'image/webp' }), size: { w: 400, h: 300 } }
        : null,
    };
  },
}));
vi.mock('@/features/input-sheet/upload-actions', () => ({
  requestMediaUploads: async (asked: { type: string; display: boolean; thumb: boolean }[]) => {
    uploads.asked.push(asked);
    if (uploads.signedOut) {
      return { ok: false, message: 'You are signed out. Sign in again to attach a photo.' };
    }
    return {
      ok: true,
      uploads: asked.map((a) => ({
        path: `u1/0000000${uploads.minted++}-0000-4000-8000-000000000000.webp`,
        upload: { url: 'https://storage/full', headers: { 'content-type': a.type } },
        display: a.display ? { url: 'https://storage/display', headers: {} } : null,
        thumb: a.thumb ? { url: 'https://storage/thumb', headers: {} } : null,
      })),
    };
  },
  discardMediaUploads: async (paths: string[]) => {
    uploads.discarded.push(paths);
    return { ok: true };
  },
}));

import { mediaKey } from '@/lib/media-bucket';
import {
  discardingOnRefusal,
  formatBytes,
  uploadFailure,
  useMediaAttach,
} from '@/features/input-sheet/media-field';
import { useState } from 'react';

afterEach(cleanup);
beforeEach(() => {
  uploads.asked.length = 0;
  uploads.puts.length = 0;
  uploads.status = 200;
  uploads.body = '{}';
  uploads.signedOut = false;
  uploads.minted = 0;
  uploads.discarded.length = 0;
  ready.display = false;
  ready.thumb = false;
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
    expect(uploads.asked).toEqual([[{ type: 'image/webp', display: false, thumb: false }]]);
    expect(uploads.puts).toEqual(['https://storage/full']);
    const [path] = changed[0];
    expect(path).toMatch(/^u1\/[0-9a-f-]{36}\.webp$/);
    expect(meta()).toEqual({ [path]: { w: 1600, h: 1200 } });
  });

  it('sends the display copy beside it and records its size', async () => {
    ready.display = true;
    const { attach, changed, meta } = harness();
    await attach([file('big.jpg', 'image/jpeg')]);
    expect(uploads.asked).toEqual([[{ type: 'image/webp', display: true, thumb: false }]]);
    expect(uploads.puts).toEqual(['https://storage/full', 'https://storage/display']);
    expect(meta()[changed[0][0]]).toEqual({ w: 1600, h: 1200, d: { w: 1024, h: 768 } });
  });

  it('sends the thumbnail beside it too and records its size (2026-10-30)', async () => {
    ready.display = true;
    ready.thumb = true;
    const { attach, changed, meta } = harness();
    await attach([file('big.jpg', 'image/jpeg')]);
    expect(uploads.asked).toEqual([[{ type: 'image/webp', display: true, thumb: true }]]);
    expect(uploads.puts).toEqual([
      'https://storage/full',
      'https://storage/display',
      'https://storage/thumb',
    ]);
    expect(meta()[changed[0][0]]).toEqual({
      w: 1600,
      h: 1200,
      d: { w: 1024, h: 768 },
      t: { w: 400, h: 300 },
    });
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

/** A draft that holds its photos, as a sheet does, so taking one off is a real change. */
function draftHarness() {
  let api: ReturnType<typeof useMediaAttach> | null = null;
  let current: string[] = [];
  function Draft() {
    const [paths, setPaths] = useState<string[]>([]);
    current = paths;
    api = useMediaAttach(paths, setPaths);
    return null;
  }
  const view = render(<Draft />);
  return {
    view,
    paths: () => current,
    api: () => api!,
    attach: (files: File[]) =>
      act(() => api!.attach(files as unknown as FileList) as Promise<void>),
  };
}

describe('what a draft uploaded is its to clean up (2026-10-30)', () => {
  it('sends the same photo once, picked again while it is on the draft', async () => {
    const draft = draftHarness();
    const photo = file('IMG_0002.jpg', 'image/jpeg', 300);
    await draft.attach([photo]);
    await draft.attach([photo]);
    expect(uploads.asked).toHaveLength(1);
    expect(draft.paths()).toHaveLength(1);
  });

  it('removes a photo taken off at once, and sends it again if picked again', async () => {
    const draft = draftHarness();
    const photo = file('IMG_0003.jpg', 'image/jpeg', 300);
    await draft.attach([photo]);
    const [first] = draft.paths();
    act(() => draft.api().change([]));
    expect(uploads.discarded).toEqual([[first]]);
    await draft.attach([photo]);
    expect(uploads.asked).toHaveLength(2);
    expect(draft.paths()).toEqual([expect.not.stringMatching(first)]);
  });

  it('removes what it uploaded when the sheet closes without dropping', async () => {
    const draft = draftHarness();
    await draft.attach([file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg', 2)]);
    const both = draft.paths();
    draft.view.unmount();
    expect(uploads.discarded).toEqual([both]);
  });

  it('leaves what it handed over to the commit', async () => {
    const draft = draftHarness();
    await draft.attach([file('a.jpg', 'image/jpeg')]);
    const handed = draft.api().keep(draft.paths());
    expect(handed).toEqual(draft.paths());
    draft.view.unmount();
    expect(uploads.discarded).toEqual([]);
  });

  it('removes them when the commit is refused, and only then', async () => {
    const refused = discardingOnRefusal(async () => ({ ok: false }), ['u1/x.webp']);
    await refused();
    expect(uploads.discarded).toEqual([['u1/x.webp']]);
    const landed = discardingOnRefusal(async () => ({ ok: true }), ['u1/y.webp']);
    await landed();
    expect(uploads.discarded).toEqual([['u1/x.webp']]);
  });
});
