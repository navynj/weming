/**
 * The app badge carries the unread count where the browser supports it
 * (H32); elsewhere this does nothing. A refusal (no permission, not
 * installed) is not an error worth reporting.
 */
export function setBadge(unread: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const done = unread > 0 ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.();
  done?.catch(() => {});
}
