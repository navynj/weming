import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The dashboard's door (H71): ADMIN_USER_IDS or a 404, the same 404 a
 * missing page gives, and no service client made for anyone else.
 */
const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404');
let signedIn: string | null = null;
const made: string[] = [];

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: signedIn } : null } }) },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    made.push(key);
    return { rpc: () => {} };
  },
}));

const ADMIN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.stubEnv('ADMIN_USER_IDS', ` ${ADMIN} , 33333333-3333-4333-8333-333333333333`);
  made.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe('requireAdmin', () => {
  it('lets a listed account in, with a service client', async () => {
    signedIn = ADMIN;
    const { requireAdmin } = await import('@/lib/admin/access');
    await expect(requireAdmin()).resolves.toMatchObject({ id: ADMIN });
    expect(made).toEqual(['service-key']);
  });

  it('answers 404 to anyone else, and makes no service client', async () => {
    const { requireAdmin } = await import('@/lib/admin/access');
    for (const who of [OTHER, null]) {
      signedIn = who;
      await expect(requireAdmin()).rejects.toBe(NOT_FOUND);
    }
    expect(made).toEqual([]);
  });

  it('lets nobody in when ADMIN_USER_IDS is unset', async () => {
    vi.stubEnv('ADMIN_USER_IDS', '');
    signedIn = ADMIN;
    const { requireAdmin } = await import('@/lib/admin/access');
    await expect(requireAdmin()).rejects.toBe(NOT_FOUND);
  });
});
