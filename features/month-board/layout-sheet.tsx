'use client';

import { X } from 'lucide-react';

import { LayoutControls, type LayoutControlsProps } from './layout-controls';
import { layoutTitle } from './layout-panel';
import { LayerSection } from './layer-section';
import type { LayerControls } from './stacking';

/**
 * More, on a phone (review, 2026-10-27): every slider the desktop panel
 * holds — offsets, tilts, sizes, text size, the wave, each photo, Reset all,
 * Use pool layout — in a low sheet of the water's own colour with no scrim,
 * so the board above stays in view and moves as a slider does, and its
 * handles move the sliders back.
 */
export function LayoutSheet({
  view,
  onClose,
  layers = null,
  ...controls
}: LayoutControlsProps & {
  view: 'calendar' | 'lane' | 'members';
  onClose: () => void;
  /** The active piece's layer moves, which a phone's toolbar leaves here. */
  layers?: LayerControls | null;
}) {
  return (
    <section
      role="dialog"
      aria-label={layoutTitle(view)}
      data-layout-sheet={controls.card.splash.id}
      className="sheet-rise bg-main-900 fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[50vh] w-full max-w-xl flex-col rounded-t-[24px] text-white shadow-[0_-8px_24px_rgba(0,0,0,0.25)]"
    >
      <header className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold">{layoutTitle(view)}</h2>
        <button
          type="button"
          aria-label="Close"
          data-layout-sheet-close
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full"
        >
          <X aria-hidden size={18} />
        </button>
      </header>
      <div
        data-layout-body
        className="no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto px-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {layers ? <LayerSection layers={layers} /> : null}
        <LayoutControls {...controls} />
      </div>
    </section>
  );
}
