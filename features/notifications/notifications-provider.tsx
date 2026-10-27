'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { InstallOffer } from '@/features/install/install-offer';
import { setBadge } from '@/lib/notifications/badge';

import { loadUnreadCount } from './actions';
import { NotificationsSheet } from './notifications-sheet';
import { resyncPush } from './push-client';

type Notifications = {
  unread: number;
  setUnread: (next: number | ((current: number) => number)) => void;
  open: () => void;
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
  const [open, setOpen] = useState(false);
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
  const router = useRouter();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(event: MessageEvent): void {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (
        data?.type === 'weming:open' &&
        typeof data.url === 'string' &&
        data.url.startsWith('/')
      ) {
        router.push(data.url);
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    void resyncPush().catch(() => {});
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return (
    <Context.Provider value={{ unread, setUnread, open: () => setOpen(true) }}>
      {children}
      {open ? <NotificationsSheet onClose={() => setOpen(false)} /> : null}
      <InstallOffer />
    </Context.Provider>
  );
}

export function useNotifications(): Notifications {
  return useContext(Context);
}
