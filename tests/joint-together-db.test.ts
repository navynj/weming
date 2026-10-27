import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * set_joint_together (0043), against the real schema with throwaway users:
 * Ana makes a joint record with Everyone; Ben writes on it. Only Ana may
 * change its whole With, Everyone included; Ben may still add. Taking Ben off
 * drops his slot and nothing else.
 *
 * Needs the local stack; the db project runs it.
 */
const JOINT = '0f430000-0000-0000-0000-0000000000c1';

let ana: string;
let ben: string;
let cal: string;
let pool: string;

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `together-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  return data.user.id;
}

const invitees = async (): Promise<string[]> =>
  ((await asAdmin().from('joint_invitees').select('user_id').eq('splash_id', JOINT)).data ?? [])
    .map((r) => r.user_id)
    .sort();
const everyone = async (): Promise<boolean> =>
  (await asAdmin().from('splashes').select('joint_invite_all').eq('id', JOINT).single()).data!
    .joint_invite_all;

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Together',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  const lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool)).data![0].id;
  const token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
  for (const who of [ben, cal]) {
    await asUser(who).rpc('join_pool', { p_token: token, p_links: [], p_include_history: false });
  }
  const joint = await asUser(ana).rpc('create_together_splash', {
    p_id: JOINT,
    p_pool: pool,
    p_pool_lane: lane,
    p_title: 'Tofino',
    p_icon: '',
    p_declared_start: null as unknown as string,
    p_invite_all: true,
  });
  if (joint.error) throw joint.error;
  const wrote = await asUser(ben)
    .from('ripples')
    .insert({ author_id: ben, note: 'my side', splash_id: JOINT });
  if (wrote.error) throw wrote.error;
});

afterAll(async () => {
  const admin = asAdmin();
  await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, ben, cal]) await admin.auth.admin.deleteUser(id);
});

describe('a joint record’s With, by its maker (0043)', () => {
  it('stays Everyone against anyone else’s write', async () => {
    const off = await asUser(ben).rpc('set_joint_together', {
      p_splash: JOINT,
      p_users: [],
      p_everyone: false,
    });
    expect(off.error?.code).toBe('42501');
    expect(await everyone()).toBe(true);
  });

  it('lets its maker turn Everyone off and pick, keeping her own row', async () => {
    const set = await asUser(ana).rpc('set_joint_together', {
      p_splash: JOINT,
      p_users: [cal],
      p_everyone: false,
    });
    expect(set.error).toBeNull();
    expect(await everyone()).toBe(false);
    expect(await invitees()).toEqual([ana, cal].sort());
  });

  it('takes a writer off his slot only: what he wrote stays, readable and his', async () => {
    const side = await asUser(cal).from('ripples').select('author_id').eq('splash_id', JOINT);
    expect(side.data).toEqual([{ author_id: ben }]);
  });

  it('still lets any member add', async () => {
    const added = await asUser(ben).rpc('add_joint_invitees', {
      p_splash: JOINT,
      p_users: [ben],
      p_everyone: false,
    });
    expect(added.error).toBeNull();
    expect(await invitees()).toEqual([ana, ben, cal].sort());
  });

  it('refuses someone outside the pool', async () => {
    const outsider = await person('Dee');
    const set = await asUser(ana).rpc('set_joint_together', {
      p_splash: JOINT,
      p_users: [outsider],
      p_everyone: false,
    });
    expect(set.error?.code).toBe('42501');
    await asAdmin().auth.admin.deleteUser(outsider);
  });
});
