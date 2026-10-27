import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * Converting records (0022, 0033) through the edit sheet's save, against the
 * real schema with throwaway users. Ana opens Sarang (Word, Free) and Study
 * (Play); Ben joins Sarang. Links are advanced only and move nothing, so
 * none are made here. No conversion deletes a ripple or changes its author;
 * none takes a record out of a pool that could read it, except into joint.
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

import { saveSplashEdit } from '@/features/splash-sheet/edit-actions';

const CHURCH = crypto.randomUUID();
const DAY = crypto.randomUUID();
let ana: string;
let ben: string;
let sarang: string;
let study: string;
const lane: Record<string, string> = {};

async function person(name: string): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `convert-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await asAdmin()
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  return data.user.id;
}

/** A splash of Ana's in Church with one ripple, shared to the pools given. */
async function anas(shareTo: [string, string][], pinned = false): Promise<string> {
  const id = crypto.randomUUID();
  await asUser(ana)
    .from('splashes')
    .insert({
      id,
      owner_id: ana,
      title: 'mine',
      declared_lane_id: CHURCH,
      pinned_at: pinned ? new Date().toISOString() : null,
    });
  await asUser(ana).from('ripples').insert({ author_id: ana, note: 'Ana wrote', splash_id: id });
  for (const [pool, poolLane] of shareTo) {
    const { error } = await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: id, pool_id: pool, pool_lane_id: poolLane });
    if (error) throw error;
  }
  return id;
}

const base = {
  title: 'mine',
  icon: null,
  declaredStart: null,
  declaredEnd: null,
  declaredLaneId: null,
  share: [],
  block: null,
  poolLaneId: null,
};

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  await asAdmin()
    .from('my_categories')
    .insert([
      { id: CHURCH, user_id: ana, name: 'Church', icon: '⛪' },
      { id: DAY, user_id: ana, name: 'Day', icon: '🖋' },
    ]);
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Sarang',
    p_kind: null as unknown as 'friends',
    p_lanes: [
      { name: 'Word', icon: '📖', my_category_id: null },
      { name: 'Free', icon: '🕊', my_category_id: null },
    ],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  sarang = made.data!;
  const other = await asUser(ana).rpc('create_pool', {
    p_name: 'Study',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Play', icon: '🃏', my_category_id: null }],
    p_include_history: false,
  });
  if (other.error) throw other.error;
  study = other.data!;
  for (const row of (
    await asUser(ana).from('pool_lanes').select('id, name').in('pool_id', [sarang, study])
  ).data!) {
    lane[row.name] = row.id;
  }
  const token = (await asUser(ana).rpc('create_invite', { p_pool: sarang })).data![0].token;
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;
});

afterAll(async () => {
  const admin = asAdmin();
  for (const id of [sarang, study].filter(Boolean)) {
    await admin.from('splashes').delete().eq('pool_id', id);
    await admin.from('pools').delete().eq('id', id);
  }
  for (const id of [ana, ben].filter(Boolean)) {
    await admin.from('ripples').delete().eq('author_id', id);
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

const row = async (id: string) =>
  (await asAdmin().from('splashes').select('*').eq('id', id).single()).data!;
const ripplesOf = async (id: string) =>
  (await asAdmin().from('ripples').select('author_id').eq('splash_id', id)).data!;
const placementsOf = async (id: string) =>
  (
    await asAdmin()
      .from('splash_placements')
      .select('pool_id, pool_lane_id, shared')
      .eq('splash_id', id)
  ).data!;

describe('Together in a pool: my record becomes joint', () => {
  it('keeps my authorship and leaves every other pool; my ripple keeps no lane of its own (H24)', async () => {
    as.user = ana;
    const id = await anas(
      [
        [sarang, lane.Word],
        [study, lane.Play],
      ],
      true,
    );
    const done = await saveSplashEdit({
      ...base,
      id,
      kind: 'mine',
      declaredLaneId: CHURCH,
      poolId: null,
      conversion: { op: 'to_joint', poolLaneId: lane.Word, invitees: [ben], everyone: false },
    });
    expect(done).toEqual({ ok: true });
    const s = await row(id);
    expect(s).toMatchObject({
      owner_id: null,
      pool_id: sarang,
      pool_lane_id: lane.Word,
      created_by: ana,
      pinned_at: null,
    });
    // The ripple itself carries no lane; Home places it by the home lane.
    expect(await ripplesOf(id)).toEqual([{ author_id: ana }]);
    expect(await placementsOf(id)).toEqual([]);
    // Together: Ana, who made it, and Ben, picked; not Everyone.
    const invited = (await asAdmin().from('joint_invitees').select('user_id').eq('splash_id', id))
      .data!.map((i) => i.user_id)
      .sort();
    expect(invited).toEqual([ana, ben].sort());
    expect(s.joint_invite_all).toBe(false);
  });

  it('from Home, into a pool it was never shared to, with Everyone (0033)', async () => {
    as.user = ana;
    const id = await anas([]);
    const done = await saveSplashEdit({
      ...base,
      id,
      kind: 'mine',
      declaredLaneId: CHURCH,
      poolId: null,
      conversion: { op: 'to_joint', poolLaneId: lane.Free, invitees: [], everyone: true },
    });
    expect(done).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({
      owner_id: null,
      pool_id: sarang,
      joint_invite_all: true,
      description: null,
    });
  });

  it('on an unlinked pool lane too, my ripple carries no lane', async () => {
    as.user = ana;
    const id = await anas([[sarang, lane.Word]]);
    await saveSplashEdit({
      ...base,
      id,
      kind: 'mine',
      declaredLaneId: CHURCH,
      poolId: null,
      conversion: { op: 'to_joint', poolLaneId: lane.Free, invitees: [], everyone: false },
    });
    expect(await ripplesOf(id)).toEqual([{ author_id: ana }]);
  });

  it('keeps a locked ripple locked: a member still cannot read it', async () => {
    as.user = ana;
    const id = await anas([[sarang, lane.Word]]);
    const locked = (await asUser(ana).from('ripples').select('id').eq('splash_id', id).single())
      .data!.id;
    await asUser(ana).from('ripple_audience').insert({ ripple_id: locked, target_type: 'lock' });
    await saveSplashEdit({
      ...base,
      id,
      kind: 'mine',
      declaredLaneId: CHURCH,
      poolId: null,
      conversion: { op: 'to_joint', poolLaneId: lane.Word, invitees: [], everyone: false },
    });
    expect((await asUser(ben).from('splashes').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await asUser(ben).from('ripples').select('id').eq('id', locked)).data).toEqual([]);
  });
});

describe('a joint splash back to mine', () => {
  async function jointOfAnas(): Promise<string> {
    as.user = ana;
    const id = await anas([[sarang, lane.Word]], false);
    await saveSplashEdit({
      ...base,
      id,
      kind: 'mine',
      declaredLaneId: CHURCH,
      poolId: null,
      conversion: { op: 'to_joint', poolLaneId: lane.Word, invitees: [], everyone: false },
    });
    return id;
  }

  it('is refused while another member has a ripple on it', async () => {
    const id = await jointOfAnas();
    await asUser(ben).from('ripples').insert({ author_id: ben, note: 'Ben wrote', splash_id: id });
    as.user = ana;
    const done = await saveSplashEdit({
      ...base,
      id,
      kind: 'joint',
      poolId: sarang,
      conversion: { op: 'to_mine', myLaneId: CHURCH, placeOn: null },
    });
    expect(done).toEqual({ ok: false, message: 'Others have written here.' });
    expect((await row(id)).owner_id).toBeNull();
  });

  it('from Home, with only my ripples, becomes mine in my lane, shared only where its new Audience says', async () => {
    const id = await jointOfAnas();
    await asAdmin().from('splashes').update({ pinned_at: new Date().toISOString() }).eq('id', id);
    as.user = ana;
    const done = await saveSplashEdit({
      ...base,
      id,
      kind: 'joint',
      poolId: sarang,
      conversion: { op: 'to_mine', myLaneId: CHURCH, placeOn: null },
      // Its Audience, set anew: Study's Play.
      share: [{ poolId: study, on: true, poolLaneId: lane.Play }],
    });
    expect(done).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({
      owner_id: ana,
      pool_id: null,
      declared_lane_id: CHURCH,
      pinned_at: null,
      joint_invite_all: false,
      description: null,
    });
    // The splash takes the lane; the ripple inherits it and carries none (H24).
    expect(await ripplesOf(id)).toEqual([{ author_id: ana }]);
    // Sarang lets go of it; Study has it, as its Audience said.
    expect(await placementsOf(id)).toEqual([
      { pool_id: study, pool_lane_id: lane.Play, shared: true },
    ]);
    expect((await asAdmin().from('joint_invitees').select('*').eq('splash_id', id)).data).toEqual(
      [],
    );
  });
});

describe('my pool record moved to Home (0033)', () => {
  it('takes my lane and leaves its pool, Only me unless its Audience shares it', async () => {
    as.user = ana;
    const id = crypto.randomUUID();
    const made = await asUser(ana).rpc('create_own_pool_splash', {
      p_id: id,
      p_pool: sarang,
      p_pool_lane: lane.Word,
      p_title: 'in the pool',
    });
    expect(made.error).toBeNull();
    const done = await saveSplashEdit({
      ...base,
      id,
      kind: 'own',
      poolId: sarang,
      conversion: { op: 'to_mine', myLaneId: DAY, placeOn: null },
    });
    expect(done).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({
      owner_id: ana,
      own_pool_id: null,
      declared_lane_id: DAY,
    });
    // Its Audience was left as Only me: no pool has it now.
    expect(await placementsOf(id)).toEqual([]);
  });
});

describe('my shared record changes lane from Home', () => {
  it('moves no placement: every pool keeps it where it was (0033)', async () => {
    as.user = ana;
    const id = await anas([
      [sarang, lane.Word],
      [study, lane.Play],
    ]);
    const done = await saveSplashEdit({
      ...base,
      id,
      kind: 'mine',
      declaredLaneId: DAY,
      poolId: null,
      conversion: { op: 'set_lane', myLaneId: DAY, placeOn: null },
    });
    expect(done).toEqual({ ok: true });
    const placed = await placementsOf(id);
    expect(placed.sort((a, b) => a.pool_id.localeCompare(b.pool_id))).toEqual(
      [
        { pool_id: sarang, pool_lane_id: lane.Word, shared: true },
        { pool_id: study, pool_lane_id: lane.Play, shared: true },
      ].sort((a, b) => a.pool_id.localeCompare(b.pool_id)),
    );
    expect((await row(id)).declared_lane_id).toBe(DAY);
  });
});
