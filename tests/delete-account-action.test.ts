import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting my account, the server action's part (H53): the word and a
 * sign-in within ten minutes, checked on the server; then the rows, my
 * storage objects and the auth user, in that order. The database's part is
 * tests/delete-account-db.test.ts.
 */

const calls: string[] = [];
const state = vi.hoisted(() => ({
  signedInAt: 0 as number | null,
  rpc: { data: null as unknown, error: null as unknown },
  listed: [] as string[],
  deleteUserError: null as unknown,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: {
          claims: {
            sub: 'u-ana',
            amr:
              state.signedInAt === null ? [] : [{ method: 'oauth', timestamp: state.signedInAt }],
          },
        },
      }),
      signOut: async () => {
        calls.push('signOut');
        return { error: null };
      },
    },
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`);
      return state.rpc;
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        // Flat, with full paths and a cursor (lib/storage, list-v2).
        listV2: async ({ prefix }: { prefix: string }) => {
          calls.push(`list:${bucket}:${prefix}`);
          return {
            data: {
              objects: state.listed.map((name) => ({
                name: `${prefix}${name}`,
                metadata: {},
                updated_at: null,
              })),
              folders: [],
              hasNext: false,
            },
            error: null,
          };
        },
        remove: async (paths: string[]) => {
          calls.push(`remove:${bucket}:${paths.join(',')}`);
          return { data: [], error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.push(`deleteUser:${id}`);
          return { error: state.deleteUserError };
        },
      },
    },
  }),
}));

vi.mock('@/lib/env', () => ({
  supabaseUrl: () => 'http://localhost',
  supabaseServiceRoleKey: () => 'service',
}));

vi.mock('@/lib/report-failure', () => ({ reportFailure: () => calls.push('reported') }));

import { deleteMyAccount } from '@/features/account/actions';
import { signedInRecently } from '@/lib/recent-sign-in';

const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  calls.length = 0;
  state.signedInAt = now() - 60;
  state.rpc = {
    data: { deleted: true, counts: { profiles: 1 }, handed: [], torn: [], pool_photos: ['p-solo'] },
    error: null,
  };
  state.listed = ['a.webp', 'b.jpg'];
  state.deleteUserError = null;
});

describe('the recent sign-in', () => {
  it('counts the sign-in time, not the refresh, and only within ten minutes', () => {
    const t = 1_800_000_000;
    expect(signedInRecently({ amr: [{ method: 'oauth', timestamp: t }] }, t + 599)).toBe(true);
    expect(signedInRecently({ amr: [{ method: 'oauth', timestamp: t }] }, t + 601)).toBe(false);
    expect(signedInRecently({ amr: ['oauth'] }, t)).toBe(false);
    expect(signedInRecently({}, t)).toBe(false);
    expect(signedInRecently(null, t)).toBe(false);
  });
});

describe('deleteMyAccount', () => {
  it('refuses without the word, and touches nothing', async () => {
    expect(await deleteMyAccount('yes')).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it('asks for a fresh sign-in after ten minutes, and touches nothing', async () => {
    state.signedInAt = now() - 11 * 60;
    expect(await deleteMyAccount('delete')).toMatchObject({ ok: false, signInAgain: true });
    state.signedInAt = null;
    expect(await deleteMyAccount('delete')).toMatchObject({ ok: false, signInAgain: true });
    expect(calls).toEqual([]);
  });

  it('deletes the rows, then my photos, avatar and deleted pools’ photos, then the auth user', async () => {
    expect(await deleteMyAccount(' Delete ')).toEqual({ ok: true });
    expect(calls).toEqual([
      'rpc:delete_my_account',
      'list:ripple-media:u-ana/',
      'remove:ripple-media:u-ana/a.webp,u-ana/b.jpg',
      'remove:avatars:u-ana',
      'remove:pool-photos:p-solo',
      'deleteUser:u-ana',
      'signOut',
    ]);
  });

  it('stops before storage when the rows did not go, and says nothing changed', async () => {
    state.rpc = { data: null, error: { message: 'boom' } };
    const done = await deleteMyAccount('delete');
    expect(done).toMatchObject({ ok: false });
    expect(!done.ok && done.message).toMatch(/Nothing changed/);
    expect(calls).toEqual(['rpc:delete_my_account', 'reported']);
  });

  it('says what is left when the auth user could not go, so a retry finishes it', async () => {
    state.deleteUserError = { message: 'down' };
    const done = await deleteMyAccount('delete');
    expect(!done.ok && done.message).toMatch(/records are deleted/);
    expect(calls).not.toContain('signOut');
    expect(calls).toContain('reported');
  });
});
