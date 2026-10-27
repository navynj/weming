'use client';

// DORMANT (H20b): no surface reaches this since the Splash pivot. Kept, with
// its tests, for P3's Swim. Do not wire it back in; do not delete it.

import type { RippleWithSplash } from '@/lib/queries/ripples';

/**
 * H10 allows one running timer per author, and the exclusion constraint makes
 * that literal. So a second Timer is not an error to report but a choice to
 * offer, and the resolution is one tap.
 *
 * Verb-phrased, with no noun for what the running record is.
 */
export function RunningTimerNotice({
  running,
  pending,
  onSwap,
  onCancel,
}: {
  running: RippleWithSplash;
  pending: boolean;
  onSwap: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alert" className="bg-pool-100 flex flex-col gap-2 rounded-lg px-3 py-2 text-sm">
      <p className="text-ink">
        <span className="font-medium">{running.note ?? 'A session'}</span> is still running.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onSwap}
          className="text-main-900 font-medium underline-offset-2 hover:underline disabled:opacity-50"
        >
          Stop it and start this one
        </button>
        <button type="button" onClick={onCancel} className="text-pool-500">
          Keep it running
        </button>
      </div>
    </div>
  );
}
