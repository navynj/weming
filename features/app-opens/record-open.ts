import { platformOf, type OpenSource } from '@/lib/app-opens';
import { createClient } from '@/lib/supabase/client';

/**
 * Writes one open (H71), and never fails anything: an open that could not
 * be counted is a gap in the dashboard, not an error for the person.
 */
function write(source: OpenSource, notificationId: string | null): void {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  void createClient()
    .rpc('log_app_open', {
      p_source: source,
      p_platform: platformOf({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone,
      }),
      ...(notificationId ? { p_notification: notificationId } : {}),
    })
    .then(
      () => {},
      () => {},
    );
}

/**
 * A tap on a push that finds the app open shows it first, then says where
 * to go (public/sw.js): the return to the front waits this long, so the tap
 * that caused it is counted as the tap, once.
 */
const SETTLE_MS = 1500;
let pendingDirect: ReturnType<typeof setTimeout> | null = null;

/** Back at the front after a long time away. */
export function recordReturn(): void {
  if (pendingDirect) clearTimeout(pendingDirect);
  pendingDirect = setTimeout(() => {
    pendingDirect = null;
    write('direct', null);
  }, SETTLE_MS);
}

/** A load, or a push tapped: the push's when it names one, else direct. */
export function recordOpen(notificationId: string | null): void {
  if (pendingDirect) {
    clearTimeout(pendingDirect);
    pendingDirect = null;
  }
  write(notificationId ? 'notification' : 'direct', notificationId);
}
