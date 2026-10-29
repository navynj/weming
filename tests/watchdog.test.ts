import { describe, expect, it } from 'vitest';

import { SENTRY_DSN, scrubName } from '@/lib/observability';
import {
  BEAT_MS,
  blankReport,
  STALL_MS,
  envelope,
  envelopeUrl,
  hear,
  look,
  startWatch,
  stallEvent,
  type Watch,
} from '@/lib/watchdog';

/** The worker's looks, once a second from `from` to `to`, the page silent. */
function silentUntil(watch: Watch, from: number, to: number): { watch: Watch; stalls: number[] } {
  const stalls: number[] = [];
  for (let t = from; t <= to; t += BEAT_MS) {
    const looked = look(watch, t);
    watch = looked.watch;
    if (looked.stalledMs !== null) stalls.push(looked.stalledMs);
  }
  return { watch, stalls };
}

const beat = (watch: Watch, now: number): Watch =>
  hear(watch, { type: 'beat', route: '/pool/[id]', from: '/', navigatedAt: now - 300 }, now);

describe('the main thread watchdog (lib/watchdog.ts)', () => {
  it('reports a page silent for five seconds, once per stall', () => {
    const watch = beat(startWatch(0), 0);
    const { watch: after, stalls } = silentUntil(watch, BEAT_MS, 20_000);
    expect(stalls).toEqual([STALL_MS]);
    // A beat re-arms it: the next silence is a stall of its own.
    expect(silentUntil(beat(after, 21_000), 22_000, 30_000).stalls).toEqual([STALL_MS]);
  });

  it('a page that keeps beating is never a stall', () => {
    let watch = startWatch(0);
    for (let t = 0; t < 60_000; t += BEAT_MS) {
      watch = beat(watch, t);
      const looked = look(watch, t + 500);
      watch = looked.watch;
      expect(looked.stalledMs).toBeNull();
    }
  });

  it('a hidden page is not watched, and starts over when shown', () => {
    let watch = hear(beat(startWatch(0), 0), { type: 'hidden' }, 100);
    expect(silentUntil(watch, BEAT_MS, 60_000).stalls).toEqual([]);
    watch = hear(watch, { type: 'visible' }, 60_000);
    expect(silentUntil(watch, 61_000, 64_000).stalls).toEqual([]);
  });

  it('a worker that was itself suspended does not blame the page', () => {
    // A phone asleep: the worker's next look comes a minute later.
    const watch = beat(startWatch(0), 0);
    const looked = look(look(watch, BEAT_MS).watch, 60_000);
    expect(looked.stalledMs).toBeNull();
    expect(silentUntil(looked.watch, 61_000, 63_000).stalls).toEqual([]);
  });

  it('sends the route pattern and timings, never an id or a path', () => {
    const pool = '/pool/P3TxKv9YLYpbrwUwiJ9ydE?settings=pool';
    const splash = '/splash/8a8046d5-5b9c-4598-9550-ffff4fd9cdd5';
    const navigation = { route: scrubName(pool), from: scrubName(splash), at: 9_000 };
    const event = stallEvent(navigation, 5_200, 10_000, 'a'.repeat(32), 'production', 'abc');
    const sent = envelope(SENTRY_DSN, event, 10_000);
    expect(sent).not.toMatch(/P3TxKv9YLYpbrwUwiJ9ydE|8a8046d5|settings=/);
    const [, item, body] = sent.split('\n');
    expect(JSON.parse(item)).toEqual({ type: 'event' });
    const parsed = JSON.parse(body);
    expect(parsed.transaction).toBe('/pool/[id]');
    expect(parsed.contexts.watchdog).toEqual({
      stalled_ms: 5_200,
      route: '/pool/[id]',
      navigated_from: '/splash/[id]',
      navigated_ms_before: 1_000,
    });
    expect(parsed.fingerprint).toEqual(['main-thread-stall', '/pool/[id]']);
  });

  it('posts to the project’s envelope endpoint, keyed by the public key', () => {
    const url = new URL(envelopeUrl(SENTRY_DSN));
    expect(url.hostname).toBe('o4512327756414976.ingest.us.sentry.io');
    expect(url.pathname).toBe('/api/4512327781974016/envelope/');
    expect(url.searchParams.get('sentry_key')).toBe('21978615dd80a84069b2ece1fde68d63');
  });

  it('reports a blank page with the stall’s fields, one issue per route and step', () => {
    const navigation = { route: '/pool/[id]', from: '/', at: 9_000 };
    expect(blankReport(navigation, 3_004, 10_000, 'refresh')).toEqual({
      message: 'Page rendered nothing for 3s',
      tags: { watchdog: 'blank', route: '/pool/[id]' },
      contexts: {
        watchdog: {
          blank_ms: 3_004,
          recovery: 'refresh',
          route: '/pool/[id]',
          navigated_from: '/',
          navigated_ms_before: 1_000,
        },
      },
      fingerprint: ['blank-page', 'refresh', '/pool/[id]'],
    });
    expect(blankReport(navigation, 6_100, 13_000, 'reload').message).toBe(
      'Page still rendered nothing after a refresh, 6s',
    );
  });
});
