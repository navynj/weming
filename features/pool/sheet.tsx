'use client';

import type { ReactNode } from 'react';

import { COLUMN_MAX_WIDTH } from '@/components/ui/column';
import { SHEET_MAX_HEIGHT } from '@/features/splash-sheet/splash-sheet';

/**
 * A pool's bottom sheet (H23): white, rising over the dimmed water, as the
 * post sheet does. The switcher, the members, leaving, the invite link and
 * the pool's lanes all use it.
 */
export function PoolSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-main-900/60 scrim-in absolute inset-0"
      />
      <section
        role="dialog"
        aria-label={label}
        data-pool-sheet={label}
        className={`surface sheet-rise relative mx-auto flex w-full ${COLUMN_MAX_WIDTH} ${SHEET_MAX_HEIGHT} flex-col overflow-hidden rounded-t-[32px] bg-white`}
      >
        <div
          className="flex min-h-0 flex-col overflow-y-auto px-6 pt-7"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

/** A sheet's heading: what it is, in blue. */
export function SheetTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-main-900 mb-5 text-xl font-semibold">{children}</h2>;
}
