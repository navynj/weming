'use client';

// DORMANT (H20b): no surface reaches this since the Splash pivot. Kept, with
// its tests, for P3's Swim. Do not wire it back in; do not delete it.

import Link from 'next/link';

import { WaveBundle } from '@/components/ui/waves';
import type { RippleWithSplash } from '@/lib/queries/ripples';

import { ROW_GRID } from './row-grid';
import { StopControl } from './stop-control';

/**
 * H15b: the running record's face on the day. A full-width solid #0507C9 band
 * spanning the whole row — including where the friend rail will sit — because
 * the one record happening right now is the shared time axis made visible.
 *
 * The band itself is perfectly still. Liveness is expressed only by the waves
 * moving inside it: law 3 licenses movement for living things, not for the
 * furniture around them.
 *
 * Dimensions here are eyed from _docs/mockups/now-band.png, not exported:
 * the padding, the badge size and the band's bleed are guesses to adjust.
 */
export function NowBand({
  ripple,
  clock,
  elapsedMinutes,
  startedAt,
  openBreakId,
}: {
  ripple: RippleWithSplash;
  clock: string;
  elapsedMinutes: number;
  startedAt: string;
  openBreakId?: string | null;
}) {
  return (
    // Clear of the rows either side: the band is its own surface, and butted
    // straight against a neighbouring row it read as one continuous block.
    // The rope stops at its edges, which is true — the band interrupts the
    // axis rather than sitting on it.
    <li className="live-surface -mx-6 my-3 px-6 py-3">
      {/* Tapping the band opens the focus screen; the Stop chip below is
          outside this link, so an irreversible write never shares a gesture
          with "look closer" (H15d). */}
      <Link href="/now" className={`${ROW_GRID} items-center`} aria-label="Open this session">
        <time className="text-xs font-light text-white tabular-nums">{clock}</time>

        <span className="flex flex-col items-center">
          <span
            aria-hidden
            className="text-main-900 mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm"
          ></span>
          {/* Same bundle as any timed record; only the ink inverts (H15c). */}
          <WaveBundle durationMinutes={elapsedMinutes} state="active" />
        </span>

        <p className="text-sm text-white">
          {ripple.note}
          {openBreakId ? <span className="block text-xs text-white/70">On a break</span> : null}
        </p>
      </Link>

      <div className="grid grid-cols-[2.25rem_2.75rem_1fr] gap-x-2 pt-2">
        <span aria-hidden />
        <span aria-hidden />
        <span>
          <StopControl
            rippleId={ripple.id}
            since={startedAt}
            initialMinutes={elapsedMinutes}
            tone="on-live"
            openBreakId={openBreakId ?? null}
          />
        </span>
      </div>
    </li>
  );
}
