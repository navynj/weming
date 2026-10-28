'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { TurnOnNotifications } from '@/features/install/turn-on';
import {
  effectiveValue,
  NOTIFICATION_TYPES,
  TYPE_LABELS,
  VALUE_LABELS,
  VALUES,
} from '@/lib/notifications/model';
import type { PoolNotificationPrefs, ValuesByType } from '@/lib/queries/notifications';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { setMyNotificationPref } from './actions';
import { GlobalNotificationSwitches } from './notification-settings';
import { Chip, Row } from './pool-notifications';
import { WELCOME } from './welcome';

/**
 * Get notified (review): once, on the first screen after joining or opening
 * a pool — the three types as they stand for me in it, each changed in
 * place — or on Home after a first sign-in with no pools, with only the
 * switches that hold everywhere. Then one button that does what this device
 * needs. Not now takes the card away and leaves every setting as it is. A
 * card over the water, not a sheet: the place behind it stays in view.
 */
export function NotifyCard({
  pool = null,
}: {
  pool?: { id: string; name: string; prefs: PoolNotificationPrefs } | null;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [closed, setClosed] = useState(false);
  if (closed || params.get(WELCOME) === null) return null;

  const close = (): void => {
    setClosed(true);
    // Off the URL without a round trip, so a reload does not bring it back.
    const rest = new URLSearchParams(params);
    rest.delete(WELCOME);
    window.history.replaceState(null, '', rest.size ? `${pathname}?${rest}` : pathname);
  };

  return (
    <aside
      role="dialog"
      aria-label="Get notified"
      data-notify-card={pool ? 'pool' : 'home'}
      className="surface text-ink fixed inset-x-4 z-30 mx-auto flex max-h-[70dvh] max-w-md flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-5 shadow-lg"
      // At the top: the stack and the strip stay in reach beneath it, and a
      // new pool's photo retry keeps the foot to itself.
      style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-main-900 text-lg font-semibold">Get notified</h2>
        <p className="text-pool-500 text-xs">
          {pool
            ? `What ${pool.name} tells you. Change it any time in the Pool’s settings.`
            : 'Change these any time in your settings.'}
        </p>
      </div>
      {pool ? <PoolTypes poolId={pool.id} prefs={pool.prefs} /> : <GlobalNotificationSwitches />}
      <TurnOnNotifications />
      <button
        type="button"
        data-notify-not-now
        onClick={close}
        className="text-pool-500 self-center text-sm"
      >
        Not now
      </button>
    </aside>
  );
}

/** The three types, each at its effective value for me here (H32), set as mine when picked. */
function PoolTypes({ poolId, prefs }: { poolId: string; prefs: PoolNotificationPrefs }) {
  const mine = useOptimisticAction<ValuesByType>(prefs.mine);
  return (
    <div className="flex flex-col gap-3">
      {prefs.paused ? (
        <p data-notifications-paused className="text-pool-500 text-xs">
          Paused in your settings: nothing arrives until you turn it back on.
        </p>
      ) : null}
      {NOTIFICATION_TYPES.map((type) => {
        const now = effectiveValue(type, {
          paused: prefs.paused,
          personal: mine.value[type] ?? null,
          poolDefault: prefs.poolDefaults[type] ?? null,
        });
        return (
          <Row key={type} label={TYPE_LABELS[type]}>
            {VALUES[type].map((value) => (
              <Chip
                key={value}
                on={now === value}
                data={`card-${type}-${value}`}
                onClick={() =>
                  mine.run(
                    (current) => ({ ...current, [type]: value }),
                    () => setMyNotificationPref({ poolId, type, value }),
                    'Saved',
                  )
                }
              >
                {VALUE_LABELS[value]}
              </Chip>
            ))}
          </Row>
        );
      })}
      {mine.message ? (
        <p role="alert" className="text-pool-500 text-xs">
          {mine.message}
        </p>
      ) : null}
    </div>
  );
}
