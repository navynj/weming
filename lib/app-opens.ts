import { isUuid } from '@/lib/short-id';

/**
 * An app open's facts (H71): where it came from and on what. Nothing here
 * reads or carries what anyone wrote; the user agent is reduced to one of
 * six words and never sent.
 */
export type OpenSource = 'notification' | 'direct';

export type Platform =
  'ios-pwa' | 'ios-web' | 'android-pwa' | 'android-web' | 'desktop-pwa' | 'desktop-web';

/** Away this long, coming back to the front is a new open. */
export const AWAY_MS = 30 * 60 * 1000;

/**
 * A push's link, marked as a push's (`?src=notif&nid=<id>`), the hash kept
 * last so the record still scrolls to its block or reply.
 */
export function withOpenMarker(path: string, notificationId: string): string {
  const hashAt = path.indexOf('#');
  const base = hashAt < 0 ? path : path.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : path.slice(hashAt);
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}src=notif&nid=${encodeURIComponent(notificationId)}${hash}`;
}

/**
 * A path with the marker taken out, and the notification it named. A
 * marker without a well-formed id is still taken out, and names nothing.
 */
export function takeOpenMarker(path: string): { path: string; notificationId: string | null } {
  const url = new URL(path, 'http://weming.invalid');
  if (url.searchParams.get('src') !== 'notif') return { path, notificationId: null };
  const nid = url.searchParams.get('nid');
  url.searchParams.delete('src');
  url.searchParams.delete('nid');
  return {
    path: url.pathname + url.search + url.hash,
    notificationId: nid && isUuid(nid) ? nid : null,
  };
}

/** iPadOS asks as a Mac; its touch points give it away. */
export function platformOf(device: {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}): Platform {
  const ua = device.userAgent;
  const os =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && device.maxTouchPoints > 1)
      ? 'ios'
      : /Android/.test(ua)
        ? 'android'
        : 'desktop';
  return `${os}-${device.standalone ? 'pwa' : 'web'}`;
}
