'use client';

import { LayerButtons } from './board-handles';
import type { LayerControls } from './stacking';

/**
 * The layer moves at the top of More (review): on a phone the toolbar
 * leaves them here; white on the water, 44px each.
 */
export function LayerSection({ layers }: { layers: LayerControls }) {
  return (
    <div data-layout-layers role="group" aria-label="Layer" className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold">Layer</h3>
      <div className="flex items-center gap-1">
        <LayerButtons
          layers={layers}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 disabled:opacity-20"
        />
      </div>
    </div>
  );
}
