/**
 * The main thread's watchdog (2026-10-29): a worker expects a heartbeat from
 * the page every second; when none comes for STALL_MS, the page is stuck in
 * a loop, which no error handler on the page can report, so the worker
 * reports it itself. Only route patterns and timings leave, never anything
 * anyone wrote (lib/observability.ts): the route is scrubbed on the page
 * before it is handed over.
 */

/** No heartbeat for this long is a stall. */
export const STALL_MS = 5_000;
/** How often the page beats and the worker looks. */
export const BEAT_MS = 1_000;
/**
 * A gap this long between the worker's own looks means the worker was
 * suspended too (a phone asleep, a tab frozen): the silence was not the
 * page's, so the watch starts over. Suspensions last minutes; a busy
 * machine delays a worker's timer by seconds, which must not hide a stall.
 */
const SUSPENDED_MS = 10_000;

/** What the page tells the worker. Routes are patterns (scrubName), never paths. */
export type WatchdogMessage =
  | {
      type: 'start';
      /** Where a stall goes; null on a local run, which only warns. */
      dsn: string | null;
      environment: string;
      release: string | null;
    }
  | { type: 'beat'; route: string; from: string | null; navigatedAt: number | null }
  | { type: 'hidden' }
  | { type: 'visible' };

export type Navigation = { route: string; from: string | null; at: number | null };

export type Watch = {
  lastBeat: number;
  lastLook: number;
  paused: boolean;
  /** Reported for this silence already: one report per stall. */
  reported: boolean;
  navigation: Navigation;
};

export function startWatch(now: number): Watch {
  return {
    lastBeat: now,
    lastLook: now,
    paused: false,
    reported: false,
    navigation: { route: '', from: null, at: null },
  };
}

/** A message from the page, folded into the watch. */
export function hear(watch: Watch, message: WatchdogMessage, now: number): Watch {
  switch (message.type) {
    case 'beat':
      return {
        ...watch,
        lastBeat: now,
        reported: false,
        navigation: { route: message.route, from: message.from, at: message.navigatedAt },
      };
    case 'hidden':
      // A hidden page's timers are throttled: its silence is not a stall.
      return { ...watch, paused: true };
    case 'visible':
      return { ...watch, paused: false, lastBeat: now, reported: false };
    default:
      return watch;
  }
}

/** The worker's look: the watch moved on, and how long the page has been silent if that is a stall to report. */
export function look(watch: Watch, now: number): { watch: Watch; stalledMs: number | null } {
  if (now - watch.lastLook > SUSPENDED_MS) {
    return { watch: { ...watch, lastLook: now, lastBeat: now, reported: false }, stalledMs: null };
  }
  const next = { ...watch, lastLook: now };
  const silent = now - watch.lastBeat;
  if (watch.paused || watch.reported || silent < STALL_MS) return { watch: next, stalledMs: null };
  return { watch: { ...next, reported: true }, stalledMs: silent };
}

type StallEvent = {
  event_id: string;
  timestamp: number;
  platform: 'javascript';
  level: 'error';
  environment: string;
  release?: string;
  transaction: string;
  message: { formatted: string };
  tags: Record<string, string>;
  contexts: { watchdog: Record<string, string | number | null> };
  fingerprint: string[];
};

/** Where I am and where I came from, as patterns, and how long ago I came. */
function whereabouts(navigation: Navigation, now: number): Record<string, string | number | null> {
  return {
    route: navigation.route || 'unknown',
    navigated_from: navigation.from,
    navigated_ms_before: navigation.at === null ? null : Math.max(0, now - navigation.at),
  };
}

/** The Sentry event for a stall: the route, the last navigation and timings, nothing else. */
export function stallEvent(
  navigation: Navigation,
  stalledMs: number,
  now: number,
  eventId: string,
  environment: string,
  release: string | null,
): StallEvent {
  const route = navigation.route || 'unknown';
  return {
    event_id: eventId,
    timestamp: now / 1000,
    platform: 'javascript',
    level: 'error',
    environment,
    ...(release ? { release } : {}),
    transaction: route,
    message: { formatted: `Main thread stalled for ${Math.round(stalledMs / 1000)}s` },
    tags: { watchdog: 'stall', route },
    contexts: { watchdog: { stalled_ms: stalledMs, ...whereabouts(navigation, now) } },
    // One issue per route, however many stalls.
    fingerprint: ['main-thread-stall', route],
  };
}

/** Sentry's envelope endpoint for a DSN (`https://key@host/project`). */
export function envelopeUrl(dsn: string): string {
  const url = new URL(dsn);
  const project = url.pathname.replace(/^\//, '');
  return `${url.protocol}//${url.host}/api/${project}/envelope/?sentry_key=${url.username}&sentry_version=7`;
}

/** The event as an envelope: a header, the item's header, the item. */
export function envelope(dsn: string, event: StallEvent, now: number): string {
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date(now).toISOString(), dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}

/** How long the page area may hold nothing before it is a blank page. */
export const BLANK_MS = 3_000;

/**
 * What was tried for a blank page: a refresh, the first time; the Reload
 * prompt, when the refresh brought nothing back.
 */
export type Recovery = 'refresh' | 'reload';

/**
 * A blank page for Sentry's captureMessage, with the stall's fields: the
 * page answered, but the area under the shell rendered nothing (2026-10-29,
 * e2e/fast-switch.spec.ts).
 */
export function blankReport(
  navigation: Navigation,
  blankMs: number,
  now: number,
  recovery: Recovery,
): {
  message: string;
  tags: Record<string, string>;
  contexts: { watchdog: Record<string, string | number | null> };
  fingerprint: string[];
} {
  const route = navigation.route || 'unknown';
  return {
    message:
      recovery === 'refresh'
        ? `Page rendered nothing for ${Math.round(blankMs / 1000)}s`
        : `Page still rendered nothing after a refresh, ${Math.round(blankMs / 1000)}s`,
    tags: { watchdog: 'blank', route },
    contexts: { watchdog: { blank_ms: blankMs, recovery, ...whereabouts(navigation, now) } },
    // One issue per route and step: how often a refresh is not enough reads apart.
    fingerprint: ['blank-page', recovery, route],
  };
}
