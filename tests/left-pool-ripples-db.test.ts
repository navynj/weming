import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getMyLeftPoolRipples } from '@/lib/queries/pools';

import { anonymous, asAdmin, asUser } from './as-user';

/**
 * my_left_pool_ripples (0041), against the real schema with throwaway
 * users: Ana opens a pool and a joint splash in it, Ben joins and writes
 * on it, then leaves. Only Ben, and only once he has left, gets his ripple
 * back with the pool it was in; nobody gets anyone else's.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
const JOINT = '0f410000-0000-0000-0000-0000000000c1';

let ana: string;
let ben: string;
let cal: string;
let pool: string;
let benRipple: string;

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `left-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  return id;
}

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Left Behind',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  const trips = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool)).data![0].id;
  const token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
  await asUser(ben).rpc('join_pool', { p_token: token, p_links: [], p_include_history: false });
  const joint = await asUser(ana).rpc('create_together_splash', {
    p_id: JOINT,
    p_pool: pool,
    p_pool_lane: trips,
    p_title: 'Tofino',
    p_icon: '',
    p_declared_start: null as unknown as string,
    p_invite_all: true,
  });
  if (joint.error) throw joint.error;
  await asUser(ana).from('ripples').insert({ author_id: ana, note: 'ana', splash_id: JOINT });
  const wrote = await asUser(ben)
    .from('ripples')
    .insert({ author_id: ben, note: 'waves', splash_id: JOINT })
    .select('id')
    .single();
  if (wrote.error) throw wrote.error;
  benRipple = wrote.data.id;
});

afterAll(async () => {
  const admin = asAdmin();
  await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, ben, cal]) await admin.auth.admin.deleteUser(id);
});

describe('my_left_pool_ripples (0041)', () => {
  it('is empty while I can still read the splash', async () => {
    expect((await getMyLeftPoolRipples(asUser(ben))).size).toBe(0);
    expect((await getMyLeftPoolRipples(asUser(ana))).size).toBe(0);
  });

  it('once I leave, gives my ripple with the pool it was in', async () => {
    expect((await asUser(ben).rpc('leave_pool', { p_pool: pool, p_keep: true })).error).toBeNull();
    // The splash itself is now unreadable to Ben.
    expect((await asUser(ben).from('splashes').select('id').eq('id', JOINT)).data).toEqual([]);
    const left = await getMyLeftPoolRipples(asUser(ben));
    expect([...left]).toEqual([[benRipple, pool]]);
  });

  it('never gives anyone else’s', async () => {
    expect((await getMyLeftPoolRipples(asUser(ana))).size).toBe(0);
    expect((await getMyLeftPoolRipples(asUser(cal))).size).toBe(0);
    expect((await anonymous().rpc('my_left_pool_ripples')).error).not.toBeNull();
  });
});
