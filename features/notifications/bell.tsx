'use client';

import { Bell as BellIcon } from 'lucide-react';

import { UnseenDot } from '@/features/pool/activity';

import type { BellPlace } from './notification-settings-sheet';
import { useNotifications } from './notifications-provider';

/**
 * The bell (H32), in Home's and every pool's header row: white on the
 * water, with the same unread dot as the pools' news.
 */
export function Bell({ place = null }: { place?: BellPlace }) {
  const { unread, open } = useNotifications();
  return (
    <button
      type="button"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      data-notifications-bell
      onClick={() => open(place)}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center text-white"
    >
      <BellIcon aria-hidden size={20} />
      {unread > 0 ? <UnseenDot label="Unread notifications" /> : null}
    </button>
  );
}
