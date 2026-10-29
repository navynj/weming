'use client';

import { useState } from 'react';

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
import { UnderlineTabs } from '@/components/ui/underline-tabs';
import { useOptimisticAction, type ActionOutcome } from '@/lib/use-optimistic-action';

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
  title = 'Notifications',
  mineOnly = false,
}: {
  poolId: string;
  isCreator: boolean;
  prefs: PoolNotificationPrefs;
  /** The group's heading; none where a tab already names the pool (H42h). */
  title?: string | null;
  /** Home's list (0059): my notifications per pool, without the members' defaults. */
  mineOnly?: boolean;
}) {
  // The sheet reads prefs once, as it opens, and no page render brings them
  // again: what a save made true is held here, set inside the save's own
  // transition, so the pick never falls back to what was read (2026-10-29).
  const [savedDefaults, setSavedDefaults] = useState(prefs.poolDefaults);
  const [savedMine, setSavedMine] = useState(prefs.mine);
  const defaults = useOptimisticAction<ValuesByType>(savedDefaults);
  const [group, setGroup] = useState<'mine' | 'defaults'>('mine');
  const mine = useOptimisticAction<ValuesByType>(savedMine);
  const setMine = (
    update: (current: ValuesByType) => ValuesByType,
    type: NotificationType,
    value: NotificationValue | null,
  ): void =>
    mine.run(
      update,
      held(setSavedMine, update, () => setMyNotificationPref({ poolId, type, value })),
      'Saved',
    );
  const poolValue = (type: NotificationType): NotificationValue =>
    defaults.value[type] ?? APP_DEFAULTS[type];

  return (
    <section data-settings-notifications={poolId} className={title === null ? 'mt-4' : 'mt-8'}>
      {title === null ? null : <h2 className="text-ink mb-1 font-semibold">{title}</h2>}

      {/* Mine and the members' defaults, one at a time (review); Home's list has mine alone. */}
      {mineOnly ? (
        <h3 className="text-ink mt-5 text-sm font-medium">Your notifications</h3>
      ) : (
        <div className="mt-3">
          <UnderlineTabs
            tabs={GROUPS}
            current={group}
            onSelect={setGroup}
            label="Notifications"
            data="notification-group"
          />
        </div>
      )}
      {mineOnly || group === 'mine' ? (
        <>
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
                  onClick={() => setMine((current) => without(current, type), type, null)}
                >
                  Pool default ({VALUE_LABELS[poolValue(type)]})
                </Chip>
                {VALUES[type].map((value) => (
                  <Chip
                    key={value}
                    on={mine.value[type] === value}
                    data={`mine-${type}-${value}`}
                    onClick={() =>
                      setMine((current) => ({ ...current, [type]: value }), type, value)
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
        </>
      ) : null}

      {mineOnly || group !== 'defaults' ? null : (
        <>
          <p className="text-pool-500 mt-3 text-xs">
            {isCreator
              ? 'What everyone here gets until they choose their own.'
              : 'Set by the Pool’s owner; what you get until you choose your own.'}
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
                      onClick={() => {
                        const update = (current: ValuesByType): ValuesByType => ({
                          ...current,
                          [type]: value,
                        });
                        defaults.run(
                          update,
                          held(setSavedDefaults, update, () =>
                            setPoolNotificationDefault({ poolId, type, value }),
                          ),
                          'Saved',
                        );
                      }}
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
        </>
      )}
    </section>
  );
}

const GROUPS = [
  { key: 'mine', label: 'Your notifications' },
  { key: 'defaults', label: 'Defaults for members' },
] as const;

/** The save, then what it made true kept as the saved state, in the same transition. */
function held(
  keep: (update: (current: ValuesByType) => ValuesByType) => void,
  update: (current: ValuesByType) => ValuesByType,
  work: () => Promise<ActionOutcome>,
): () => Promise<ActionOutcome> {
  return async () => {
    const outcome = await work();
    if (outcome.ok) keep(update);
    return outcome;
  };
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
