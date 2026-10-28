'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { InstallOffer } from '@/features/install/install-offer';
import { useSplashOpening } from '@/features/splash/opening-context';
import { setBadge } from '@/lib/notifications/badge';

import { loadUnreadCount } from './actions';
import { NotificationsSheet } from './notifications-sheet';
import { NotificationSettingsSheet, type BellPlace } from './notification-settings-sheet';
import { resyncPush } from './push-client';

type Notifications = {
  unread: number;
  setUnread: (next: number | ((current: number) => number)) => void;
  /** The bell, from a place (0059): its settings are that place's. */
  open: (place?: BellPlace) => void;
};

const Context = createContext<Notifications>({ unread: 0, setUnread: () => {}, open: () => {} });

/**
 * The bell's state (H32), held once by the shell: the unread count, loaded
 * with the page and re-read whenever the app comes back to the front, and
 * the sheet, opened from any header's bell.
 */
export function NotificationsProvider({
  initialUnread,
  children,
}: {
  initialUnread: number;
  children: ReactNode;
}) {
  const [unread, setUnread] = useState(initialUnread);
  const [loaded, setLoaded] = useState(initialUnread);
  // The list, or its settings from the gear (0059), and where the bell was.
  const [open, setOpen] = useState<'list' | 'settings' | null>(null);
  const [place, setPlace] = useState<BellPlace>(null);
  // A re-read page brings a fresh count.
  if (loaded !== initialUnread) {
    setLoaded(initialUnread);
    setUnread(initialUnread);
  }

  useEffect(() => {
    function refresh(): void {
      if (document.visibilityState !== 'visible') return;
      loadUnreadCount()
        .then(setUnread)
        .catch(() => {});
    }
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  useEffect(() => setBadge(unread), [unread]);

  // A notification clicked while the app is open: the worker focuses this
  // window and says where to go, and the app routes in place (public/sw.js).
  // A record opens as its sheet at once, from what the bell last listed (review).
  const router = useRouter();
  const openings = useSplashOpening();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(event: MessageEvent): void {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (
        data?.type === 'weming:open' &&
        typeof data.url === 'string' &&
        data.url.startsWith('/')
      ) {
        if (openings) openings.open(data.url);
        else router.push(data.url);
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    void resyncPush().catch(() => {});
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [openings, router]);

  return (
    <Context.Provider
      value={{
        unread,
        setUnread,
        open: (at = null) => {
          setPlace(at);
          setOpen('list');
        },
      }}
    >
      {children}
      {open === 'list' ? (
        <NotificationsSheet onClose={() => setOpen(null)} onSettings={() => setOpen('settings')} />
      ) : null}
      {open === 'settings' ? (
        <NotificationSettingsSheet place={place} onClose={() => setOpen(null)} />
      ) : null}
      <InstallOffer />
    </Context.Provider>
  );
}

export function useNotifications(): Notifications {
  return useContext(Context);
}
