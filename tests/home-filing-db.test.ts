import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * Home filing (0060, H45): where a record that is not in one of my lanes
 * shows on my Home, mine alone. And Move to Home (move_to_home): a pool
 * record's origin stays locked on (0056) until it moves to a lane of mine,
 * every placement kept as it is; then its origin turns off like any pool.
 *
 * Ana writes a pool record in Alpha (with Ben and Cal) and shares it to
 * Beta (with Cal and Ben); Ben writes on it in Alpha, Cal in Beta. Dee is
 * in neither.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

let ana: string;
let ben: string;
let cal: string;
let dee: string;
let alpha: string;
let beta: string;
let betaLane: string;
let calRipple: string;
let benRipple: string;
let alphaLane: string;
const RECORD = crypto.randomUUID();
const PRIVATE = crypto.randomUUID();
const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `filing-${name}-${crypto.randomUUID()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert([
    { user_id: id, name: 'Day', position: 0 },
    { user_id: id, name: 'Trips', position: 1 },
  ]);
  people.push(id);
  return id;
}

async function laneOf(who: string, name: string): Promise<string> {
  return (
    await asAdmin().from('my_categories').select('id').eq('user_id', who).eq('name', name).single()
  ).data!.id;
}

async function openPool(name: string, members: string[]): Promise<[string, string]> {
  const made = await asUser(ana).rpc('create_pool', {
    p_name: name,
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Days', icon: '☀️', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  const id = made.data!;
  pools.push(id);
  const token = (await asUser(ana).rpc('create_invite', { p_pool: id })).data![0].token;
  for (const who of members) {
    const joined = await asUser(who).rpc('join_pool', {
      p_token: token,
      p_links: [],
      p_include_history: false,
    });
    if (joined.error) throw joined.error;
  }
  const lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', id).single()).data!
    .id;
  return [id, lane];
}

const sees = async (who: string, id: string): Promise<boolean> =>
  ((await asUser(who).from('ripples').select('id').eq('id', id)).data ?? []).length === 1;

const placement = async (pool: string) =>
  (
    await asUser(ana)
      .from('splash_placements')
      .select('shared')
      .eq('splash_id', RECORD)
      .eq('pool_id', pool)
      .single()
  ).data!.shared;

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  dee = await person('Dee');
  [alpha, alphaLane] = await openPool('Alpha', [ben, cal]);
  [beta, betaLane] = await openPool('Beta', [ben, cal]);
  const made = await asUser(ana).rpc('create_own_pool_splash', {
    p_id: RECORD,
    p_pool: alpha,
    p_pool_lane: alphaLane,
    p_title: 'Swim',
  });
  if (made.error) throw made.error;
  const shared = await asUser(ana)
    .from('splash_placements')
    .insert({ splash_id: RECORD, pool_id: beta, pool_lane_id: betaLane });
  if (shared.error) throw shared.error;
  const together = await asUser(ana).rpc('set_placement_together', {
    p_splash: RECORD,
    p_pool: beta,
    p_users: [cal],
    p_everyone: false,
  });
  if (together.error) throw together.error;
  const wrote = await asUser(cal)
    .from('ripples')
    .insert({ author_id: cal, note: 'Cal in Beta', splash_id: RECORD, thread_pool_id: beta })
    .select('id')
    .single();
  if (wrote.error) throw wrote.error;
  calRipple = wrote.data.id;
  const withBen = await asUser(ana).rpc('set_placement_together', {
    p_splash: RECORD,
    p_pool: alpha,
    p_users: [ben],
    p_everyone: false,
  });
  if (withBen.error) throw withBen.error;
  const benWrote = await asUser(ben)
    .from('ripples')
    .insert({ author_id: ben, note: 'Ben in Alpha', splash_id: RECORD, thread_pool_id: alpha })
    .select('id')
    .single();
  if (benWrote.error) throw benWrote.error;
  benRipple = benWrote.data.id;
  await asUser(dee).from('splashes').insert({ id: PRIVATE, owner_id: dee, title: 'Mine' });
});

afterAll(async () => {
  const admin = asAdmin();
  await admin.from('ripples').delete().in('author_id', people);
  for (const id of pools) await admin.from('pools').delete().eq('id', id);
  for (const id of people) {
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('filing a record on my Home', () => {
  it('Ben files Ana’s record into his lane; nothing about the record changes', async () => {
    const before = (await asAdmin().from('splashes').select('*').eq('id', RECORD).single()).data;
    const filed = await asUser(ben)
      .from('home_filing')
      .insert({ user_id: ben, splash_id: RECORD, my_lane_id: await laneOf(ben, 'Trips') });
    expect(filed.error).toBeNull();
    const after = (await asAdmin().from('splashes').select('*').eq('id', RECORD).single()).data;
    expect(after).toEqual(before);
    expect(await placement(alpha)).toBe(true);
    expect(await placement(beta)).toBe(true);
  });

  it('is Ben’s alone: no one else reads it, and Ana’s Home is untouched', async () => {
    for (const who of [ana, cal, dee]) {
      expect((await asUser(who).from('home_filing').select('*').eq('user_id', ben)).data).toEqual(
        [],
      );
    }
    expect((await asUser(ben).from('home_filing').select('splash_id')).data).toEqual([
      { splash_id: RECORD },
    ]);
    expect((await asUser(ana).from('home_filing').select('*')).data).toEqual([]);
  });

  it('moves among my lanes, and taking it back is a delete', async () => {
    const moved = await asUser(ben)
      .from('home_filing')
      .update({ my_lane_id: await laneOf(ben, 'Day') })
      .eq('splash_id', RECORD)
      .select('my_lane_id');
    expect(moved.data).toEqual([{ my_lane_id: await laneOf(ben, 'Day') }]);
    const back = await asUser(ben).from('home_filing').delete().eq('splash_id', RECORD).select();
    expect(back.data).toHaveLength(1);
  });

  it('refuses a lane not mine, a record I cannot read, and filing for someone else', async () => {
    const notMine = await asUser(ben)
      .from('home_filing')
      .insert({ user_id: ben, splash_id: RECORD, my_lane_id: await laneOf(ana, 'Day') });
    expect(notMine.error).not.toBeNull();
    const unread = await asUser(ben)
      .from('home_filing')
      .insert({ user_id: ben, splash_id: PRIVATE, my_lane_id: await laneOf(ben, 'Day') });
    expect(unread.error).not.toBeNull();
    const forAna = await asUser(ben)
      .from('home_filing')
      .insert({ user_id: ana, splash_id: RECORD, my_lane_id: await laneOf(ana, 'Day') });
    expect(forAna.error).not.toBeNull();
  });
});

describe('a pool record’s origin, and Move to Home (H45)', () => {
  const placements = async () =>
    (
      await asUser(ana)
        .from('splash_placements')
        .select('pool_id, pool_lane_id, shared')
        .eq('splash_id', RECORD)
        .order('pool_id')
    ).data!;

  it('stays locked on by default: its origin cannot be switched off or removed', async () => {
    const off = await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .eq('splash_id', RECORD)
      .eq('pool_id', alpha);
    expect(off.error?.message).toMatch(/always shared to its pool/);
    const removed = await asUser(ana)
      .from('splash_placements')
      .delete()
      .eq('splash_id', RECORD)
      .eq('pool_id', alpha);
    expect(removed.error?.message).toMatch(/always shared to its pool/);
    expect(await placement(alpha)).toBe(true);
  });

  it('moves to Home only as Ana’s, into a lane of hers', async () => {
    const byBen = await asUser(ben).rpc('move_to_home', {
      p_splash: RECORD,
      p_my_lane: await laneOf(ben, 'Day'),
    });
    expect(byBen.error).not.toBeNull();
    const intoBens = await asUser(ana).rpc('move_to_home', {
      p_splash: RECORD,
      p_my_lane: await laneOf(ben, 'Day'),
    });
    expect(intoBens.error).not.toBeNull();
  });

  it('keeps every placement as it is, the origin’s included, and drops the filing', async () => {
    await asUser(ana)
      .from('home_filing')
      .insert({ user_id: ana, splash_id: RECORD, my_lane_id: await laneOf(ana, 'Day') });
    const before = await placements();
    const moved = await asUser(ana).rpc('move_to_home', {
      p_splash: RECORD,
      p_my_lane: await laneOf(ana, 'Trips'),
    });
    expect(moved.error).toBeNull();
    expect(await placements()).toEqual(before);
    expect(before).toContainEqual({ pool_id: alpha, pool_lane_id: alphaLane, shared: true });
    const row = (
      await asAdmin()
        .from('splashes')
        .select('own_pool_id, declared_lane_id, owner_id')
        .eq('id', RECORD)
        .single()
    ).data!;
    expect(row).toEqual({
      own_pool_id: null,
      declared_lane_id: await laneOf(ana, 'Trips'),
      owner_id: ana,
    });
    expect((await asUser(ana).from('home_filing').select('*')).data).toEqual([]);
    // Members' sides stay where they were.
    expect(await sees(cal, benRipple)).toBe(true);
    expect(await sees(ben, calRipple)).toBe(true);
  });

  it('unlocks the origin: turned off, members’ ripples there are hidden, never deleted; the record stays on Home', async () => {
    const off = await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .eq('splash_id', RECORD)
      .eq('pool_id', alpha);
    expect(off.error).toBeNull();
    expect(await placement(alpha)).toBe(false);
    expect(await sees(cal, benRipple)).toBe(false);
    expect((await asAdmin().from('ripples').select('id').eq('id', benRipple)).data).toHaveLength(1);
    // Beta's side is untouched, and the record is Ana's, in her lane.
    expect(await sees(ben, calRipple)).toBe(true);
    const row = (
      await asAdmin().from('splashes').select('declared_lane_id').eq('id', RECORD).single()
    ).data!;
    expect(row.declared_lane_id).toBe(await laneOf(ana, 'Trips'));
  });

  it('brings Ben’s ripple back when Ana shares it to Alpha again', async () => {
    const on = await asUser(ana)
      .from('splash_placements')
      .update({ shared: true })
      .eq('splash_id', RECORD)
      .eq('pool_id', alpha);
    expect(on.error).toBeNull();
    expect(await sees(cal, benRipple)).toBe(true);
  });
});
