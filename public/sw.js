/*
 * Weming's service worker (H32): Web Push and nothing else. No fetch
 * handler, so nothing is cached and the network is always asked (the
 * manifest's reasoning: a diary that shows a stale day is worse than one
 * that says it cannot reach the network).
 *
 * A push carries { title, body, url, tag, unread }: who and where, never
 * what was written (the server decides the words, lib/notifications).
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** Only a path on this origin opens; anything else opens Home. */
function samePath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

function badge(unread) {
  const nav = self.navigator;
  if (typeof unread !== 'number' || !nav || !nav.setAppBadge) return Promise.resolve();
  return (unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge()).catch(() => {});
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Weming', {
        body: data.body || '',
        tag: data.tag,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: samePath(data.url) },
      }),
      badge(data.unread),
    ]),
  );
});

/**
 * Focus a window that is open and send it there (the app routes in place,
 * so the open record lands over whatever was showing); else open one.
 */
async function open(url) {
  const target = new URL(url, self.location.origin);
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === target.origin);
  if (open) {
    await open.focus();
    open.postMessage({ type: 'weming:open', url: target.pathname + target.hash });
    return;
  }
  await self.clients.openWindow(target.href);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(open(samePath(event.notification.data && event.notification.data.url)));
});
