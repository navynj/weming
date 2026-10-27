// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploads = vi.hoisted(() => ({
  keys: [] as string[],
  error: null as null | { message: string; statusCode?: string },
}));
vi.mock('@/lib/downscale', async (actual) => ({
  ...(await actual<typeof import('@/lib/downscale')>()),
  // As outside Safari: nothing decodes, so every file comes back as it was.
  downscale: (file: File) => Promise.resolve(file),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    storage: {
      from: () => ({
        upload: (key: string) => {
          uploads.keys.push(key);
          return Promise.resolve({ error: uploads.error });
        },
      }),
    },
  }),
}));

import { mediaKey, uploadFailure, useMediaAttach } from '@/features/input-sheet/media-field';

afterEach(cleanup);
beforeEach(() => {
  uploads.keys.length = 0;
  uploads.error = null;
  URL.createObjectURL = () => 'blob:preview';
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
  return { view, changed, attach };
}
const file = (name: string, type: string) => new File(['x'], name, { type });

describe('attaching a photo (review: a friend could not)', () => {
  it('stores it under a fresh id and its type, never its own name', async () => {
    const { attach, changed } = harness();
    await attach([file('카카오톡_20261027_사진.jpg', 'image/jpeg')]);
    expect(uploads.keys).toHaveLength(1);
    expect(uploads.keys[0]).toMatch(/^u1\/[0-9a-f-]{36}\.jpg$/);
    expect(changed).toEqual([[uploads.keys[0]]]);
    expect(mediaKey('u1', 'image/png')).toMatch(/\.png$/);
    expect(mediaKey('u1', 'application/x-unknown')).toMatch(/\.img$/);
  });

  it('refuses a HEIC the browser cannot read, saying why, and still adds the rest', async () => {
    const { attach, changed, view } = harness();
    await attach([file('IMG_0001.HEIC', 'image/heic'), file('screen.png', 'image/png')]);
    expect(uploads.keys).toHaveLength(1);
    expect(changed).toEqual([[uploads.keys[0]]]);
    await waitFor(() =>
      expect(view.container.querySelector('[data-failed]')!.textContent).toContain(
        'IMG_0001.HEIC: this browser cannot read HEIC photos',
      ),
    );
  });

  it('never fails silently: a refused upload names the file and the reason', async () => {
    uploads.error = { message: 'Payload too large', statusCode: '413' };
    const { attach, changed, view } = harness();
    await attach([file('big.jpg', 'image/jpeg')]);
    expect(changed).toEqual([]);
    expect(view.container.querySelector('[data-failed]')!.textContent).toBe(
      'big.jpg: it is too large to upload (50MB at most).',
    );
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
});
