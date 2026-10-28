import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';
import { handOn } from './pool-helpers';

/**
 * My pool records shared to my other pools (0056). Ana writes a record in
 * Alpha (with Ben) and shares it to Beta (with Cal). Its origin placement
 * stays, shared; Beta's comes and goes as a Home record's does; Move to
 * Home keeps both; leaving Alpha leaves Beta's as it was; deleting the
 * record takes it from both.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

let ana: string;
let ben: string;
let cal: string;
let alpha: string;
let beta: string;
let alphaLane: string;
let betaLane: string;
const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `share-${name.toLowerCase()}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  people.push(id);
  return id;
}

async function poolWith(name: string, who: string): Promise<[string, string]> {
  const created = await asUser(ana).rpc('create_pool', {
    p_name: name,
    p_kind: 'friends',
    p_lanes: [{ name: 'Days', icon: '☀️', my_category_id: null }],
    p_include_history: false,
  });
  expect(created.error).toBeNull();
  const id = created.data!;
  pools.push(id);
  const invite = await asUser(ana).rpc('create_invite', { p_pool: id });
  const joined = await asUser(who).rpc('join_pool', {
    p_token: invite.data![0].token,
    p_links: [],
    p_include_history: false,
  });
  expect(joined.error).toBeNull();
  const lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', id)).data![0].id;
  return [id, lane];
}

/** Ana's pool record in Alpha, with one ripple. */
async function record(): Promise<string> {
  const id = crypto.randomUUID();
  const made = await asUser(ana).rpc('create_own_pool_splash', {
    p_id: id,
    p_pool: alpha,
    p_pool_lane: alphaLane,
    p_title: 'At the river',
  });
  expect(made.error).toBeNull();
  const wrote = await asUser(ana)
    .from('ripples')
    .insert({ author_id: ana, note: 'cold water', splash_id: id });
  expect(wrote.error).toBeNull();
  return id;
}

const placements = async (sid: string) =>
  (
    await asAdmin()
      .from('splash_placements')
      .select('pool_id, shared')
      .eq('splash_id', sid)
      .order('pool_id')
  ).data ?? [];
const reads = async (who: string, sid: string): Promise<boolean> =>
  ((await asUser(who).from('splashes').select('id').eq('id', sid)).data ?? []).length === 1;

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  [alpha, alphaLane] = await poolWith('Alpha', ben);
  [beta, betaLane] = await poolWith('Beta', cal);
});

afterAll(async () => {
  const admin = asAdmin();
  for (const id of people) await admin.from('splashes').delete().eq('owner_id', id);
  for (const id of pools) await admin.from('pools').delete().eq('id', id);
  for (const id of people) await admin.auth.admin.deleteUser(id);
});

describe('a pool record shared to my other pools (0056)', () => {
  it('takes a placement in another pool I am in, read by its members there', async () => {
    const sid = await record();
    expect(await reads(cal, sid)).toBe(false);
    const placed = await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: sid, pool_id: beta, pool_lane_id: betaLane });
    expect(placed.error).toBeNull();
    expect((await placements(sid)).map((p) => p.pool_id).sort()).toEqual([alpha, beta].sort());
    expect(await reads(cal, sid)).toBe(true);
    expect(await reads(ben, sid)).toBe(true);
  });

  it('switches the other pool off and back, removes it; never its origin', async () => {
    const sid = await record();
    await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: sid, pool_id: beta, pool_lane_id: betaLane });
    const off = await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .match({ splash_id: sid, pool_id: beta });
    expect(off.error).toBeNull();
    expect(await reads(cal, sid)).toBe(false);
    const originOff = await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .match({ splash_id: sid, pool_id: alpha });
    expect(originOff.error).not.toBeNull();
    const originGone = await asUser(ana)
      .from('splash_placements')
      .delete()
      .match({ splash_id: sid, pool_id: alpha });
    expect(originGone.error).not.toBeNull();
    const gone = await asUser(ana)
      .from('splash_placements')
      .delete()
      .match({ splash_id: sid, pool_id: beta });
    expect(gone.error).toBeNull();
    expect((await placements(sid)).map((p) => p.pool_id)).toEqual([alpha]);
  });

  it('is gone from every pool when deleted', async () => {
    const sid = await record();
    await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: sid, pool_id: beta, pool_lane_id: betaLane });
    const deleted = await asUser(ana).from('splashes').delete().eq('id', sid);
    expect(deleted.error).toBeNull();
    expect(await placements(sid)).toEqual([]);
  });

  it('keeps every placement when moved Home, taking a lane of mine', async () => {
    const sid = await record();
    await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: sid, pool_id: beta, pool_lane_id: betaLane });
    const lane = (
      await asAdmin()
        .from('my_categories')
        .insert({ user_id: ana, name: 'Walks' })
        .select('id')
        .single()
    ).data!.id;
    const moved = await asUser(ana).rpc('splash_to_mine', { p_splash: sid, p_my_lane: lane });
    expect(moved.error).toBeNull();
    const row = (
      await asAdmin()
        .from('splashes')
        .select('own_pool_id, declared_lane_id')
        .eq('id', sid)
        .single()
    ).data!;
    expect(row).toEqual({ own_pool_id: null, declared_lane_id: lane });
    expect((await placements(sid)).map((p) => p.pool_id).sort()).toEqual([alpha, beta].sort());
    // A Home record now: its old origin placement switches like any other.
    const off = await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .match({ splash_id: sid, pool_id: alpha });
    expect(off.error).toBeNull();
  });

  it('stays in my other pools when I leave its origin', async () => {
    const sid = await record();
    await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: sid, pool_id: beta, pool_lane_id: betaLane });
    // Ana leaves Alpha, removing her records there (keep: false), as a
    // member: the owner cannot leave (0064).
    await handOn(alpha, ana, ben);
    const left = await asUser(ana).rpc('leave_pool', { p_pool: alpha, p_keep: false });
    expect(left.error).toBeNull();
    expect(await reads(ben, sid)).toBe(false);
    expect(await reads(cal, sid)).toBe(true);
  });
});
