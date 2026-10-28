'use client';

import type { ReactNode } from 'react';

import { SheetFrame } from '@/features/splash-sheet/sheet-frame';

/**
 * A pool's bottom sheet (H23): white, rising over the dimmed water, as the
 * post sheet does. The switcher, the members, leaving, the invite link and
 * the pool's lanes all use it. Sized as every bottom sheet is: never the
 * whole screen, shrinking with the keyboard (sheet-frame).
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
    <SheetFrame
      label={label}
      onClose={onClose}
      data={{ 'data-pool-sheet': label }}
      className="surface"
      bodyClassName="px-6 pt-7"
    >
      {children}
    </SheetFrame>
  );
}

/** A sheet's heading: what it is, in blue. */
export function SheetTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-main-900 mb-5 text-xl font-semibold">{children}</h2>;
}
