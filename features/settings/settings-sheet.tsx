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
export function SettingsSheet({ title, tabs }: { title: string; tabs: SettingsTab[] }) {
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
        <h2 className="text-main-900 text-2xl font-semibold">{title}</h2>
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
