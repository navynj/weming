'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  disablePush,
  enablePush,
  isStandalone,
  pushState,
  type PushState,
} from '@/features/notifications/push-client';

import { canPromptInstall, promptInstall, subscribeInstall } from './install-state';

/** Chromium's install prompt, as it comes and goes. */
export function useCanPromptInstall(): boolean {
  return useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
}

/** This device's push state, read once mounted; null until then. */
export function usePushState(): [PushState | null, (next: PushState | null) => void] {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    let live = true;
    pushState()
      .then((next) => live && setState(next))
      .catch(() => live && setState('unsupported'));
    return () => {
      live = false;
    };
  }, []);
  return [state, setState];
}

/** Whether the offer has anything to do on this device. */
export function hasOffer(state: PushState | null, canPrompt: boolean): boolean {
  return (canPrompt && !isStandalone()) || state === 'needs-install' || state === 'off';
}

/**
 * Install and notifications for this device (H32): our own *Install Weming*
 * where Chromium offers it, the Add to Home Screen steps on iOS Safari, and
 * a button that asks for permission — never asked otherwise.
 */
export function PushSetup() {
  const canPrompt = useCanPromptInstall();
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(work: () => Promise<string | null>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await work());
      setState(await pushState());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-push-setup className="flex w-full flex-col gap-3">
      {canPrompt && !isStandalone() ? (
        <button
          type="button"
          data-install-app
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await promptInstall();
              return null;
            })
          }
          className="bg-main-900 rounded-full py-2.5 text-base font-semibold text-white disabled:opacity-40"
        >
          Install Weming
        </button>
      ) : null}

      {state === 'needs-install' ? (
        <div data-ios-install-guide className="text-ink flex flex-col gap-2 text-sm">
          <p>To get notifications on iPhone, add Weming to your Home Screen:</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            <li>
              Tap <span className="font-semibold">Share</span> in Safari’s toolbar.
            </li>
            <li>
              Choose <span className="font-semibold">Add to Home Screen</span>.
            </li>
            <li>Open Weming from your Home Screen and turn notifications on here.</li>
          </ol>
        </div>
      ) : null}

      {state === 'off' ? (
        <button
          type="button"
          data-enable-push
          disabled={busy}
          onClick={() => void run(enablePush)}
          className="bg-main-900 rounded-full py-2.5 text-base font-semibold text-white disabled:opacity-40"
        >
          Turn on notifications
        </button>
      ) : null}

      {state === 'on' ? (
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-ink">Notifications are on for this device.</span>
          <button
            type="button"
            data-disable-push
            disabled={busy}
            onClick={() => void run(disablePush)}
            className="text-pool-500 shrink-0"
          >
            Turn off
          </button>
        </div>
      ) : null}

      {state === 'blocked' ? (
        <p className="text-pool-500 text-sm">
          Notifications are blocked for Weming in this browser’s settings.
        </p>
      ) : null}

      {state === 'unsupported' ? (
        <p className="text-pool-500 text-sm">
          This browser can’t show notifications. The bell still collects them.
        </p>
      ) : null}

      {message ? (
        <p role="alert" className="text-pool-500 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
