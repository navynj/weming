// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  uploads: [] as unknown[],
  set: [] as [string, boolean][],
  /** Each upload takes the next answer: an error message, or null for done. */
  answers: [] as (string | null)[],
  replaced: [] as string[],
  /** What each encode drew from: the image and its source rectangle. */
  draws: [] as unknown[][],
  refreshed: 0,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/new',
  useRouter: () => ({
    push: () => {},
    replace: (to: string) => calls.replaced.push(to),
    back: () => {},
    refresh: () => (calls.refreshed += 1),
  }),
}));
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
        upload: (_path: string, blob: unknown) => {
          calls.uploads.push(blob);
          const message = calls.answers.shift() ?? null;
          return Promise.resolve({ error: message ? { message } : null });
        },
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  }),
}));

import { CreateFlow } from '@/features/pool/create-flow';
import { dropHeldPhoto, PHOTO_FAILED, PhotoRetryToast } from '@/features/pool/photo-retry';
import type { MyCategory } from '@/lib/queries/profile';

/**
 * A new pool's photo that did not upload (review): the pool is still made
 * and opened, its screen says the photo did not upload, "Try again" sends
 * the same crop again, and a second failure points to settings.
 */
const MINE = [{ id: 'c-trips', name: 'Trips', icon: '🏕' }] as unknown as MyCategory[];

beforeEach(() => {
  calls.uploads.length = 0;
  calls.set.length = 0;
  calls.answers.length = 0;
  calls.replaced.length = 0;
  calls.draws.length = 0;
  calls.refreshed = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  HTMLImageElement.prototype.decode = () => Promise.resolve();
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(600);
  HTMLCanvasElement.prototype.getContext = (() => ({
    drawImage: (...args: unknown[]) => calls.draws.push(args),
    imageSmoothingQuality: 'low',
  })) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toBlob = function toBlob(done: BlobCallback, type?: string) {
    done(new Blob(['x'], { type: type ?? 'image/png' }));
  };
});
afterEach(() => {
  cleanup();
  dropHeldPhoto();
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

/** Makes a pool with a cropped photo whose first upload fails, then opens its screen. */
async function createWithFailingPhoto() {
  calls.answers.push('network down');
  const flow = render(<CreateFlow categories={MINE} />);
  const root = flow.container;
  await act(async () => {
    fireEvent.change(root.querySelector('[data-pool-photo-input]')!, {
      target: { files: [new File(['jpg'], 'pool.jpg', { type: 'image/jpeg' })] },
    });
  });
  fireEvent.change(root.querySelector('[data-pool-name]')!, { target: { value: 'Sarang' } });
  fireEvent.change(root.querySelector('[aria-label="Lane name"]')!, {
    target: { value: 'Trips' },
  });
  fireEvent.click(root.querySelector('[data-save-lane]')!);
  await act(async () => {
    fireEvent.click(root.querySelector('[data-create-step="2"] [data-primary]')!);
  });
  // The pool was made and opened all the same; the row never named a photo.
  await waitFor(() => expect(calls.replaced).toEqual(['/pool/p-new']));
  expect(calls.uploads).toHaveLength(1);
  expect(calls.set).toEqual([]);
  flow.unmount();
  return render(<PhotoRetryToast poolId="p-new" />);
}

describe('a new pool’s photo that did not upload (review)', () => {
  it('says so on the new pool, and "Try again" uploads the same crop', async () => {
    const { container, getByRole } = await createWithFailingPhoto();
    expect(getByRole('status').textContent).toContain(PHOTO_FAILED);

    await act(async () => {
      fireEvent.click(container.querySelector('[data-photo-toast-retry]')!);
    });
    await waitFor(() => expect(calls.set).toEqual([['p-new', true]]));
    expect(calls.uploads).toHaveLength(2);
    // The crop still in memory: the same image element, the same rectangle.
    expect(calls.draws).toHaveLength(2);
    expect(calls.draws[1][0]).toBeInstanceOf(HTMLImageElement);
    expect(calls.draws[1][0]).toBe(calls.draws[0][0]);
    expect(calls.draws[1]).toEqual(calls.draws[0]);
    expect(container.querySelector('[data-photo-toast]')).toBeNull();
    expect(calls.refreshed).toBe(1);
  });

  it('points to settings when the retry fails too', async () => {
    const { container, getByRole } = await createWithFailingPhoto();
    calls.answers.push('still down');
    await act(async () => {
      fireEvent.click(container.querySelector('[data-photo-toast-retry]')!);
    });
    await waitFor(() =>
      expect(container.querySelector('[data-photo-toast]')!.getAttribute('data-photo-toast')).toBe(
        'again',
      ),
    );
    expect(calls.uploads).toHaveLength(2);
    expect(calls.set).toEqual([]);
    expect(getByRole('status').textContent).toContain(PHOTO_FAILED);
    expect(container.querySelector('[data-photo-toast-retry]')).toBeNull();
    const link = container.querySelector('a[data-photo-toast-settings]')!;
    expect(link.getAttribute('href')).toBe('/pool/p-new/settings');
    expect(link.textContent).toBe('Open settings');
  });

  it('shows on that pool only', async () => {
    await createWithFailingPhoto();
    cleanup();
    const other = render(<PhotoRetryToast poolId="p-other" />);
    expect(other.container.querySelector('[data-photo-toast]')).toBeNull();
  });
});
