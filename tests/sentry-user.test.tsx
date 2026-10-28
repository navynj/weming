// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const users = vi.hoisted(() => [] as unknown[]);
vi.mock('@sentry/nextjs', () => ({ setUser: (user: unknown) => users.push(user) }));

import { SentryUser } from '@/features/auth/sentry-user';
import { tagUserOnRead } from '@/lib/sentry-user';

afterEach(() => {
  cleanup();
  users.length = 0;
});

/**
 * Who ran into an error (review): the Supabase id goes to Sentry, never an
 * email or a name; scrubEvent keeps only the id on the way out
 * (tests/observability.test.ts).
 */
describe('the Sentry user', () => {
  it('is tagged whenever the server reads the signed-in user, with the id alone', async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'u-1', email: 'me@example.com' } },
          error: null,
        })),
      },
    };
    const tagged = tagUserOnRead(client);
    const result = await tagged.auth.getUser();
    // The read itself is unchanged.
    expect(result.data.user).toEqual({ id: 'u-1', email: 'me@example.com' });
    expect(users).toEqual([{ id: 'u-1' }]);
  });

  it('is cleared when the read finds nobody signed in', async () => {
    const client = { auth: { getUser: async () => ({ data: { user: null }, error: null }) } };
    await tagUserOnRead(client).auth.getUser();
    expect(users).toEqual([null]);
  });

  it('is my id in the browser while the shell is up, and cleared after', () => {
    const view = render(<SentryUser id="u-2" />);
    expect(users).toEqual([{ id: 'u-2' }]);
    view.unmount();
    expect(users.at(-1)).toBeNull();
  });
});
