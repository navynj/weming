'use client';

import type { ReactNode } from 'react';

import { UnderlineTabs } from '@/components/ui/underline-tabs';
import { SplashModal } from '@/features/splash/splash-modal';

import { useSettings } from './use-settings';

export type SettingsTab = { key: string; label: string; render: () => ReactNode };

/**
 * Settings (0059), a bottom sheet over the place it is opened from, as a
 * splash's detail is (its size, its drag, back to close): Home's tabs, Home
 * and Theme; a pool's, Pool, Theme and Advanced. Its heading and tabs stay
 * pinned; a tab draws at once from what the place already holds.
 */
export function SettingsSheet({
  title,
  tabs,
  signOut = false,
}: {
  title: string;
  tabs: SettingsTab[];
  /** A small "Log out" at the heading's right end (a pool's settings). */
  signOut?: boolean;
}) {
  const { tab, select, close } = useSettings();
  if (!tab) return null;
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  return (
    <SplashModal closeTo={null} onLeave={close} fit>
      <div
        data-splash-side
        data-settings-sheet={current.key}
        className="flex flex-col gap-3 pt-2 pb-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-main-900 text-2xl font-semibold">{title}</h2>
          {signOut ? (
            // A plain form post: the route signs out and sends me to sign in.
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                data-sign-out
                className="text-pool-500 px-1 py-1 text-xs font-medium"
              >
                Log out
              </button>
            </form>
          ) : null}
        </div>
        <UnderlineTabs
          tabs={tabs}
          current={current.key}
          onSelect={select}
          label="Settings"
          data="settings-tab"
        />
      </div>
      <div role="tabpanel" data-settings-panel={current.key} className="flex flex-col pb-10">
        {current.render()}
      </div>
    </SplashModal>
  );
}
