import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A name is global (H60): joining a pool never renames me. Against the real
 * schema with throwaway users: Ana's pool, Ben joining with a name of his
 * own, Cal joining with none.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
const as = vi.hoisted(() => ({ user: '' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/supabase/server', async () => {
  const { asUser: client } = await import('./as-user');
  return {
    createClient: async () => {
      const supabase = client(as.user);
      supabase.auth.getUser = (async () => ({
        data: { user: { id: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getUser;
      return supabase;
    },
  };
});

import { joinPool } from '@/features/pool/actions';

let ana: string;
let ben: string;
let cal: string;
let pool: string;
let token: string;

async function person(name: string): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `join-name-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await asAdmin()
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  return data.user.id;
}
const nameOf = async (id: string) =>
  (await asAdmin().from('profiles').select('display_name').eq('id', id).single()).data!
    .display_name;
const memberOf = async (id: string) =>
  (
    await asAdmin()
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', pool)
      .eq('user_id', id)
      .is('left_at', null)
  ).data!.length === 1;

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('  ');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Names',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
});

afterAll(async () => {
  const admin = asAdmin();
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, ben, cal].filter(Boolean)) await admin.auth.admin.deleteUser(id);
});

describe('joining a pool and my name (H60)', () => {
  it('leaves a name that is there alone, even when one is sent', async () => {
    as.user = ben;
    const joined = await joinPool({ token, name: 'Pool Ben' });
    expect(joined.ok).toBe(true);
    expect(await memberOf(ben)).toBe(true);
    expect(await nameOf(ben)).toBe('Ben');
  });

  it('needs a name from a profile with none, and saves it', async () => {
    as.user = cal;
    expect(await joinPool({ token })).toEqual({ ok: false, message: 'Add your name to join.' });
    expect(await joinPool({ token, name: '   ' })).toMatchObject({ ok: false });
    expect(await memberOf(cal)).toBe(false);
    const joined = await joinPool({ token, name: ' Cal ' });
    expect(joined.ok).toBe(true);
    expect(await nameOf(cal)).toBe('Cal');
    expect(await memberOf(cal)).toBe(true);
  });
});
