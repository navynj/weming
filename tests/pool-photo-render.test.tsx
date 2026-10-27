// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/new',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
}));
const calls = vi.hoisted(() => ({ uploads: [] as string[], set: [] as [string, boolean][] }));
vi.mock('@/features/pool/actions', () => ({
  createPool: () => Promise.resolve({ ok: true, id: 'p-new' }),
  setPoolPhoto: (id: string, on: boolean) => {
    calls.set.push([id, on]);
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/features/lanes/actions', () => ({ saveLane: () => Promise.resolve({ ok: true }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: (path: string) => {
          calls.uploads.push(path);
          return Promise.resolve({ error: null });
        },
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  }),
}));

import { Monogram } from '@/components/ui/monogram';
import { UNSUPPORTED_PHOTO } from '@/features/people/crop';
import { CreateFlow } from '@/features/pool/create-flow';

/**
 * A pool's photo (0024) in the app: the tile draws it in the monogram's
 * place, a pick is cropped square, a format the browser cannot read says
 * so, and a new pool's photo is saved once the pool exists.
 */
beforeEach(() => {
  calls.uploads.length = 0;
  calls.set.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = (() => ({
    drawImage: () => {},
    imageSmoothingQuality: 'low',
  })) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toBlob = function toBlob(done: BlobCallback, type?: string) {
    done(new Blob(['x'], { type: type ?? 'image/png' }));
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

describe('the pool tile (0024)', () => {
  it('draws the photo in the monogram’s rounded square, the letters without one', () => {
    const { container, rerender } = render(<Monogram name="Sarang" size="nav" photo="https://p" />);
    const img = container.querySelector('img[data-pool-photo]')!;
    expect(img.getAttribute('src')).toBe('https://p');
    expect(img.className).toContain('rounded-lg');
    rerender(<Monogram name="Sarang" size="nav" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('SA');
  });
});

describe('choosing a pool photo (0024)', () => {
  const pick = async (root: HTMLElement, file: File) => {
    await act(async () => {
      fireEvent.change(root.querySelector('[data-pool-photo-input]')!, {
        target: { files: [file] },
      });
    });
  };

  it('says so when the browser cannot read the file (HEIC outside Safari)', async () => {
    HTMLImageElement.prototype.decode = () => Promise.reject(new Error('EncodingError'));
    const { container, findByRole } = render(<CreateFlow />);
    await pick(container, new File(['heic'], 'IMG.HEIC', { type: 'image/heic' }));
    expect((await findByRole('alert')).textContent).toBe(UNSUPPORTED_PHOTO);
  });

  it('crops a pick in a square mask and saves it once the new pool exists', async () => {
    HTMLImageElement.prototype.decode = () => Promise.resolve();
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(600);
    const { container } = render(<CreateFlow />);
    await pick(container, new File(['jpg'], 'pool.jpg', { type: 'image/jpeg' }));
    const frame = container.querySelector('[data-crop-frame]')!;
    // The mask is the pool's rounded square, not a person's circle.
    expect(
      [...frame.querySelectorAll('span')].some((el) => el.className.includes('rounded-[18%]')),
    ).toBe(true);
    fireEvent.change(container.querySelector('[data-pool-name]')!, { target: { value: 'Sarang' } });
    fireEvent.change(container.querySelector('[aria-label="Lane name"]')!, {
      target: { value: 'Trips' },
    });
    fireEvent.click(container.querySelector('[data-save-lane]')!);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-create-step="1"] [data-primary]')!);
    });
    await waitFor(() => expect(calls.set).toEqual([['p-new', true]]));
    // The pool's one file is named by the pool's id.
    expect(calls.uploads).toEqual(['p-new']);
  });
});
