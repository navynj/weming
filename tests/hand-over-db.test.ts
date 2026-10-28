import { afterAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A record others wrote in outlives its owner (0061, H46). Ana's record is
 * shared to Crew (Ben) and Club (Eve); Ben writes in Crew's thread, Eve in
 * Club's, and Cal reacts to Ben's ripple. When Ana leaves with remove,
 * deletes the record or deletes her account, each pool where others wrote
 * gets a joint record with the record's title, icon and days, carrying that
 * pool's thread and layout; Ana's own ripples never go with it. Leaving with
 * keep hands nothing over: the record stays in the pool.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `handover-${name}-${crypto.randomUUID()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: id, name: 'Day' });
  people.push(id);
  return id;
}

async function openPool(owner: string, name: string, members: string[]): Promise<[string, string]> {
  const made = await asUser(owner).rpc('create_pool', {
    p_name: name,
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🧭', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  const id = made.data!;
  pools.push(id);
  const token = (await asUser(owner).rpc('create_invite', { p_pool: id })).data![0].token;
  for (const who of members) {
    const joined = await asUser(who).rpc('join_pool', {
      p_token: token,
      p_links: [],
      p_include_history: false,
    });
    if (joined.error) throw joined.error;
  }
  const lane = (await asUser(owner).from('pool_lanes').select('id').eq('pool_id', id).single())
    .data!.id;
  return [id, lane];
}

async function write(who: string, note: string, splash: string, pool: string | null) {
  const made = await asUser(who)
    .from('ripples')
    .insert({ author_id: who, note, splash_id: splash, thread_pool_id: pool })
    .select('id')
    .single();
  if (made.error) throw made.error;
  return made.data.id;
}

type World = {
  ana: string;
  ben: string;
  cal: string;
  eve: string;
  crew: string;
  club: string;
  record: string;
  anaRipple: string;
  benRipple: string;
  eveRipple: string;
};

/** Ana's record "Tofino" 🏄 on 3–5 Oct, shared to Crew and Club, with a side in each. */
async function world(): Promise<World> {
  const [ana, ben, cal, eve] = [
    await person('Ana'),
    await person('Ben'),
    await person('Cal'),
    await person('Eve'),
  ];
  const [crew, crewLane] = await openPool(ana, 'Crew', [ben, cal]);
  const [club, clubLane] = await openPool(ana, 'Club', [eve]);
  const record = crypto.randomUUID();
  const lane = (await asAdmin().from('my_categories').select('id').eq('user_id', ana).single())
    .data!.id;
  const made = await asUser(ana).from('splashes').insert({
    id: record,
    owner_id: ana,
    title: 'Tofino',
    icon: '🏄',
    declared_start: '2026-10-03',
    declared_end: '2026-10-05',
    declared_lane_id: lane,
  });
  if (made.error) throw made.error;
  const anaRipple = await write(ana, 'Ana wrote', record, null);
  for (const [pool, poolLane, who] of [
    [crew, crewLane, [ben, cal]],
    [club, clubLane, [eve]],
  ] as const) {
    const placed = await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: record, pool_id: pool, pool_lane_id: poolLane });
    if (placed.error) throw placed.error;
    const together = await asUser(ana).rpc('set_placement_together', {
      p_splash: record,
      p_pool: pool,
      p_users: [...who],
      p_everyone: false,
    });
    if (together.error) throw together.error;
  }
  const benRipple = await write(ben, 'Ben in Crew', record, crew);
  const eveRipple = await write(eve, 'Eve in Club', record, club);
  const reacted = await asUser(cal)
    .from('ripple_reactions')
    .insert({ ripple_id: benRipple, user_id: cal, emoji: '🔥' });
  if (reacted.error) throw reacted.error;
  const laid = await asUser(ben).rpc('set_board_layout', {
    p_splash: record,
    p_pool: crew,
    p_patch: { label: { x: 0.2 } } as never,
  });
  if (laid.error) throw laid.error;
  return { ana, ben, cal, eve, crew, club, record, anaRipple, benRipple, eveRipple };
}

/** The joint record a pool's thread went to, as a member there reads it. */
async function jointIn(who: string, pool: string) {
  return (
    await asUser(who)
      .from('splashes')
      .select('id, title, icon, declared_start, declared_end, owner_id, pool_id')
      .eq('pool_id', pool)
      .is('owner_id', null)
  ).data!;
}

const sees = async (who: string, id: string): Promise<boolean> =>
  ((await asUser(who).from('ripples').select('id').eq('id', id)).data ?? []).length === 1;

/** Every pool's joint record holds its own thread, and members keep all of theirs. */
async function expectHandedOver(w: World, poolsHanded: ('crew' | 'club')[]): Promise<void> {
  for (const which of poolsHanded) {
    const [pool, member, ripple] =
      which === 'crew' ? [w.crew, w.ben, w.benRipple] : [w.club, w.eve, w.eveRipple];
    const joint = await jointIn(member, pool);
    expect(joint).toHaveLength(1);
    expect(joint[0]).toMatchObject({
      title: 'Tofino',
      icon: '🏄',
      declared_start: '2026-10-03',
      declared_end: '2026-10-05',
    });
    const moved = (
      await asUser(member).from('ripples').select('splash_id, thread_pool_id').eq('id', ripple)
    ).data!;
    expect(moved).toEqual([{ splash_id: joint[0].id, thread_pool_id: null }]);
    // The owner's ripples are never carried over.
    expect(await sees(member, w.anaRipple)).toBe(false);
    const onJoint = (
      await asUser(member).from('ripples').select('author_id').eq('splash_id', joint[0].id)
    ).data!;
    expect(onJoint.map((r) => r.author_id)).not.toContain(w.ana);
  }
  if (poolsHanded.includes('crew')) {
    const joint = (await jointIn(w.ben, w.crew))[0];
    // Cal's reaction followed Ben's ripple, and the pool's layout the record.
    expect(
      (await asUser(w.cal).from('ripple_reactions').select('emoji').eq('ripple_id', w.benRipple))
        .data,
    ).toEqual([{ emoji: '🔥' }]);
    const layout = (
      await asAdmin()
        .from('board_layouts')
        .select('splash_id')
        .eq('scope', 'pool')
        .eq('pool_id', w.crew)
    ).data!;
    expect(layout).toEqual([{ splash_id: joint.id }]);
    // Not a new post: nobody is told twice.
    const told = (
      await asAdmin()
        .from('notifications')
        .select('id')
        .eq('splash_id', joint.id)
        .eq('type', 'new_post')
        .eq('recipient_id', w.ben)
    ).data!;
    expect(told.length).toBeLessThanOrEqual(1);
  }
}

afterAll(async () => {
  const admin = asAdmin();
  await admin.from('ripples').delete().in('author_id', people);
  for (const id of pools) await admin.from('pools').delete().eq('id', id);
  for (const id of people) {
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('leaving with remove', () => {
  it('hands the one pool’s thread over; the other pool keeps the record as it was', async () => {
    const w = await world();
    const left = await asUser(w.ana).rpc('leave_pool', { p_pool: w.crew, p_keep: false });
    expect(left.error).toBeNull();
    await expectHandedOver(w, ['crew']);
    // Club: the record, Ana's ripple and Eve's side, untouched.
    expect(await sees(w.eve, w.eveRipple)).toBe(true);
    expect(await sees(w.eve, w.anaRipple)).toBe(true);
    expect(await jointIn(w.eve, w.club)).toHaveLength(0);
    // Ana keeps her record, her ripple, and Crew's thread as it stood.
    expect(
      (await asUser(w.ana).from('splashes').select('id').eq('id', w.record)).data,
    ).toHaveLength(1);
    expect(await sees(w.ana, w.anaRipple)).toBe(true);
    expect(await sees(w.ana, w.benRipple)).toBe(true);
    const joint = (await jointIn(w.ben, w.crew))[0];
    const later = await write(w.ben, 'Ben, after', joint.id, null);
    expect(await sees(w.ben, later)).toBe(true);
    expect(await sees(w.ana, later)).toBe(false);
    // Its Crew placement stays, switched off, naming where the thread went.
    const placed = (
      await asUser(w.ana)
        .from('splash_placements')
        .select('shared, handed_to')
        .eq('splash_id', w.record)
        .eq('pool_id', w.crew)
    ).data!;
    expect(placed).toEqual([{ shared: false, handed_to: joint.id }]);
  });

  it('hands each pool’s thread over separately when Ana leaves both', async () => {
    const w = await world();
    expect(
      (await asUser(w.ana).rpc('leave_pool', { p_pool: w.crew, p_keep: false })).error,
    ).toBeNull();
    expect(
      (await asUser(w.ana).rpc('leave_pool', { p_pool: w.club, p_keep: false })).error,
    ).toBeNull();
    await expectHandedOver(w, ['crew', 'club']);
    expect((await jointIn(w.ben, w.crew))[0].id).not.toBe((await jointIn(w.eve, w.club))[0].id);
    // Ben never reads Club's thread, nor Eve Crew's.
    expect(await sees(w.ben, w.eveRipple)).toBe(false);
    expect(await sees(w.eve, w.benRipple)).toBe(false);
  });

  it('leaves a record no one else wrote on to today’s rule', async () => {
    const w = await world();
    const quiet = crypto.randomUUID();
    await asUser(w.ana).from('splashes').insert({ id: quiet, owner_id: w.ana, title: 'Quiet' });
    const lane = (
      await asUser(w.ana).from('pool_lanes').select('id').eq('pool_id', w.crew).single()
    ).data!.id;
    await asUser(w.ana)
      .from('splash_placements')
      .insert({ splash_id: quiet, pool_id: w.crew, pool_lane_id: lane });
    await asUser(w.ana).rpc('leave_pool', { p_pool: w.crew, p_keep: false });
    const joints = (await jointIn(w.ben, w.crew)).map((j) => j.title);
    expect(joints).toEqual(['Tofino']);
    expect((await asUser(w.ben).from('splashes').select('id').eq('id', quiet)).data).toHaveLength(
      0,
    );
  });
});

describe('leaving with keep', () => {
  it('hands nothing over: the record stays in the pool with every side', async () => {
    const w = await world();
    expect(
      (await asUser(w.ana).rpc('leave_pool', { p_pool: w.crew, p_keep: true })).error,
    ).toBeNull();
    expect(await jointIn(w.ben, w.crew)).toHaveLength(0);
    expect(await sees(w.ben, w.benRipple)).toBe(true);
    expect(await sees(w.ben, w.anaRipple)).toBe(true);
    expect(
      (await asUser(w.ben).from('splashes').select('id').eq('id', w.record)).data,
    ).toHaveLength(1);
  });
});

describe('deleting the record', () => {
  it('hands every pool’s thread over, and Ana’s ripples go with the record', async () => {
    const w = await world();
    const gone = await asUser(w.ana).from('splashes').delete().eq('id', w.record);
    expect(gone.error).toBeNull();
    await expectHandedOver(w, ['crew', 'club']);
    expect((await asAdmin().from('ripples').select('id').eq('id', w.anaRipple)).data).toHaveLength(
      0,
    );
    // No post of one for anyone: their words stay together.
    expect(
      (await asAdmin().from('splashes').select('id').eq('owner_id', w.ben).eq('title', 'Tofino'))
        .data,
    ).toHaveLength(0);
  });
});

describe('deleting the account', () => {
  it('hands every pool’s thread over before Ana’s records and ripples go', async () => {
    const w = await world();
    const gone = await asAdmin().auth.admin.deleteUser(w.ana);
    expect(gone.error).toBeNull();
    await expectHandedOver(w, ['crew', 'club']);
    expect((await asAdmin().from('splashes').select('id').eq('id', w.record)).data).toHaveLength(0);
    expect((await asAdmin().from('ripples').select('id').eq('author_id', w.ana)).data).toHaveLength(
      0,
    );
  });
});
