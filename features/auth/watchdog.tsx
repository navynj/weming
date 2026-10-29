'use client';

import { useEffect, useRef } from 'react';

import { sentryOptions } from '@/lib/observability';
import { BEAT_MS, type WatchdogMessage } from '@/lib/watchdog';

import { useNavigationTrail } from './navigation-trail';

/**
 * The page's side of the watchdog (lib/watchdog.ts): a heartbeat every
 * second to a worker, which reports a stuck main thread to Sentry itself.
 * Each beat carries where I am and where I came from, as route patterns,
 * and a navigation beats at once, so a stall right after one is reported
 * where it happened. A hidden page's timers are throttled, so it tells the
 * worker to stop expecting beats until it is shown again.
 */
export function Watchdog() {
  const beat = useRef<() => void>(() => {});
  const trail = useNavigationTrail(() => beat.current());

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = new Worker(new URL('../../lib/watchdog.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      return;
    }
    const post = (message: WatchdogMessage): void => worker.postMessage(message);
    const options = sentryOptions(
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    );
    post({
      type: 'start',
      dsn: options.enabled ? options.dsn : null,
      environment: options.environment,
      release: options.release ?? null,
    });
    beat.current = (): void => {
      const { route, from, at } = trail.current;
      post({ type: 'beat', route, from, navigatedAt: at });
    };
    beat.current();
    const timer = setInterval(() => beat.current(), BEAT_MS);
    const onVisibility = (): void => {
      post({ type: document.visibilityState === 'hidden' ? 'hidden' : 'visible' });
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      beat.current = () => {};
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      worker.terminate();
    };
  }, [trail]);
  return null;
}
