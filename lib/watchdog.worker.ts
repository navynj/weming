/// <reference lib="webworker" />

import {
  BEAT_MS,
  envelope,
  envelopeUrl,
  hear,
  look,
  startWatch,
  stallEvent,
  type WatchdogMessage,
} from './watchdog';

/**
 * The watchdog's own thread (lib/watchdog.ts): it keeps looking while the
 * page cannot, and sends a stall to Sentry by itself — the SDK lives on the
 * stuck thread. A local run sends nothing and warns in the console instead.
 */
let watch = startWatch(Date.now());
let config: Extract<WatchdogMessage, { type: 'start' }> | null = null;

self.onmessage = (e: MessageEvent<WatchdogMessage>) => {
  if (e.data.type === 'start') config = e.data;
  watch = hear(watch, e.data, Date.now());
};

setInterval(() => {
  const now = Date.now();
  const looked = look(watch, now);
  watch = looked.watch;
  if (looked.stalledMs === null || config === null) return;
  const event = stallEvent(
    watch.navigation,
    looked.stalledMs,
    now,
    crypto.randomUUID().replace(/-/g, ''),
    config.environment,
    config.release,
  );
  if (config.dsn === null) {
    console.warn(`[watchdog] ${event.message.formatted} at ${event.transaction}`);
    return;
  }
  // text/plain: no preflight, which a page that never answers could not wait on anyway.
  void fetch(envelopeUrl(config.dsn), {
    method: 'POST',
    body: envelope(config.dsn, event, now),
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
  }).catch(() => {
    // Nowhere left to report a failed report.
  });
}, BEAT_MS);
