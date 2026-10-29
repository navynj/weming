import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithDeadline } from '@/lib/supabase/fetch';

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
