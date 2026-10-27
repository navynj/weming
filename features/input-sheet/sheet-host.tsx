'use client';

import { usePathname, useRouter } from 'next/navigation';

import {
  SplashSheet,
  type DropHandoff,
  type SheetContext,
} from '@/features/splash-sheet/splash-sheet';

import { SplashEditSheet } from '@/features/splash-sheet/splash-edit-sheet';

import { useInputSheet } from './sheet-provider';

/**
 * A drop, handed over (CLAUDE.md, the principle): the ground marks the post
 * and lands its card on the stack with the ripple at once, the view returns
 * to Home if it was elsewhere, and the action runs behind it; a refusal
 * takes the post back and says why.
 */
function useDrop(): (drop: DropHandoff) => void {
  const { markDropped, dropFailed } = useInputSheet();
  const router = useRouter();
  const pathname = usePathname();
  return (drop) => {
    markDropped({
      splash: drop.splash,
      month: drop.month,
      note: drop.note,
      pool: drop.pool,
      home: drop.home,
    });
    // Dropped from a pool, the pool seats it where we are (H23); else Home.
    if (!drop.pool && !pathname.startsWith('/pool/') && pathname !== '/') router.push('/');
    void drop.commit().then((result) => {
      if (!result.ok) dropFailed(result.message);
      else router.refresh();
    });
  };
}

/**
 * Mounts the post sheet when the provider says it is open: the way in from
 * Home's drop bar (H22), at every width. Lives in the shell, so a page
 * opening it from anywhere reaches the same sheet.
 */
export function SheetHost({ context }: { context: SheetContext }) {
  const { sheet, closeSheet } = useInputSheet();
  const drop = useDrop();

  if (!sheet) return null;
  if (sheet.kind === 'edit') {
    return (
      <SplashEditSheet
        splashId={sheet.splashId}
        context={context}
        pool={sheet.pool ?? null}
        onClose={closeSheet}
      />
    );
  }

  return (
    <SplashSheet
      context={context}
      pool={sheet.pool}
      onClose={closeSheet}
      onDrop={(handoff) => {
        closeSheet();
        drop(handoff);
      }}
    />
  );
}
