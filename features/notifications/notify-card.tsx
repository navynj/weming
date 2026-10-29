'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { usePushState } from '@/features/install/push-setup';
import { TurnOnNotifications } from '@/features/install/turn-on';

import { WELCOME } from './welcome';

/**
 * Get notified (review), once: a small popup on the first screen after
 * joining or opening a pool, and on Home after a first sign-in with no
 * pools — one button that does what this device needs, nothing to set.
 * Yoonji, in the session: "onboarding is too complex: just a popup with
 * one Turn on notifications button; no full onboarding, the defaults
 * apply." What arrives is each pool's default (H32), changed later in its
 * settings; the bell's sheet offers the same button whenever they are off.
 * Not now closes it and takes the flag off the URL.
 *
 * Not shown at all when this device's notifications are already on (Yoonji,
 * in the session): it would only say so. Read once, as it would open; turned
 * on from the card, it stays to say they are on.
 */
export function NotifyCard() {
  const params = useSearchParams();
  const pathname = usePathname();
  const [closed, setClosed] = useState(false);
  const [push] = usePushState();
  const welcome = params.get(WELCOME) !== null;

  const dropFlag = (): void => {
    // Off the URL without a round trip, so a reload does not bring it back.
    const rest = new URLSearchParams(params);
    rest.delete(WELCOME);
    window.history.replaceState(null, '', rest.size ? `${pathname}?${rest}` : pathname);
  };
  // Already on: nothing to offer, and nothing to bring back on a reload.
  useEffect(() => {
    if (welcome && push === 'on') dropFlag();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the state is known
  }, [welcome, push]);

  // Nothing until this device's state is known, so it never flashes up.
  if (closed || !welcome || push === null || push === 'on') return null;

  const close = (): void => {
    setClosed(true);
    dropFlag();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="bg-main-900/60 scrim-in absolute inset-0"
      />
      <section
        role="dialog"
        aria-label="Get notified"
        data-notify-card
        className="surface text-ink relative flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-main-900 text-lg font-semibold">Get notified</h2>
          <p className="text-pool-500 text-sm">
            Hear when someone invites you to add your side, or replies to you.
          </p>
        </div>
        <TurnOnNotifications />
        <button
          type="button"
          data-notify-not-now
          onClick={close}
          className="text-pool-500 self-center text-sm"
        >
          Not now
        </button>
      </section>
    </div>
  );
}
