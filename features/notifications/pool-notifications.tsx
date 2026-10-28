'use client';

import {
  APP_DEFAULTS,
  NOTIFICATION_TYPES,
  TYPE_LABELS,
  VALUE_LABELS,
  VALUES,
  type NotificationType,
  type NotificationValue,
} from '@/lib/notifications/model';
import type { PoolNotificationPrefs, ValuesByType } from '@/lib/queries/notifications';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { setMyNotificationPref, setPoolNotificationDefault } from './actions';

/**
 * Pool settings → Notifications (H32): the creator's *Defaults for members*,
 * then *Your notifications*, each type starting on *Use pool default*. A
 * value I set outlives any later change to the default. Each pick shows at
 * once and saves behind it.
 */
export function PoolNotifications({
  poolId,
  isCreator,
  prefs,
}: {
  poolId: string;
  isCreator: boolean;
  prefs: PoolNotificationPrefs;
}) {
  const defaults = useOptimisticAction<ValuesByType>(prefs.poolDefaults);
  const mine = useOptimisticAction<ValuesByType>(prefs.mine);
  const poolValue = (type: NotificationType): NotificationValue =>
    defaults.value[type] ?? APP_DEFAULTS[type];

  return (
    <section data-settings-notifications className="mt-10">
      <h2 className="text-ink mb-1 font-semibold">Notifications</h2>

      <h3 className="text-ink mt-5 text-sm font-medium">Your notifications</h3>
      {prefs.paused ? (
        <p data-notifications-paused className="text-pool-500 mt-1 text-xs">
          Paused in your settings: nothing arrives until you turn it back on.
        </p>
      ) : null}
      <div className="mt-2 flex flex-col gap-4">
        {NOTIFICATION_TYPES.map((type) => (
          <Row key={type} label={TYPE_LABELS[type]}>
            <Chip
              on={mine.value[type] === undefined}
              data={`mine-${type}-default`}
              onClick={() =>
                mine.run(
                  (current) => without(current, type),
                  () => setMyNotificationPref({ poolId, type, value: null }),
                  'Saved',
                )
              }
            >
              Pool default ({VALUE_LABELS[poolValue(type)]})
            </Chip>
            {VALUES[type].map((value) => (
              <Chip
                key={value}
                on={mine.value[type] === value}
                data={`mine-${type}-${value}`}
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
        ))}
      </div>
      {mine.message ? (
        <p role="alert" className="text-pool-500 mt-2 text-xs">
          {mine.message}
        </p>
      ) : null}

      <h3 className="text-ink mt-8 text-sm font-medium">Defaults for members</h3>
      <p className="text-pool-500 mt-1 text-xs">
        {isCreator
          ? 'What everyone here gets until they choose their own.'
          : 'Set by the Pool’s creator; what you get until you choose your own.'}
      </p>
      <div className="mt-2 flex flex-col gap-4">
        {NOTIFICATION_TYPES.map((type) =>
          isCreator ? (
            <Row key={type} label={TYPE_LABELS[type]}>
              {VALUES[type].map((value) => (
                <Chip
                  key={value}
                  on={poolValue(type) === value}
                  data={`default-${type}-${value}`}
                  onClick={() =>
                    defaults.run(
                      (current) => ({ ...current, [type]: value }),
                      () => setPoolNotificationDefault({ poolId, type, value }),
                      'Saved',
                    )
                  }
                >
                  {VALUE_LABELS[value]}
                </Chip>
              ))}
            </Row>
          ) : (
            <p key={type} data-default={type} className="text-ink flex justify-between text-sm">
              <span>{TYPE_LABELS[type]}</span>
              <span className="text-pool-500">{VALUE_LABELS[poolValue(type)]}</span>
            </p>
          ),
        )}
      </div>
      {defaults.message ? (
        <p role="alert" className="text-pool-500 mt-2 text-xs">
          {defaults.message}
        </p>
      ) : null}
    </section>
  );
}

function without(values: ValuesByType, type: NotificationType): ValuesByType {
  const next = { ...values };
  delete next[type];
  return next;
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className="text-pool-500 text-xs">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Selection is ink (H20f), never blue. */
export function Chip({
  on,
  data,
  onClick,
  children,
}: {
  on: boolean;
  data: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-notification-choice={data}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
        on ? 'bg-ink text-white' : 'border-pool-200 text-pool-500 border'
      }`}
    >
      {children}
    </button>
  );
}
