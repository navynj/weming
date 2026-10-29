import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithDeadline, isCutOff, UNCONFIRMED, writeRefusal } from '@/lib/supabase/fetch';

// A write cut off by the read deadline can still commit while the author is
// told it failed; a write gets its own, longer ceiling.
describe('fetchWithDeadline', () => {
  afterEach(() => vi.restoreAllMocks());

  function deadlineFor(method: string | undefined): number {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    void fetchWithDeadline(5_000, 30_000)('http://db.test/rest/v1/splashes', { method });
    return timeout.mock.calls[0][0];
  }

  it('bounds a read by the read deadline', () => {
    expect(deadlineFor(undefined)).toBe(5_000);
    expect(deadlineFor('GET')).toBe(5_000);
  });

  it('gives a write the write deadline', () => {
    expect(deadlineFor('PATCH')).toBe(30_000);
    expect(deadlineFor('POST')).toBe(30_000);
    expect(deadlineFor('DELETE')).toBe(30_000);
  });

  it('keeps one deadline when no write deadline is given', () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    void fetchWithDeadline(3_000)('http://db.test/auth/v1/token', { method: 'POST' });
    expect(timeout.mock.calls[0][0]).toBe(3_000);
  });
});

describe('a step, as fetchWithDeadline hands it on', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names its status when it is answered and "timeout" when the deadline cut it off', async () => {
    const steps: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));
    await fetchWithDeadline(5_000, 30_000, (...step) => steps.push(step))(
      'http://db.test/rest/v1/x',
      {
        method: 'PATCH',
      },
    );
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_input, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
        ),
    );
    await expect(
      fetchWithDeadline(10, 10, (...step) => steps.push(step))('http://db.test/rest/v1/x'),
    ).rejects.toThrow();
    expect(steps.map((s) => (s as unknown[])[3])).toEqual([204, 'timeout']);
  });
});

describe('a write cut off before its answer', () => {
  it('is told apart from a refusal, and never shown raw', () => {
    const timeout = { message: 'TimeoutError: The operation was aborted due to timeout' };
    expect(isCutOff(timeout)).toBe(true);
    expect(isCutOff({ message: 'TypeError: fetch failed' })).toBe(true);
    expect(isCutOff({ message: 'new row violates row-level security policy' })).toBe(false);
    expect(writeRefusal(timeout)).toBe(UNCONFIRMED);
    expect(writeRefusal({ message: 'That day is outside this range.' })).toBe(
      'That day is outside this range.',
    );
  });
});
