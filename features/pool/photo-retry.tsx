'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

import { savePoolPhoto, type PoolPhotoChange } from './pool-photo-field';

/**
 * A new pool's photo that did not upload (review): the pool was made, so the
 * create flow goes on to it, and the cropped image stays here in memory — not
 * in browser storage, which cannot hold it — for the pool's screen to offer
 * again. One at a time; a reload lets it go, and settings can still add it.
 */
type Held = { poolId: string; change: PoolPhotoChange };

let held: Held | null = null;
const listeners = new Set<() => void>();

function set(next: Held | null): void {
  held = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The create flow, when the photo failed after the pool was made. */
export function holdFailedPhoto(poolId: string, change: PoolPhotoChange): void {
  set({ poolId, change });
}

/** Lets the held photo go (tests, and the toast's own close). */
export function dropHeldPhoto(): void {
  set(null);
}

export const PHOTO_FAILED = 'The pool was created, but the photo didn’t upload.';

/**
 * The toast on the new pool (review): it says the pool is there without its
 * photo, and "Try again" uploads the same crop again. A second failure
 * leaves the way it can still be done: the pool's settings.
 */
export function PhotoRetryToast({ poolId }: { poolId: string }) {
  const router = useRouter();
  const mine = useSyncExternalStore(
    subscribe,
    () => (held?.poolId === poolId ? held : null),
    () => null,
  );
  const [state, setState] = useState<'failed' | 'retrying' | 'again'>('failed');
  if (!mine) return null;

  async function retry(change: PoolPhotoChange): Promise<void> {
    setState('retrying');
    const failed = await savePoolPhoto(poolId, change);
    if (failed) {
      console.error(`[during] pool photo not saved on retry: ${failed}`);
      setState('again');
      return;
    }
    set(null);
    router.refresh();
  }

  return (
    <div
      role="status"
      data-photo-toast={state}
      className="fixed inset-x-4 z-30 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-white py-3 pr-2 pl-4 shadow-xl lg:bottom-6"
      style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <p className="text-ink min-w-0 flex-1 text-sm">{PHOTO_FAILED}</p>
      {state === 'again' ? (
        <Link
          href={`/pool/${poolId}/settings`}
          data-photo-toast-settings
          onClick={() => set(null)}
          className="text-main-900 shrink-0 text-sm font-semibold"
        >
          Open settings
        </Link>
      ) : (
        <button
          type="button"
          data-photo-toast-retry
          disabled={state === 'retrying'}
          onClick={() => void retry(mine.change)}
          className="text-main-900 shrink-0 text-sm font-semibold disabled:opacity-40"
        >
          {state === 'retrying' ? 'Trying…' : 'Try again'}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => set(null)}
        className="text-pool-500 flex h-8 w-8 shrink-0 items-center justify-center"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}
