'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { initialsOf } from '@/features/home/grid';
import { Avatar } from '@/features/people/avatar';
import { PoolSheet, SheetTitle } from '@/features/pool/sheet';
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
 */
export function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { unread, setUnread } = useNotifications();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadNotifications()
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        setUnread(rows.filter((n) => !n.read).length);
      })
      .catch(() => live && setMessage('Notifications could not be loaded. Try again.'));
    return () => {
      live = false;
    };
  }, [setUnread]);

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
    router.push(notificationPath(item));
  }

  const anyUnread = (items ?? []).some((n) => !n.read);

  return (
    <PoolSheet label="Notifications" onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <SheetTitle>Notifications</SheetTitle>
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
      </div>
      {message ? (
        <p role="alert" className="text-pool-500 mb-3 text-sm">
          {message}
        </p>
      ) : null}
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

/** "now", "5m", "3h", "2d", then the date: enough to place it, no more. */
function when(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
