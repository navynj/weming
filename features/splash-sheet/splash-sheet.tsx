'use client';

import type { PoolScope } from '@/features/pool/compose-scope';

import { SheetFrame } from './sheet-frame';
import { SplashComposer, type DropHandoff, type SheetContext } from './splash-composer';

export type { DropHandoff, SheetContext };

export { SHEET_MAX_HEIGHT } from './sheet-frame';

/**
 * The post sheet (SPEC 6, H21): the composer as a white bottom sheet on the
 * dimmed ground, from the compose disc at every width (review).
 */
export function SplashSheet({
  context,
  onClose,
  onDrop,
  pool = null,
}: {
  context: SheetContext;
  onClose: () => void;
  onDrop: (drop: DropHandoff) => void;
  /** Opened from a pool (H23): that pool is the default. */
  pool?: PoolScope | null;
}) {
  return (
    <SheetFrame label="Drop a splash" onClose={onClose} data={{ 'data-splash-sheet': '' }} footer>
      <SplashComposer context={context} onDrop={onDrop} pool={pool} />
    </SheetFrame>
  );
}
