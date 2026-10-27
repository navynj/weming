import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getMyOriginTags } from '@/lib/queries/pools';

import { asAdmin, asUser } from './as-user';

/**
 * Deleting a pool (0015), against the real schema with throwaway users:
 * Ana opens it, Ben is a member, Cal is outside. Only the creator may
 * delete; nothing pool-side remains; nobody's words go with it.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
const ANA_TRIPS = '0f100000-0000-0000-0000-0000000000a1';
const BEN_TRIPS = '0f100000-0000-0000-0000-0000000000b1';
const BEN_GAMES = '0f100000-0000-0000-0000-0000000000b2';
const ANA_SHARED = '0f200000-0000-0000-0000-0000000000a1';
const BEN_OWN_GAMES = '0f200000-0000-0000-0000-0000000000b1';
const BEN_OWN_NOTES = '0f200000-0000-0000-0000-0000000000b2';
const JOINT = '0f200000-0000-0000-0000-0000000000c1';

let ana: string;
let ben: string;
let cal: string;
let pool: string;
let token: string;
const lane: Record<string, string> = {};

async function person(name: string, lanes: [string, string][]): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `delete-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  for (const [laneId, laneName] of lanes) {
    await admin
      .from('my_categories')
      .insert({ id: laneId, user_id: id, name: laneName, icon: '•' });
  }
  return id;
}

beforeAll(async () => {
  ana = await person('Ana', [[ANA_TRIPS, 'Trips']]);
  ben = await person('Ben', [
    [BEN_TRIPS, 'Trips'],
    [BEN_GAMES, 'Games'],
  ]);
  cal = await person('Cal', []);

  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Delete Me',
    p_kind: null as unknown as 'friends',
    p_lanes: [
      { name: 'Trips', icon: '🏕', my_category_id: ANA_TRIPS },
      { name: 'Games', icon: '🎲', my_category_id: null },
      { name: 'Notes', icon: '📓', my_category_id: null },
    ],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  for (const row of (await asUser(ana).from('pool_lanes').select('id, name').eq('pool_id', pool))
    .data!) {
    lane[row.name] = row.id;
  }
  token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
  await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [{ pool_lane_id: lane.Trips, my_category_id: BEN_TRIPS }],
    p_include_history: false,
  });

  // Ana's own post, shared to the pool through her linked lane.
  await asUser(ana).from('splashes').insert({
    id: ANA_SHARED,
    owner_id: ana,
    title: 'Whistler',
    declared_lane_id: ANA_TRIPS,
  });
  await asUser(ana)
    .from('ripples')
    .insert({ author_id: ana, note: 'sea to sky', splash_id: ANA_SHARED });
  await asUser(ana)
    .from('splash_placements')
    .insert({ splash_id: ANA_SHARED, pool_id: pool, pool_lane_id: lane.Trips });

  // Ben's Just-mine splashes: Games (he has a lane of that name) and Notes.
  for (const [id, poolLane] of [
    [BEN_OWN_GAMES, lane.Games],
    [BEN_OWN_NOTES, lane.Notes],
  ]) {
    await asUser(ben).rpc('create_own_pool_splash', {
      p_id: id,
      p_pool: pool,
      p_pool_lane: poolLane,
      p_title: 'mine',
    });
    await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, note: `own ${id}`, splash_id: id });
  }

  // A joint splash: three ripples of Ben's, one of Ana's.
  await asUser(ana).rpc('create_together_splash', {
    p_id: JOINT,
    p_pool: pool,
    p_pool_lane: lane.Games,
    p_title: 'Arnak league',
    p_icon: '🏛️',
    p_declared_start: null as unknown as string,
    p_invite_all: false,
  });
  for (const [n, at] of [
    [1, '2026-10-20T18:00:00.000Z'],
    [2, '2026-10-21T18:00:00.000Z'],
    [3, '2026-10-22T18:00:00.000Z'],
  ] as const) {
    await asUser(ben)
      .from('ripples')
      .insert({
        author_id: ben,
        note: `ben ${n}`,
        splash_id: JOINT,
        created_at: at,
      });
  }
  await asUser(ana).from('ripples').insert({ author_id: ana, note: 'ana in', splash_id: JOINT });
  // Ben's most recent ripple there. Games is linked to no lane of his.
  await asUser(ben).from('ripples').insert({
    author_id: ben,
    note: 'ben unlinked',
    splash_id: JOINT,
    created_at: '2026-10-23T18:00:00.000Z',
  });
});

afterAll(async () => {
  const admin = asAdmin();
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, ben, cal].filter(Boolean)) {
    await admin.from('ripples').delete().eq('author_id', id);
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('the tag’s snapshot (0015)', () => {
  it('follows a rename while I am a member, and freezes when I leave', async () => {
    const snapshot = async (): Promise<string | null> =>
      (
        await asAdmin()
          .from('splash_placements')
          .select('origin_pool_lane_name')
          .eq('splash_id', BEN_OWN_NOTES)
          .single()
      ).data!.origin_pool_lane_name;
    expect(await snapshot()).toBe('Notes');

    await asUser(ana).from('pool_lanes').update({ name: 'Notebook' }).eq('id', lane.Notes);
    expect(await snapshot()).toBe('Notebook');
    // The tag reads live while I am in: the rename shows at once.
    expect((await getMyOriginTags(asUser(ben), ben)).get(BEN_OWN_NOTES)).toEqual([
      'Delete Me · 📓 Notebook',
    ]);

    await asUser(ben).rpc('leave_pool', { p_pool: pool, p_keep: true });
    await asUser(ana).from('pool_lanes').update({ name: 'Journal' }).eq('id', lane.Notes);
    expect(await snapshot()).toBe('Notebook');
    // Left: the tag is the snapshot, frozen at the names I knew.
    expect((await getMyOriginTags(asUser(ben), ben)).get(BEN_OWN_NOTES)).toEqual([
      'Delete Me · 📓 Notebook',
    ]);

    // Back in, so the rest reads as a member's.
    const back = await asUser(ben).rpc('join_pool', {
      p_token: token,
      p_links: [{ pool_lane_id: lane.Trips, my_category_id: BEN_TRIPS }],
      p_include_history: false,
    });
    expect(back.error).toBeNull();
  });
});

describe('deleting a pool (0015)', () => {
  it('is refused to a member who is not the creator, and to an outsider', async () => {
    expect((await asUser(ben).rpc('delete_pool', { p_pool: pool })).error?.code).toBe('42501');
    expect((await asUser(cal).rpc('delete_pool', { p_pool: pool })).error?.code).toBe('42501');
  });

  it('is refused while the pool has no owner', async () => {
    await asAdmin().from('pools').update({ owner_id: null }).eq('id', pool);
    expect((await asUser(ana).rpc('delete_pool', { p_pool: pool })).error?.code).toBe('42501');
    await asAdmin().from('pools').update({ owner_id: ana }).eq('id', pool);
  });

  it('leaves nothing pool-side behind when the creator deletes it', async () => {
    const done = await asUser(ana).rpc('delete_pool', { p_pool: pool });
    expect(done.error).toBeNull();
    const admin = asAdmin();
    for (const table of [
      'pool_members',
      'pool_lanes',
      'lane_mappings',
      'splash_placements',
      'pool_invites',
    ] as const) {
      const { data } = await admin.from(table).select('pool_id').eq('pool_id', pool);
      expect(data, table).toEqual([]);
    }
    expect((await admin.from('pools').select('id').eq('id', pool)).data).toEqual([]);
    expect((await admin.from('splashes').select('id').eq('id', JOINT)).data).toEqual([]);
  });

  it('gives an author one post holding their three ripples from a joint shell, titled like it', async () => {
    const { data } = await asUser(ben)
      .from('ripples')
      .select('note, splash_id')
      .in('note', ['ben 1', 'ben 2', 'ben 3']);
    expect(data).toHaveLength(3);
    const posts = new Set(data!.map((r) => r.splash_id));
    expect(posts.size).toBe(1);
    const post = await asUser(ben)
      .from('splashes')
      .select('owner_id, title, icon')
      .eq('id', [...posts][0]!)
      .single();
    expect(post.data).toEqual({ owner_id: ben, title: 'Arnak league', icon: '🏛️' });
    const origin = await asUser(ben)
      .from('splash_origins')
      .select('pool_name, pool_lane_name, pool_lane_icon')
      .eq('splash_id', [...posts][0]!);
    expect(origin.data).toEqual([
      { pool_name: 'Delete Me', pool_lane_name: 'Games', pool_lane_icon: '🎲' },
    ]);
    // Ana's one ripple went to a post of her own.
    const anas = await asUser(ana)
      .from('ripples')
      .select('splash_id')
      .eq('note', 'ana in')
      .single();
    expect(anas.data!.splash_id).not.toBe([...posts][0]);
  });

  it('files an author’s post in a lane made from the pool lane when no link brings it in (H24)', async () => {
    const lanes = await asUser(ben).from('my_categories').select('id, name');
    const games = lanes.data!.find((l) => l.name === 'Games (Delete Me)')!;
    const late = await asUser(ben)
      .from('ripples')
      .select('splash_id')
      .eq('note', 'ben unlinked')
      .single();
    const early = await asUser(ben)
      .from('ripples')
      .select('splash_id')
      .eq('note', 'ben 1')
      .single();
    // One post for all four of Ben's.
    expect(late.data!.splash_id).toBe(early.data!.splash_id);
    const post = await asUser(ben)
      .from('splashes')
      .select('declared_lane_id')
      .eq('id', late.data!.splash_id!)
      .single();
    // Games is linked to no lane of Ben's: the post takes the lane made from it.
    expect(post.data!.declared_lane_id).toBe(games.id);
    // One lane for Ben from Games, for Just mine and joint alike.
    expect(lanes.data!.filter((l) => l.name.startsWith('Games (')).length).toBe(1);
  });

  it('moves Just-mine splashes into a lane made from the pool lane, suffixed when the name is taken', async () => {
    const lanes = await asUser(ben).from('my_categories').select('id, name, icon');
    const games = lanes.data!.find((l) => l.name === 'Games (Delete Me)');
    const notes = lanes.data!.find((l) => l.name === 'Journal');
    expect(games?.icon).toBe('🎲');
    expect(notes?.icon).toBe('📓');
    for (const [id, laneId] of [
      [BEN_OWN_GAMES, games!.id],
      [BEN_OWN_NOTES, notes!.id],
    ]) {
      const post = await asUser(ben)
        .from('splashes')
        .select('declared_lane_id, own_pool_id')
        .eq('id', id)
        .single();
      expect(post.data).toEqual({ declared_lane_id: laneId, own_pool_id: null });
      // The post takes the lane (H24); its one ripple stays on it.
      const blocks = await asUser(ben).from('ripples').select('splash_id').eq('splash_id', id);
      expect(blocks.data).toHaveLength(1);
    }
    const tag = await asUser(ben)
      .from('splash_origins')
      .select('pool_lane_name')
      .eq('splash_id', BEN_OWN_NOTES)
      .single();
    // Frozen at the last names: renamed to Journal before the pool went.
    expect(tag.data!.pool_lane_name).toBe('Journal');
    expect((await getMyOriginTags(asUser(ben), ben)).get(BEN_OWN_NOTES)).toEqual([
      'Delete Me · 📓 Journal',
    ]);
  });

  it('leaves a shared splash untouched but for where it came from', async () => {
    const post = await asUser(ana)
      .from('splashes')
      .select('title, declared_lane_id')
      .eq('id', ANA_SHARED)
      .single();
    expect(post.data).toEqual({ title: 'Whistler', declared_lane_id: ANA_TRIPS });
    const blocks = await asUser(ana).from('ripples').select('note').eq('splash_id', ANA_SHARED);
    expect(blocks.data).toEqual([{ note: 'sea to sky' }]);
    const tag = await asUser(ana)
      .from('splash_origins')
      .select('pool_name, pool_lane_name')
      .eq('splash_id', ANA_SHARED);
    expect(tag.data).toEqual([{ pool_name: 'Delete Me', pool_lane_name: 'Trips' }]);
    // Ana's origins are hers alone.
    expect(
      (await asUser(ben).from('splash_origins').select('id').eq('splash_id', ANA_SHARED)).data,
    ).toEqual([]);
  });
});
