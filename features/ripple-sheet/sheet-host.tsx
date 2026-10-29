'use client';

// DORMANT (H21): hosts the retired detail sheet for the dormant day rows.
// No page mounts it. Do not wire it back in; do not delete it.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { InputSheet, type SheetContext } from '@/features/input-sheet/input-sheet';
import type { RippleWithSplash } from '@/lib/queries/ripples';

import { DetailSheet } from './detail-sheet';

type Api = { openRipple: (id: string) => void };
const Context = createContext<Api | null>(null);

export function useRippleSheet(): Api {
  const api = useContext(Context);
  // A settled row outside the host is not a bug worth crashing for; it simply
  // does not open.
  return api ?? { openRipple: () => {} };
}

/**
 * Holds the detail sheet, and hands over to the input sheet when Edit is
 * pressed. One editor: Edit is the same sheet in a different mode, not a
 * second place that knows how to describe a Ripple.
 */
export function RippleSheetHost({
  ripples,
  lockedIds,
  sheetContext,
  children,
}: {
  ripples: RippleWithSplash[];
  lockedIds: string[];
  sheetContext: SheetContext;
  children: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const openRipple = useCallback((id: string) => {
    setOpenId(id);
    setEditing(false);
  }, []);
  const api = useMemo(() => ({ openRipple }), [openRipple]);

  const ripple = ripples.find((r) => r.id === openId) ?? null;
  const locked = ripple ? lockedIds.includes(ripple.id) : false;
  const splashTitle = ripple?.splash_id
    ? (sheetContext.splashes.find((s) => s.id === ripple.splash_id)?.title ?? null)
    : null;

  function close(): void {
    setOpenId(null);
    setEditing(false);
  }

  return (
    <Context.Provider value={api}>
      {children}

      {ripple && !editing ? (
        <DetailSheet
          ripple={ripple}
          locked={locked}
          splashTitle={splashTitle}
          timeZone={sheetContext.timeZone}
          today={sheetContext.today}
          onClose={close}
          onEdit={() => setEditing(true)}
        />
      ) : null}

      {ripple && editing ? (
        <InputSheet
          context={sheetContext}
          prefill={{}}
          editing={{ ripple }}
          onClose={close}
          // commitRipple revalidates: the page comes back with its answer.
          onCommitted={close}
        />
      ) : null}
    </Context.Provider>
  );
}
