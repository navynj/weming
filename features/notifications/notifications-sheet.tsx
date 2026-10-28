'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { initialsOf } from '@/features/home/grid';
import { offerInstall } from '@/features/install/install-state';
import { Avatar } from '@/features/people/avatar';
import { TurnOnNotifications } from '@/features/install/turn-on';
import { Settings } from 'lucide-react';

import { PoolSheet, SheetTitle } from '@/features/pool/sheet';
import { useSplashOpening } from '@/features/splash/opening-context';
import { rememberHeader } from '@/features/splash/splash-opening';
import { EMPTY } from '@/lib/empty-states';
import { notificationPath, notificationText } from '@/lib/notifications/model';
import type { NotificationItem } from '@/lib/queries/notifications';

import { loadNotifications, markNotificationsRead } from './actions';
import { useNotifications } from './notifications-provider';

/**
 * The bell's sheet (H32): newest first, each saying who and where; a tap
 * marks it read and opens the record at the reply or block. Marking is
 * optimistic — the dot and the row change at once, and a refusal puts
 * them back. The list is read when the sheet opens, so it is not a page's
 * rows and has no re-read to wait for.
 *
 * A tap opens the record's sheet in the same frame this one goes, with the
 * title and icon the row carries and a skeleton below until the page lands
 * (review); the first unread records are fetched as the list arrives, and any
 * row as it is pressed, so most taps find the page already here.
 */
const PREFETCH_UNREAD = 3;

export function NotificationsSheet({
  onClose,
  onSettings,
}: {
  onClose: () => void;
  /** Its gear (0059): the notification settings, a sheet of their own. */
  onSettings?: () => void;
}) {
  const router = useRouter();
  const openings = useSplashOpening();
  const { unread, setUnread } = useNotifications();
  const prefetched = useRef(new Set<string>());
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadNotifications()
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        setUnread(rows.filter((n) => !n.read).length);
        for (const n of rows) if (n.splashId) rememberHeader(notificationPath(n), headerOf(n));
        rows
          .filter((n) => !n.read)
          .slice(0, PREFETCH_UNREAD)
          .forEach(prefetch);
      })
      .catch(() => live && setMessage('Notifications could not be loaded. Try again.'));
    return () => {
      live = false;
    };
    // Read once, as the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setUnread]);

  function prefetch(item: NotificationItem): void {
    const path = notificationPath(item);
    if (!openings || !item.splashId || prefetched.current.has(path.split('#')[0])) return;
    prefetched.current.add(path.split('#')[0]);
    openings.prefetch(path);
  }

  async function mark(ids: string[] | null): Promise<void> {
    const before = items;
    const beforeUnread = unread;
    setItems((current) =>
      (current ?? []).map((n) => (ids === null || ids.includes(n.id) ? { ...n, read: true } : n)),
    );
    setUnread((count) => (ids === null ? 0 : Math.max(0, count - ids.length)));
    const done = await markNotificationsRead(ids);
    if (!done.ok) {
      setItems(before);
      setUnread(beforeUnread);
      setMessage(done.message);
    }
  }

  function openOne(item: NotificationItem): void {
    if (!item.read) void mark([item.id]);
    onClose();
    // One about the pool itself (0063) opens the pool, not a record's sheet.
    if (openings && item.splashId) openings.open(notificationPath(item), headerOf(item));
    else router.push(notificationPath(item));
    if (item.type === 'new_post' && item.invited) offerInstall();
  }

  const anyUnread = (items ?? []).some((n) => !n.read);

  return (
    <PoolSheet label="Notifications" onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <SheetTitle>Notifications</SheetTitle>
        <span className="flex items-center gap-3">
          {anyUnread ? (
            <button
              type="button"
              data-mark-all-read
              onClick={() => void mark(null)}
              className="text-main-900 text-sm font-medium"
            >
              Mark all read
            </button>
          ) : null}
          {onSettings ? (
            <button
              type="button"
              aria-label="Notification settings"
              data-notification-settings-open
              onClick={onSettings}
              className="text-pool-500 flex h-9 w-9 items-center justify-center"
            >
              <Settings aria-hidden size={18} />
            </button>
          ) : null}
        </span>
      </div>
      {message ? (
        <p role="alert" className="text-pool-500 mb-3 text-sm">
          {message}
        </p>
      ) : null}
      {/* This device's notifications, on or off, here where they are read
          (review): the onboarding card's button, and Turn off once on. */}
      <TurnOnNotifications inSheet />
      {items === null ? (
        <p className="text-pool-500 py-6 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p data-notifications-empty className="text-pool-500 py-6 text-sm">
          {EMPTY.notifications}
        </p>
      ) : (
        <ul className="flex flex-col" data-notifications>
          {items.map((item) => (
            <li key={item.id} className="border-pool-100 border-b last:border-b-0">
              <button
                type="button"
                data-notification={item.id}
                data-unread={item.read ? undefined : ''}
                onPointerDown={() => prefetch(item)}
                onClick={() => openOne(item)}
                className="flex w-full items-start gap-3 py-3 text-left"
              >
                <Avatar
                  id={item.actorId}
                  initials={initialsOf(item.actorName)}
                  className="bg-pool-100 text-pool-500 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`text-ink text-sm ${item.read ? '' : 'font-semibold'}`}>
                    {notificationText({ ...item })}
                  </span>
                  <span className="text-pool-500 text-xs">{when(item.createdAt)}</span>
                </span>
                {item.read ? null : (
                  <span
                    aria-label="Unread"
                    className="bg-main-900 mt-2 h-2 w-2 shrink-0 rounded-full"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PoolSheet>
  );
}

function headerOf(item: NotificationItem): {
  title: string | null;
  icon: string | null;
  poolName: string;
} {
  return { title: item.title, icon: item.icon, poolName: item.poolName };
}

/** "now", "5m", "3h", "2d", then the date: enough to place it, no more. */
function when(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
