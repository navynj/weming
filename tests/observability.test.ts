import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => [] as { error: Error; tags: Record<string, string> }[]);
vi.mock('@sentry/nextjs', () => ({
  captureException: (error: Error, context: { tags: Record<string, string> }) => {
    captured.push({ error, tags: context.tags });
  },
}));

import { scrubEvent, scrubText, sentryOptions } from '@/lib/observability';
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
