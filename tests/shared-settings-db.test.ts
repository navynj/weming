import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A pool's colour is its members'; my theme is mine (0059). Ana makes a
 * pool, Ben joins, Cal stays outside.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

let ana: string;
let ben: string;
let cal: string;
let pool: string;
const people: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `settings-${name.toLowerCase()}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  people.push(data.user.id);
  return data.user.id;
}

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Colours',
    p_kind: 'friends',
    p_lanes: [{ name: 'Days', icon: '☀️', my_category_id: null }],
    p_include_history: false,
  });
  expect(made.error).toBeNull();
  pool = made.data!;
  const invite = await asUser(ana).rpc('create_invite', { p_pool: pool });
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: invite.data![0].token,
    p_links: [],
    p_include_history: false,
  });
  expect(joined.error).toBeNull();
});

afterAll(async () => {
  const admin = asAdmin();
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of people) await admin.auth.admin.deleteUser(id);
});

describe('a pool’s colour (0059)', () => {
  it('is any current member’s to set and clear; not someone outside it', async () => {
    expect(
      (await asUser(ben).rpc('set_pool_theme', { p_pool: pool, p_theme: 'mint' })).error,
    ).toBeNull();
    expect(
      (await asUser(ana).from('pools').select('theme').eq('id', pool).single()).data!.theme,
    ).toBe('mint');
    expect(
      (await asUser(cal).rpc('set_pool_theme', { p_pool: pool, p_theme: 'red' })).error?.code,
    ).toBe('42501');
    expect(
      (await asUser(ana).rpc('set_pool_theme', { p_pool: pool, p_theme: 'plaid' })).error,
    ).not.toBeNull();
    expect(
      (
        await asUser(ana).rpc('set_pool_theme', {
          p_pool: pool,
          p_theme: null as unknown as string,
        })
      ).error,
    ).toBeNull();
  });
});

describe('my colour in a pool, and my theme (0059)', () => {
  it('are mine alone: a companion reads neither', async () => {
    const mine = await asUser(ben)
      .from('member_pool_settings')
      .upsert({ pool_id: pool, user_id: ben, theme: 'pink' });
    expect(mine.error).toBeNull();
    expect(
      (await asUser(ana).from('member_pool_settings').select('*').eq('user_id', ben)).data,
    ).toEqual([]);
    const theme = await asUser(ben)
      .from('my_theme_settings')
      .upsert({ user_id: ben, home_color: 'green', mode: 'light', apply_everywhere: true });
    expect(theme.error).toBeNull();
    expect(
      (await asUser(ana).from('my_theme_settings').select('*').eq('user_id', ben)).data,
    ).toEqual([]);
    expect(
      (await asUser(ben).from('my_theme_settings').select('home_color, apply_everywhere').single())
        .data,
    ).toEqual({ home_color: 'green', apply_everywhere: true });
  });

  it('cannot be written for someone else, or for a pool I am not in', async () => {
    expect(
      (await asUser(ana).from('my_theme_settings').upsert({ user_id: ben, home_color: 'red' }))
        .error,
    ).not.toBeNull();
    expect(
      (
        await asUser(cal)
          .from('member_pool_settings')
          .upsert({ pool_id: pool, user_id: cal, theme: 'red' })
      ).error,
    ).not.toBeNull();
  });
});

describe('what stays the creator’s (0059)', () => {
  it('deleting the pool and the members’ notification defaults', async () => {
    expect((await asUser(ben).rpc('delete_pool', { p_pool: pool })).error).not.toBeNull();
    const defaults = await asUser(ben)
      .from('pool_notification_defaults')
      .upsert({ pool_id: pool, type: 'reply', value: 'off' });
    expect(defaults.error).not.toBeNull();
  });
});
