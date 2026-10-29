import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ after: () => undefined }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { describeSteps, stepName } from '@/lib/action-timing';

const ID = '5de3cf00-d146-4f81-aa16-a0511460d981';
const HOST = 'https://ref.supabase.co';

// A step says what it touched, never what it carried (lib/observability.ts).
describe('a server action step, by name', () => {
  it('names a table, a function or a service, and drops the query and every id', () => {
    expect(stepName(`${HOST}/rest/v1/splashes?id=eq.${ID}&select=*`, 'PATCH')).toBe(
      'PATCH splashes',
    );
    expect(stepName(`${HOST}/rest/v1/rpc/move_pool_splash`, 'POST')).toBe('rpc move_pool_splash');
    expect(stepName(`${HOST}/auth/v1/user`, 'GET')).toBe('GET auth/user');
    expect(stepName(`${HOST}/storage/v1/object/ripple-media/${ID}/beach.jpg`, 'POST')).toBe(
      'POST storage/object',
    );
    expect(stepName(`${HOST}/rest/v1/${ID}`, 'GET')).toBe('GET [id]');
  });

  it('reads as one line of names, times and outcomes', () => {
    expect(
      describeSteps([
        { name: 'GET auth/user', ms: 91.6, outcome: 200 },
        { name: 'PATCH splashes', ms: 30_000.2, outcome: 'timeout' },
      ]),
    ).toBe('GET auth/user 92ms 200 · PATCH splashes 30000ms timeout');
  });
});
