'use client';

import { useEffect, useState } from 'react';

import { usePushState } from '@/features/install/push-setup';
import { PoolSheet, SheetTitle } from '@/features/pool/sheet';
import type { PoolNotificationPrefs } from '@/lib/queries/notifications';

import { loadMyPoolsNotificationPrefs, loadPoolNotificationPrefs } from './actions';
import { disablePush, pushState } from './push-client';
import { GlobalNotificationSwitches } from './notification-settings';
import { PoolNotifications } from './pool-notifications';

/** Where the bell was opened (0059): a pool, with whether I made it, or Home. */
export type BellPlace = { poolId: string; name: string; isCreator: boolean } | null;

type Loaded =
  | { kind: 'pool'; prefs: PoolNotificationPrefs }
  | { kind: 'home'; pools: { poolId: string; name: string; prefs: PoolNotificationPrefs }[] };

/**
 * Notification settings (0059), from the gear on the bell's sheet: the two
 * that hold everywhere — Pause all, Show titles — then, in a pool, mine
 * there and the defaults for its members (its creator's to set, read-only
 * for the rest); on Home, mine in each pool, one group each. What is not
 * yet read shows as rows to come, never a blank sheet.
 */
export function NotificationSettingsSheet({
  place,
  onClose,
}: {
  place: BellPlace;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const poolId = place?.poolId ?? null;
  useEffect(() => {
    let live = true;
    (poolId
      ? loadPoolNotificationPrefs(poolId).then((prefs) => ({ kind: 'pool' as const, prefs }))
      : loadMyPoolsNotificationPrefs().then((pools) => ({ kind: 'home' as const, pools }))
    )
      .then((next) => live && setLoaded(next))
      .catch(() => live && setFailed('Notification settings could not be loaded.'));
    return () => {
      live = false;
    };
  }, [poolId]);

  return (
    <PoolSheet label="Notification settings" onClose={onClose}>
      <SheetTitle>Notification settings</SheetTitle>
      <section data-notification-settings className="flex flex-col gap-4">
        <GlobalNotificationSwitches />
      </section>
      {failed ? (
        <p role="alert" className="text-pool-500 mt-6 text-sm">
          {failed}
        </p>
      ) : loaded === null ? (
        <PendingRows />
      ) : loaded.kind === 'pool' && place ? (
        <PoolNotifications
          poolId={place.poolId}
          isCreator={place.isCreator}
          prefs={loaded.prefs}
          title={`In ${place.name}`}
        />
      ) : loaded.kind === 'home' ? (
        loaded.pools.length === 0 ? (
          <p className="text-pool-500 mt-6 text-sm">You are in no Pool yet.</p>
        ) : (
          loaded.pools.map((pool) => (
            <PoolNotifications
              key={pool.poolId}
              poolId={pool.poolId}
              isCreator={false}
              prefs={pool.prefs}
              title={pool.name}
              mineOnly
            />
          ))
        )
      ) : null}
      <DeviceOff />
    </PoolSheet>
  );
}

/**
 * At the very bottom, after a rule (review): this device's notifications
 * turned off — its subscription gone — only while they are on. Leave
 * Pool's quiet words: a step away, not an action to reach for.
 */
function DeviceOff() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (state !== 'on') return null;
  return (
    <section className="border-pool-100 mt-12 flex flex-col border-t pt-6">
      <button
        type="button"
        data-device-notifications-off
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setMessage(await disablePush());
            setState(await pushState());
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'That didn’t work. Try again.');
          } finally {
            setBusy(false);
          }
        }}
        className="text-pool-500 self-start py-2 text-sm disabled:opacity-40"
      >
        Turn off notifications on this device
      </button>
      {message ? (
        <p role="alert" className="text-pool-500 text-xs">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/** The rows to come, in their places: still, as nothing in the water moves unless it lives. */
function PendingRows() {
  return (
    <div data-notification-settings-pending aria-busy className="mt-8 flex flex-col gap-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <span className="bg-pool-100 h-3 w-24 rounded-full" />
          <span className="flex gap-2">
            <span className="bg-pool-100 h-7 w-16 rounded-full" />
            <span className="bg-pool-100 h-7 w-16 rounded-full" />
          </span>
        </div>
      ))}
    </div>
  );
}
