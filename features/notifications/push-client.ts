'use client';

import { removePushSubscription, savePushSubscription } from './actions';

/**
 * Web Push in this browser (H32). Permission is asked only from a button
 * press (`enablePush`); nothing here asks on its own.
 */

const WORKER = '/sw.js';

/** Installed to the home screen (or a desktop app window). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone or iPad, the iPad's desktop user agent included. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export type PushState =
  /** iOS Safari in a tab: push needs Add to Home Screen first. */
  'needs-install' | 'unsupported' | 'off' | 'on' | 'blocked';

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

function applicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function save(subscription: PushSubscription): Promise<string | null> {
  const json = subscription.toJSON();
  const done = await savePushSubscription(
    {
      endpoint: json.endpoint ?? '',
      keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    },
    navigator.userAgent,
  );
  return done.ok ? null : done.message;
}

/** From a button press only: ask, subscribe, and keep it. A message on failure. */
export async function enablePush(): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pushSupported()) return 'This browser can’t show notifications.';
  if (!key) return 'Notifications aren’t set up yet.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied'
      ? 'Notifications are blocked for Weming in this browser’s settings.'
      : null;
  }
  const registration = await navigator.serviceWorker.register(WORKER, { scope: '/' });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(key),
    }));
  return save(subscription);
}

export async function disablePush(): Promise<string | null> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const done = await removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
  return done.ok ? null : done.message;
}

/**
 * Once a load, when permission was given before: keep this browser's
 * subscription with whoever is signed in now, so a second account on the
 * same phone takes it over rather than receiving the first one's.
 */
export async function resyncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await save(subscription);
}
