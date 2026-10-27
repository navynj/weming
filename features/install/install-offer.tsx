'use client';

import { useEffect, useState } from 'react';

import { PoolSheet, SheetTitle } from '@/features/pool/sheet';
import { pushState } from '@/features/notifications/push-client';

import { canPromptInstall, dismissInstall, onOfferInstall } from './install-state';
import { hasOffer, PushSetup } from './push-setup';

/**
 * The offer (H32), raised by `offerInstall()` the first time I'm invited to
 * add my side: shown only when this device has something to do — install,
 * the iOS steps, or permission not yet asked. Closing it, either way, hides
 * it for 14 days.
 */
export function InstallOffer() {
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      onOfferInstall(() => {
        void pushState().then((state) => {
          if (hasOffer(state, canPromptInstall())) setOpen(true);
        });
      }),
    [],
  );

  if (!open) return null;
  const close = () => {
    dismissInstall();
    setOpen(false);
  };
  return (
    <PoolSheet label="Get notified" onClose={close}>
      <SheetTitle>Hear when you’re invited</SheetTitle>
      <p className="text-ink mb-5 text-sm">
        Weming can tell you when someone in your Pools invites you to add your side, or replies to
        you. Only who and where show on your lock screen.
      </p>
      <PushSetup />
      <button
        type="button"
        data-install-not-now
        onClick={close}
        className="text-pool-500 mt-4 self-center text-sm"
      >
        Not now
      </button>
    </PoolSheet>
  );
}
