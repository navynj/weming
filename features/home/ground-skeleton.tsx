'use client';

import { createPortal } from 'react-dom';
import { useLinkStatus } from 'next/link';
import { useParams } from 'next/navigation';

import { GroundFoot } from './ground-foot';
import { LOW_CARD_PX, LOW_STACK_PX } from './stair-board';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';

/**
 * A place not yet loaded (review): the ground's own frame — header, toggle,
 * board, stack, the strip — with the shapes empty, so the switch shows where
 * things will be within a frame instead of a blank or a spinner. Static:
 * nothing in the water moves that is not alive (SPEC 7, law 3). The strip is
 * the real one, so the place being opened is already the marked one.
 */
export function GroundSkeleton({
  here,
  poolId: target,
}: {
  here: 'home' | 'pool';
  /** The pool being opened; a route's loading state reads it from the URL. */
  poolId?: string | null;
}) {
  const params = useParams<{ id?: string }>();
  const poolId = here === 'pool' ? (target ?? params.id ?? null) : null;
  const { openSheet } = useInputSheet();
  // A pool's composer needs its lanes, which have not arrived; Home's needs nothing more.
  const compose = (): void => {
    if (here === 'home') openSheet();
  };

  return (
    <div data-board-skeleton={here} aria-busy className="water-ground flex h-dvh min-h-0 flex-col">
      <div
        className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col lg:max-w-7xl lg:flex-row lg:gap-8"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:flex-[2]">
          <div className="flex shrink-0 items-center gap-2 px-4 pt-4">
            <span className="h-10 w-10 shrink-0 rounded-lg bg-white/15" />
            <span className="h-7 w-40 rounded-full bg-white/15" />
          </div>
          <div className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-6">
            <span className="h-9 w-9 shrink-0" />
            <span className="h-9 min-w-0 flex-1 rounded-full bg-white/10" />
            <span className="h-9 w-9 shrink-0" />
          </div>
          <div className="mx-4 mb-4 min-h-0 flex-1 rounded-2xl bg-white/10" />
        </div>

        <div className="flex shrink-0 flex-col lg:min-h-0 lg:min-w-0 lg:flex-1 lg:py-10">
          {/* Both open on the Board view, whose stack is the low one on a phone. */}
          <div
            className="shrink-0 px-4 lg:min-h-0 lg:flex-1 lg:px-0"
            style={{ height: LOW_STACK_PX }}
          >
            <div className="rounded-[22px] bg-white/20" style={{ height: LOW_CARD_PX }} />
          </div>
          <GroundFoot here={here} poolId={poolId} onCompose={compose} />
        </div>

        <GroundFoot slot="wide" here={here} poolId={poolId} onCompose={compose} />
      </div>
    </div>
  );
}

/**
 * Inside a strip place's link (review): while a tap on it waits for the
 * server — a place not prefetched yet — the skeleton covers the screen from
 * the first frame, before any byte arrives. A prefetched place never pends,
 * so a cached switch never flashes it.
 */
export function PendingPlace({ here, poolId }: { here: 'home' | 'pool'; poolId?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(
    // Taps on it stay its own: React would carry them up to the link it came from.
    <div className="fixed inset-0 z-40" onClick={(event) => event.stopPropagation()}>
      <GroundSkeleton here={here} poolId={poolId} />
    </div>,
    document.body,
  );
}
