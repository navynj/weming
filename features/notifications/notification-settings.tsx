'use client';

import { useEffect, useState } from 'react';

import { PushSetup } from '@/features/install/push-setup';
import { Switch } from '@/features/pool/lane-match';
import type { NotificationSettings as Settings } from '@/lib/queries/notifications';

import { loadNotificationSettings, setNotificationSettings } from './actions';

/**
 * Settings → Notifications (H32): Pause all notifications, which overrides
 * every pool; Show titles in notifications, off, so the lock screen says
 * only who and where; and this device's install and permission. Each switch
 * shows at once and saves behind it; a refusal puts it back and says why.
 */
export function NotificationSettings() {
  return (
    <section data-notification-settings className="flex w-full flex-col gap-4">
      <h2 className="text-ink font-semibold">Notifications</h2>
      <GlobalNotificationSwitches />
      <PushSetup />
    </section>
  );
}

/** The two switches that hold across every pool, loaded and saved on their own. */
export function GlobalNotificationSwitches() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadNotificationSettings()
      .then((loaded) => live && setSettings(loaded))
      .catch(() => live && setMessage('Notification settings could not be loaded.'));
    return () => {
      live = false;
    };
  }, []);

  async function change(next: Settings): Promise<void> {
    const before = settings;
    setSettings(next);
    setMessage(null);
    const done = await setNotificationSettings(next);
    if (!done.ok) {
      setSettings(before);
      setMessage(done.message);
    }
  }

  return (
    <>
      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-ink text-sm font-medium">Pause all notifications</span>
          <span className="text-pool-500 text-xs">Nothing arrives from any Pool while on.</span>
        </span>
        <Switch
          on={settings?.paused ?? false}
          disabled={settings === null}
          label="Pause all notifications"
          onChange={(paused) => settings && void change({ ...settings, paused })}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-ink text-sm font-medium">Show titles in notifications</span>
          <span className="text-pool-500 text-xs">
            Off, your lock screen says only who and where.
          </span>
        </span>
        <Switch
          on={settings?.showTitles ?? false}
          disabled={settings === null}
          label="Show titles in notifications"
          onChange={(showTitles) => settings && void change({ ...settings, showTitles })}
        />
      </label>
      {message ? (
        <p role="alert" className="text-pool-500 text-xs">
          {message}
        </p>
      ) : null}
    </>
  );
}
