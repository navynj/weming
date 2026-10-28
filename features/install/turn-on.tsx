'use client';

import { useState } from 'react';

import { enablePush, isStandalone, pushState } from '@/features/notifications/push-client';

import { promptInstall } from './install-state';
import { IosInstallGuide, useCanPromptInstall, usePushState } from './push-setup';

/**
 * One button for whatever this device needs (review): Chromium's install
 * first where it is offered, then permission; on iOS Safari in a tab, the
 * Add to Home Screen steps; elsewhere, permission. Asked only from the
 * press (H32). A permission prompt the browser did not show leaves the
 * button for another press.
 */
export function TurnOnNotifications() {
  const canPrompt = useCanPromptInstall();
  const [state, setState] = usePushState();
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function turnOn(): Promise<void> {
    if (state === 'needs-install') {
      setGuide(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (canPrompt && !isStandalone()) await promptInstall();
      if ((await pushState()) === 'off') setMessage(await enablePush());
      setState(await pushState());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-turn-on className="flex flex-col gap-3">
      {state === 'on' ? (
        <p data-push-on className="text-ink text-sm">
          Notifications are on for this device.
        </p>
      ) : state === 'blocked' ? (
        <p className="text-pool-500 text-sm">
          Notifications are blocked for Weming in this browser’s settings.
        </p>
      ) : state === 'unsupported' ? (
        <p className="text-pool-500 text-sm">
          This browser can’t show notifications. The bell still collects them.
        </p>
      ) : guide ? (
        <IosInstallGuide />
      ) : (
        <button
          type="button"
          data-turn-on-notifications
          disabled={busy || state === null}
          onClick={() => void turnOn()}
          className="bg-main-900 rounded-full py-2.5 text-base font-semibold text-white disabled:opacity-40"
        >
          Turn on notifications
        </button>
      )}
      {message ? (
        <p role="alert" className="text-pool-500 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
