import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => [] as { error: Error; tags: Record<string, string> }[]);
vi.mock('@sentry/nextjs', () => ({
  captureException: (error: Error, context: { tags: Record<string, string> }) => {
    captured.push({ error, tags: context.tags });
  },
}));

import {
  fromTamperedWorker,
  scrubEvent,
  scrubLog,
  scrubName,
  scrubText,
  sentryOptions,
} from '@/lib/observability';
import { reported, reportFailure } from '@/lib/report-failure';

beforeEach(() => {
  captured.length = 0;
});

const USER = '5de3cf00-d146-4f81-aa16-a0511460d981';

describe('what reaches Sentry (privacy first)', () => {
  it('keeps the error, its stack, the route, an opaque user id and the release; nothing else', () => {
    const event = scrubEvent({
      type: undefined,
      release: 'abc123',
      message: `Invalid key: ${USER}/beach day.jpg`,
      request: {
        method: 'POST',
        url: 'https://example.app/splash/42?write=1&token=secret',
        data: { title: 'my diary', note: 'what I wrote' },
        cookies: { 'sb-access-token': 'x' },
        headers: { authorization: 'Bearer x' },
        query_string: 'write=1',
      },
      user: { id: USER, email: 'me@example.com', ip_address: '1.2.3.4', username: 'me' },
      extra: { draft: 'what I wrote' },
      breadcrumbs: [{ message: 'console: my diary' }],
      contexts: { os: { name: 'iOS' }, state: { draft: 'what I wrote' } },
      tags: { op: 'compose', title: 'my diary' },
      exception: {
        values: [
          {
            type: 'StorageError',
            value: `upload of ${USER}/9f3e.jpg (IMG_0001.HEIC) failed`,
            stacktrace: { frames: [{ function: 'attach', vars: { note: 'what I wrote' } }] },
          },
        ],
      },
    } as never) as unknown as Record<string, unknown> & {
      request: Record<string, unknown>;
      exception: {
        values: {
          type: string;
          value: string;
          stacktrace: { frames: Record<string, unknown>[] };
        }[];
      };
    };
    expect(event.request).toEqual({ method: 'POST', url: '/splash/42' });
    expect(event.user).toEqual({ id: USER });
    expect(event.extra).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.contexts).toEqual({ os: { name: 'iOS' } });
    expect(event.tags).toEqual({ op: 'compose' });
    // A name with a space loses both halves: more taken out, never less.
    expect(event.message).toBe('Invalid key: <path> <file>');
    expect(event.exception.values[0].type).toBe('StorageError');
    expect(event.exception.values[0].value).toBe('upload of <path> (<file>) failed');
    expect(event.exception.values[0].stacktrace.frames[0]).toEqual({ function: 'attach' });
    expect(event.release).toBe('abc123');
    expect(JSON.stringify(event)).not.toMatch(
      /diary|what I wrote|secret|me@example|1\.2\.3\.4|beach/,
    );
  });

  it('takes paths and file names out of any text', () => {
    expect(scrubText(`${USER}/a b.png and KakaoTalk_2026.jpg`)).toBe('<path> <file> and <file>');
    expect(scrubText('Payload too large')).toBe('Payload too large');
  });

  it('sends a span as its route pattern: no record url, no id, no title', () => {
    const SPLASH = '0b9c6f1e-3d2a-4c8b-9e7f-1a2b3c4d5e6f';
    const span = sentryOptions('production', 'abc').beforeSendSpan({
      trace_id: 't',
      span_id: 's',
      name: `GET https://example.app/splash/${SPLASH}?write=1&token=secret`,
      start_timestamp: 1,
      end_timestamp: 2,
      status: 'ok',
      is_segment: true,
      attributes: {
        'sentry.op': 'http.server',
        'http.request.method': 'GET',
        'http.response.status_code': 200,
        'sentry.segment.name': `GET /splash/${SPLASH}`,
        'url.full': `https://example.app/splash/${SPLASH}?write=1`,
        'http.query': 'write=1&token=secret',
        'splash.id': SPLASH,
        'splash.title': 'my diary',
        'http.request.body': '{"note":"what I wrote"}',
        'http.request.header.cookie': 'sb-access-token=x',
        'lcp.url': `https://x.supabase.co/storage/${USER}/beach day.jpg`,
        'user.email': 'me@example.com',
        'browser.web_vital.lcp.value': { value: 812, unit: 'millisecond' },
      },
      links: [{ context: { traceId: 't', spanId: 'l' }, attributes: { title: 'my diary' } }],
    } as never);
    expect(span.name).toBe('GET /splash/[id]');
    expect(span.attributes).toEqual({
      'sentry.op': 'http.server',
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'sentry.segment.name': 'GET /splash/[id]',
      'url.full': '/splash/[id]',
      'browser.web_vital.lcp.value': { value: 812, unit: 'millisecond' },
    });
    expect(JSON.stringify(span)).not.toMatch(
      new RegExp(`${SPLASH}|diary|what I wrote|secret|beach|me@example|sb-access`),
    );
  });

  it('puts every dynamic segment back to its pattern, and leaves pages alone', () => {
    const ID = '0b9c6f1e-3d2a-4c8b-9e7f-1a2b3c4d5e6f';
    expect(scrubName(`/pool/${ID}/splash/${ID}`)).toBe('/pool/[id]/splash/[id]');
    expect(scrubName(`/pool/${ID}/lane/7`)).toBe('/pool/[id]/lane/[id]');
    expect(scrubName('/join/k3yS3cr3t')).toBe('/join/[token]');
    expect(scrubName('/lane/12')).toBe('/lane/[id]');
    expect(scrubName('/pool/new')).toBe('/pool/new');
    expect(scrubName('GET /splash/[id]')).toBe('GET /splash/[id]');
    expect(scrubName(`select from ripples where id = '${ID}'`)).toBe(
      "select from ripples where id = '[id]'",
    );
  });

  it('sends nothing locally, every error and a tenth of traces in production, no traces in a preview', () => {
    expect(sentryOptions(undefined, '').enabled).toBe(false);
    expect(sentryOptions('production', 'abc')).toMatchObject({
      enabled: true,
      environment: 'production',
      release: 'abc',
      sampleRate: 1,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
    expect(sentryOptions('preview', 'abc')).toMatchObject({
      environment: 'preview',
      tracesSampleRate: 0,
    });
    expect(sentryOptions('production', 'abc').beforeBreadcrumb()).toBeNull();
    // Streamed spans never reach the transaction hooks: none is left to look like it guards them.
    expect(sentryOptions('production', 'abc')).not.toHaveProperty('beforeSendTransaction');
    expect(sentryOptions('production', 'abc')).not.toHaveProperty('ignoreTransactions');
    expect(sentryOptions('production', 'abc')).not.toHaveProperty('traceLifecycle');
  });
});

describe('a server action’s timing (lib/action-timing.ts)', () => {
  it('leaves as its step names and numbers, with nothing else the SDK attached', () => {
    const log = scrubLog({
      level: 'warn',
      message: 'server action timing',
      attributes: {
        'action.steps': 'GET auth/user 92ms 200 · PATCH splashes 5003ms timeout',
        'action.duration_ms': 5095,
        'sentry.release': 'abc',
        'user.id': USER,
        'user.email': 'someone@example.com',
        'server.address': 'ip-10-0-0-1',
      },
    });
    expect(log.attributes).toEqual({
      'action.steps': 'GET auth/user 92ms 200 · PATCH splashes 5003ms timeout',
      'action.duration_ms': 5095,
      'sentry.release': 'abc',
      'user.id': USER,
    });
    expect(sentryOptions('production', 'abc').beforeSendLog).toBe(scrubLog);
  });

  it('rides on an error as its `action` context', () => {
    const event = scrubEvent({
      type: undefined,
      contexts: { action: { steps: 'PATCH splashes 5003ms timeout' }, secret: { a: 1 } },
    });
    expect(event.contexts).toEqual({ action: { steps: 'PATCH splashes 5003ms timeout' } });
  });
});

describe('a failure someone ran into, reported by its operation', () => {
  it('reports a refusal a server action returns, tagged, with the reason only', async () => {
    const result = await reported('compose', async () => ({
      ok: false as const,
      message: 'Others have written here.',
    }));
    expect(result).toEqual({ ok: false, message: 'Others have written here.' });
    expect(captured).toHaveLength(1);
    expect(captured[0].tags).toEqual({ op: 'compose' });
    expect(captured[0].error.name).toBe('ComposeFailure');
    expect(captured[0].error.message).toBe('compose failed: Others have written here.');
  });

  it('reports nothing when it succeeds, and reports and rethrows when it throws', async () => {
    expect(await reported('edit', async () => ({ ok: true as const }))).toEqual({ ok: true });
    expect(captured).toHaveLength(0);
    await expect(
      reported('join', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(captured.map((c) => c.tags.op)).toEqual(['join']);
  });

  it('never sends a photo’s path or name with an upload failure', () => {
    reportFailure('upload', { message: `Invalid key: ${USER}/x-KakaoTalk_2026.jpg` });
    expect(captured[0].error.message).toBe('upload failed: Invalid key: <path>');
  });
});

describe('the watchdog’s reports (lib/watchdog.ts)', () => {
  it('keep their route patterns and times, and nothing written into them leaves as a path', () => {
    const event = scrubEvent({
      message: 'Page rendered nothing for 3s',
      tags: { watchdog: 'blank', route: '/pool/P3TxKv9YLYpbrwUwiJ9ydE', title: 'my diary' },
      contexts: {
        watchdog: {
          blank_ms: 3_004,
          recovery: 'refresh',
          route: '/pool/P3TxKv9YLYpbrwUwiJ9ydE',
          navigated_from: '/splash/8a8046d5-5b9c-4598-9550-ffff4fd9cdd5?x=1',
          navigated_ms_before: 412,
        },
      },
    } as never) as unknown as { tags: unknown; contexts: unknown };
    expect(event.tags).toEqual({ watchdog: 'blank', route: '/pool/[id]' });
    expect(event.contexts).toEqual({
      watchdog: {
        blank_ms: 3_004,
        recovery: 'refresh',
        route: '/pool/[id]',
        navigated_from: '/splash/[id]',
        navigated_ms_before: 412,
      },
    });
  });
});

describe('noise a crawler makes in Next’s code (WEMING-8)', () => {
  const thrownAt = (filename: string) => ({
    type: undefined,
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Uncaught SyntaxError: Unexpected non-whitespace character after JSON',
          stacktrace: { frames: [{ filename, lineno: 1, colno: 137 }] },
        },
      ],
    },
  });
  const worker =
    'https://example.app/_next/static/immutable/chunks/turbopack-worker-1tv8tw60o5c2r.js#params=%5B%5D';

  it('drops the worker bootstrap’s error when something appended to its URL', () => {
    const event = thrownAt(
      `${worker}#jL0WDYZPml3/KCMsVFtf2mdY#{"navigator":{"platform":"Windows"}}`,
    );
    expect(fromTamperedWorker(event)).toBe(true);
    expect(sentryOptions('production', 'r').beforeSend(event)).toBeNull();
  });

  it('keeps the bootstrap’s error from the URL the app made, and every other error', () => {
    expect(fromTamperedWorker(thrownAt(worker))).toBe(false);
    expect(fromTamperedWorker(thrownAt('https://example.app/_next/static/chunks/app.js#a#b'))).toBe(
      false,
    );
    expect(sentryOptions('production', 'r').beforeSend(thrownAt(worker))).not.toBeNull();
  });
});
