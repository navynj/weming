import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * The Pool path (H23), proved through PostgREST with real user tokens: the
 * service role bypasses RLS, which is the only thing under test.
 *
 * Three fresh people, none of them Linked, so nothing seen here can have
 * arrived by the Link path: Ana opens the pool, Ben joins it, Cal stays
 * outside. Everything they write goes with them in afterAll.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const ANA_TRIPS = '0e000000-0000-0000-0000-0000000000a1';
const ANA_DAY = '0e000000-0000-0000-0000-0000000000a2';
const BEN_TRIPS = '0e000000-0000-0000-0000-0000000000b1';
const BEN_DAYS = '0e000000-0000-0000-0000-0000000000b2';
const CAL_TRIPS = '0e000000-0000-0000-0000-0000000000c1';

const ANA_OLD_POST = '0e100000-0000-0000-0000-0000000000a1';
const ANA_DAY_POST = '0e100000-0000-0000-0000-0000000000a2';
const BEN_OLD_POST = '0e100000-0000-0000-0000-0000000000b1';

let ana: string;
let ben: string;
let cal: string;
let dee: string | undefined;
let anaPostsBefore: number;
let pool: string;
let token: string;
let tripsLane: string;
let placedAtCreate: number;
const pools: string[] = [];

async function person(name: string, lane: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `pool-${name.replace(/\W/g, '')}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ id: lane, user_id: id, name: 'Trips' });
  return id;
}

async function post(owner: string, id: string, lane: string, note: string): Promise<void> {
  const client = asUser(owner);
  const { error } = await client
    .from('splashes')
    .insert({ id, owner_id: owner, title: note, declared_lane_id: lane });
  expect(error).toBeNull();
  const { error: blockError } = await client
    .from('ripples')
    .insert({ author_id: owner, note, splash_id: id });
  expect(blockError).toBeNull();
}

beforeAll(async () => {
  ana = await person('Ana Lee', ANA_TRIPS);
  ben = await person('Ben', BEN_TRIPS);
  cal = await person('Cal', CAL_TRIPS);
  await asAdmin().from('my_categories').insert({ id: ANA_DAY, user_id: ana, name: 'Day' });

  // Written before the pool exists: what "include my earlier records" is about.
  await post(ana, ANA_OLD_POST, ANA_TRIPS, 'Whistler');
  await post(ana, ANA_DAY_POST, ANA_DAY, 'a quiet day');
  await post(ben, BEN_OLD_POST, BEN_TRIPS, 'Squamish');
  const before = await asAdmin()
    .from('splashes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ana);
  anaPostsBefore = before.count!;

  const { data, error } = await asUser(ana).rpc('create_pool', {
    p_name: 'Weekend crew',
    p_kind: 'friends',
    p_lanes: [
      { name: 'Trips', icon: '🏕', description: 'Where we went', my_category_id: ANA_TRIPS },
      { name: 'Days', icon: '☀️', my_category_id: null },
    ],
    p_include_history: true,
  });
  expect(error).toBeNull();
  pool = data!;
  pools.push(pool);

  const lanes = await asUser(ana).from('pool_lanes').select('id, name').eq('pool_id', pool);
  tripsLane = lanes.data!.find((l) => l.name === 'Trips')!.id;

  // "Include my earlier records" is retired (0033): asked for, it places
  // nothing. Ana shares her Whistler post by hand, as Audience does.
  placedAtCreate = (
    await asAdmin().from('splash_placements').select('splash_id').eq('pool_id', pool)
  ).data!.length;
  const placed = await asUser(ana)
    .from('splash_placements')
    .insert({ splash_id: ANA_OLD_POST, pool_id: pool, pool_lane_id: tripsLane });
  expect(placed.error).toBeNull();

  const invite = await asUser(ana).rpc('create_invite', { p_pool: pool });
  expect(invite.error).toBeNull();
  token = invite.data![0].token;

  const join = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [{ pool_lane_id: tripsLane, my_category_id: BEN_TRIPS }],
    p_include_history: false,
  });
  expect(join.error).toBeNull();
});

afterAll(async () => {
  const admin = asAdmin();
  // The pool first: it takes its lanes, members, links, placements and joint
  // splashes (with their ripples) with it.
  for (const id of pools) await admin.from('pools').delete().eq('id', id);
  for (const id of [ana, ben, cal, dee].filter((x): x is string => Boolean(x))) {
    await admin.from('ripples').delete().eq('author_id', id);
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('outside the pool', () => {
  it('reads nothing at all', async () => {
    const client = asUser(cal);
    for (const table of [
      'pools',
      'pool_members',
      'pool_lanes',
      'splash_placements',
      'pool_invites',
      'lane_mappings',
    ] as const) {
      const { data } = await client.from(table).select('*');
      expect(data, table).toEqual([]);
    }
    const splashes = await client.from('splashes').select('id').in('owner_id', [ana, ben]);
    expect(splashes.data).toEqual([]);
    const ripples = await client.from('ripples').select('id').in('author_id', [ana, ben]);
    expect(ripples.data).toEqual([]);
  });

  it('cannot call the doors with a stranger’s pool', async () => {
    const { error } = await asUser(cal).rpc('create_invite', { p_pool: pool });
    expect(error?.code).toBe('42501');
  });
});

describe('placement', () => {
  it('never creates or modifies a record of mine when history is on', async () => {
    // 0012: joining places existing posts only, and makes none.
    const posts = await asAdmin()
      .from('splashes')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ana);
    expect(posts.count).toBe(anaPostsBefore);
  });

  it('places nothing earlier when history is asked for (0033), only what is shared by hand', async () => {
    expect(placedAtCreate).toBe(0);
    const { data } = await asUser(ben).from('splashes').select('id').eq('owner_id', ana);
    const ids = (data ?? []).map((s) => s.id);
    expect(ids).toContain(ANA_OLD_POST);
    expect(ids).not.toContain(ANA_DAY_POST);
  });

  it('places nothing earlier when history is off', async () => {
    const { data } = await asUser(ana).from('splashes').select('id').eq('owner_id', ben);
    expect(data).toEqual([]);
  });

  it('shows a member the placed post’s blocks', async () => {
    const { data } = await asUser(ben).from('ripples').select('note').eq('splash_id', ANA_OLD_POST);
    expect(data).toEqual([{ note: 'Whistler' }]);
  });

  it('records a view of a ripple a member sees through the pool, counting people (0023)', async () => {
    const block = (await asUser(ana).from('ripples').select('id').eq('splash_id', ANA_OLD_POST))
      .data![0].id;
    for (let i = 0; i < 2; i += 1) {
      expect((await asUser(ben).rpc('record_ripple_view', { rid: block })).error).toBeNull();
    }
    const { count } = await asUser(ana)
      .from('ripple_views')
      .select('*', { count: 'exact', head: true })
      .eq('ripple_id', block);
    expect(count).toBe(1);
    // Someone outside the pool cannot.
    expect((await asUser(cal).rpc('record_ripple_view', { rid: block })).error).not.toBeNull();
  });

  it('keeps every member’s lane links private', async () => {
    const { data } = await asUser(ben).from('lane_mappings').select('user_id');
    expect(new Set((data ?? []).map((m) => m.user_id))).toEqual(new Set([ben]));
  });

  it('places my record on any lane of a pool I am in, with no link (0033), author only', async () => {
    const days = await asUser(ana).from('pool_lanes').select('id').eq('name', 'Days').single();
    const mine = await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: ANA_DAY_POST, pool_id: pool, pool_lane_id: days.data!.id });
    expect(mine.error).toBeNull();
    // Not the author: refused, even as a member.
    const theirs = await asUser(ben)
      .from('splash_placements')
      .update({ pool_lane_id: tripsLane })
      .eq('splash_id', ANA_DAY_POST)
      .select('splash_id');
    expect(theirs.data ?? []).toEqual([]);
    // Not a member: refused.
    await post(cal, '0e100000-0000-0000-0000-0000000000c1', CAL_TRIPS, 'Tofino');
    const outside = await asUser(cal).from('splash_placements').insert({
      splash_id: '0e100000-0000-0000-0000-0000000000c1',
      pool_id: pool,
      pool_lane_id: tripsLane,
    });
    expect(outside.error?.code).toBe('42501');
    await asUser(ana).from('splash_placements').delete().eq('splash_id', ANA_DAY_POST);
  });

  it('switches one post off and on', async () => {
    const off = await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .eq('splash_id', ANA_OLD_POST)
      .eq('pool_id', pool);
    expect(off.error).toBeNull();
    const hidden = await asUser(ben).from('splashes').select('id').eq('id', ANA_OLD_POST);
    expect(hidden.data).toEqual([]);

    await asUser(ana)
      .from('splash_placements')
      .update({ shared: true })
      .eq('splash_id', ANA_OLD_POST)
      .eq('pool_id', pool);
    const shown = await asUser(ben).from('splashes').select('id').eq('id', ANA_OLD_POST);
    expect(shown.data).toHaveLength(1);
  });

  it('never shows a locked block, even on a placed post', async () => {
    const { data: block } = await asUser(ana)
      .from('ripples')
      .insert({ author_id: ana, note: 'only me', splash_id: ANA_OLD_POST })
      .select('id')
      .single();
    await asUser(ana).from('ripple_audience').insert({ ripple_id: block!.id, target_type: 'lock' });
    const { data } = await asUser(ben).from('ripples').select('id').eq('id', block!.id);
    expect(data).toEqual([]);
  });
});

describe('a post’s audience (H23)', () => {
  it('lets members read a ripple added later to a shared post', async () => {
    const { data: later } = await asUser(ana)
      .from('ripples')
      .insert({
        author_id: ana,
        note: 'one more day',
        splash_id: ANA_OLD_POST,
      })
      .select('id')
      .single();
    const { data } = await asUser(ben).from('ripples').select('note').eq('id', later!.id);
    expect(data).toEqual([{ note: 'one more day' }]);
  });

  it('hides every ripple of a post switched off, and shows them again switched on', async () => {
    const visible = async (): Promise<number> =>
      (await asUser(ben).from('ripples').select('id').eq('splash_id', ANA_OLD_POST)).data!.length;
    expect(await visible()).toBeGreaterThan(1);

    await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .eq('splash_id', ANA_OLD_POST)
      .eq('pool_id', pool);
    expect(await visible()).toBe(0);

    await asUser(ana)
      .from('splash_placements')
      .update({ shared: true })
      .eq('splash_id', ANA_OLD_POST)
      .eq('pool_id', pool);
    expect(await visible()).toBeGreaterThan(1);
  });
});

describe('Just mine (0014)', () => {
  const OWN = '0e300000-0000-0000-0000-000000000001';

  it('makes my splash on a pool lane, placed and shared there, with a ripple and no lane of mine', async () => {
    const made = await asUser(ben).rpc('create_own_pool_splash', {
      p_id: OWN,
      p_pool: pool,
      p_pool_lane: tripsLane,
      p_title: 'just mine',
    });
    expect(made.error).toBeNull();
    const block = await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, note: 'mine alone', splash_id: OWN });
    expect(block.error).toBeNull();

    const row = await asAdmin()
      .from('splashes')
      .select('owner_id, own_pool_id, declared_lane_id')
      .eq('id', OWN)
      .single();
    expect(row.data).toEqual({ owner_id: ben, own_pool_id: pool, declared_lane_id: null });
    const placement = await asAdmin()
      .from('splash_placements')
      .select('pool_id, pool_lane_id, shared')
      .eq('splash_id', OWN);
    expect(placement.data).toEqual([{ pool_id: pool, pool_lane_id: tripsLane, shared: true }]);
    // No link was made for it.
    const links = await asUser(ben)
      .from('lane_mappings')
      .select('pool_lane_id')
      .eq('pool_id', pool);
    expect(links.data).toEqual([{ pool_lane_id: tripsLane }]);
  });

  it('is read by members and by nobody outside', async () => {
    const member = await asUser(ana).from('ripples').select('note').eq('splash_id', OWN);
    // Ana may have left in an earlier case; Ben's own read is the member read then.
    const reader = member.data?.length
      ? member
      : await asUser(ben).from('ripples').select('note').eq('splash_id', OWN);
    expect(reader.data).toEqual([{ note: 'mine alone' }]);
    expect((await asUser(cal).from('splashes').select('id').eq('id', OWN)).data).toEqual([]);
    expect((await asUser(cal).from('ripples').select('id').eq('splash_id', OWN)).data).toEqual([]);
  });

  it('is always shared to its pool, and takes no lane of mine', async () => {
    const off = await asUser(ben)
      .from('splash_placements')
      .update({ shared: false })
      .eq('splash_id', OWN)
      .eq('pool_id', pool);
    expect(off.error?.code).toBe('42501');
    const laned = await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, category_id: BEN_TRIPS, note: 'with a lane', splash_id: OWN });
    expect(laned.error?.code).toBe('23514');
    // Every ripple belongs to a splash (H24).
    const lone = await asUser(ben).from('ripples').insert({ author_id: ben, note: 'no lane' });
    expect(lone.error?.code).toBe('23514');
  });

  it('goes everywhere at once when deleted', async () => {
    expect((await asUser(ben).from('splashes').delete().eq('id', OWN)).error).toBeNull();
    expect(
      (await asAdmin().from('splash_placements').select('splash_id').eq('splash_id', OWN)).data,
    ).toEqual([]);
    expect((await asAdmin().from('ripples').select('id').eq('splash_id', OWN)).data).toEqual([]);
  });
});

describe('a ripple carries no lane of its own (H24)', () => {
  const DAYS_JOINT = '0e400000-0000-0000-0000-000000000001';
  let days: string;

  it('saves on a joint splash with no lane, and a link moves nothing either way', async () => {
    days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single()).data!.id;
    await asUser(ben).rpc('create_joint_splash', {
      p_id: DAYS_JOINT,
      p_pool: pool,
      p_pool_lane: days,
      p_title: 'Daily',
    });
    const saved = await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, note: 'unlinked day', splash_id: DAYS_JOINT })
      .select('id, category_id')
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data!.category_id).toBeNull();

    const lane = async (): Promise<string | null> =>
      (await asUser(ben).from('ripples').select('category_id').eq('id', saved.data!.id).single())
        .data!.category_id;
    // → in: where the joint splash shows on Home is derived from this link;
    // the ripple itself stays as it is.
    const linked = await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [
        { pool_lane_id: tripsLane, my_category_id: BEN_TRIPS },
        // Trips already sends Ben's lane into Trips (0019): Days only brings in.
        { pool_lane_id: days, my_category_id: BEN_TRIPS, direction: 'in' },
      ],
    });
    expect(linked.error).toBeNull();
    expect(await lane()).toBeNull();

    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [{ pool_lane_id: tripsLane, my_category_id: BEN_TRIPS }],
    });
    expect(await lane()).toBeNull();
  });

  it('refuses a lane or a date of a ripple’s own, on any splash', async () => {
    const laned = await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, category_id: BEN_TRIPS, note: 'my lane', splash_id: BEN_OLD_POST });
    expect(laned.error?.code).toBe('23514');
    const dated = await asUser(ben).from('ripples').insert({
      author_id: ben,
      occurred_on: '2026-10-20',
      note: 'my day',
      splash_id: BEN_OLD_POST,
    });
    expect(dated.error?.code).toBe('23514');
    const plain = await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, note: 'the post’s lane and day', splash_id: BEN_OLD_POST });
    expect(plain.error).toBeNull();
  });
});

describe('links and their markers (0033)', () => {
  const HOME_JOINT = '0e500000-0000-0000-0000-000000000001';

  const markers = async (who: string) =>
    (
      await asUser(who)
        .from('lane_mappings')
        .select('pool_lane_id, my_category_id, direction, is_default, share_by_default, is_home')
        .eq('pool_id', pool)
    ).data!;

  it('makes a new link `in`, the default for its lane, sharing nothing by default, home nowhere', async () => {
    const links = await markers(ben);
    expect(links).toEqual([
      {
        pool_lane_id: tripsLane,
        my_category_id: BEN_TRIPS,
        direction: 'in',
        is_default: true,
        share_by_default: false,
        is_home: false,
      },
    ]);
  });

  it('moves no ripple when a home lane is marked: the marker alone places the joint record (H24)', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    await asAdmin().from('my_categories').insert({ id: BEN_DAYS, user_id: ben, name: 'Days' });
    const links = (home: boolean) => [
      { pool_lane_id: tripsLane, my_category_id: BEN_TRIPS },
      { pool_lane_id: days, my_category_id: BEN_DAYS, is_home: home },
    ];
    expect(
      (await asUser(ben).rpc('set_lane_links', { p_pool: pool, p_links: links(false) })).error,
    ).toBeNull();
    await asUser(ben).rpc('create_joint_splash', {
      p_id: HOME_JOINT,
      p_pool: pool,
      p_pool_lane: days,
      p_title: 'Home days',
    });
    const ripple = await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, note: 'days', splash_id: HOME_JOINT })
      .select('id')
      .single();
    await asUser(ben).rpc('set_lane_links', { p_pool: pool, p_links: links(true) });
    expect((await markers(ben)).find((l) => l.pool_lane_id === days)!.is_home).toBe(true);
    const after = await asUser(ben)
      .from('ripples')
      .select('category_id')
      .eq('id', ripple.data!.id)
      .single();
    expect(after.data!.category_id).toBeNull();
    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [{ pool_lane_id: tripsLane, my_category_id: BEN_TRIPS }],
    });
  });

  it('switches no placement off when a lane is unlinked or re-marked', async () => {
    const post = '0e500000-0000-0000-0000-000000000002';
    await asUser(ben)
      .from('splashes')
      .insert({ id: post, owner_id: ben, title: 'trip', declared_lane_id: BEN_TRIPS });
    await asUser(ben).from('ripples').insert({ author_id: ben, note: 'trip', splash_id: post });
    await asUser(ben)
      .from('splash_placements')
      .insert({ splash_id: post, pool_id: pool, pool_lane_id: tripsLane });
    const placement = async () =>
      (
        await asUser(ben)
          .from('splash_placements')
          .select('shared, pool_lane_id')
          .eq('splash_id', post)
          .single()
      ).data!;

    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [{ pool_lane_id: tripsLane, my_category_id: BEN_TRIPS, direction: 'in' }],
    });
    expect(await placement()).toEqual({ shared: true, pool_lane_id: tripsLane });
    await asUser(ben).rpc('set_lane_links', { p_pool: pool, p_links: [] });
    expect(await placement()).toEqual({ shared: true, pool_lane_id: tripsLane });

    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [{ pool_lane_id: tripsLane, my_category_id: BEN_TRIPS }],
    });
  });

  it('reads the old shape until the switch: both/in mark home, out/both the default, sharing kept', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [
        {
          pool_lane_id: tripsLane,
          my_category_id: BEN_TRIPS,
          is_default: true,
          share_by_default: true,
        },
      ],
    });
    const { error } = await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [
        { pool_lane_id: tripsLane, my_category_id: BEN_TRIPS, direction: 'both' },
        { pool_lane_id: days, my_category_id: BEN_DAYS, direction: 'out' },
      ],
    });
    expect(error).toBeNull();
    const links = await markers(ben);
    expect(links.find((l) => l.pool_lane_id === tripsLane)).toMatchObject({
      is_home: true,
      is_default: true,
      share_by_default: true,
    });
    expect(links.find((l) => l.pool_lane_id === days)).toMatchObject({
      is_home: false,
      is_default: true,
      share_by_default: false,
    });
    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [{ pool_lane_id: tripsLane, my_category_id: BEN_TRIPS }],
    });
  });

  it('keeps one default per lane and pool: the oldest link takes over when it goes', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    // Two links from Trips (in, so 0019 allows it); Days is the default.
    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [
        { pool_lane_id: tripsLane, my_category_id: BEN_TRIPS },
        { pool_lane_id: days, my_category_id: BEN_TRIPS, is_default: true, share_by_default: true },
      ],
    });
    let links = await markers(ben);
    expect(links.filter((l) => l.is_default).map((l) => l.pool_lane_id)).toEqual([days]);
    // Two defaults at once: refused.
    const both = await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [
        { pool_lane_id: tripsLane, my_category_id: BEN_TRIPS, is_default: true },
        { pool_lane_id: days, my_category_id: BEN_TRIPS, is_default: true },
      ],
    });
    expect(both.error?.code).toBe('23505');
    // The default unlinked: Trips takes it over, sharing off.
    await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [{ pool_lane_id: tripsLane, my_category_id: BEN_TRIPS }],
    });
    links = await markers(ben);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ is_default: true, share_by_default: false });
    // A marker cleared by hand comes back at commit.
    await asUser(ben)
      .from('lane_mappings')
      .update({ is_default: false, share_by_default: null })
      .eq('pool_id', pool);
    expect((await markers(ben))[0].is_default).toBe(true);
  });
});

describe('together (0033)', () => {
  const TOGETHER = '0e500000-0000-0000-0000-000000000003';

  it('invites the maker, then any current member adds members, and nobody else', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    const made = await asUser(ben).rpc('create_joint_splash', {
      p_id: TOGETHER,
      p_pool: pool,
      p_pool_lane: days,
      p_title: 'Together',
    });
    expect(made.error).toBeNull();
    const invitees = async () =>
      (await asUser(ana).from('joint_invitees').select('user_id').eq('splash_id', TOGETHER))
        .data!.map((i) => i.user_id)
        .sort();
    expect(await invitees()).toEqual([ben]);

    // Ben adds Ana; Ana (a member, not its maker) may add too.
    expect(
      (await asUser(ben).rpc('add_joint_invitees', { p_splash: TOGETHER, p_users: [ana] })).error,
    ).toBeNull();
    expect(
      (await asUser(ana).rpc('add_joint_invitees', { p_splash: TOGETHER, p_users: [ana, ben] }))
        .error,
    ).toBeNull();
    expect(await invitees()).toEqual([ana, ben].sort());

    // Cal is no member: he cannot be added, cannot add, and reads nothing.
    const notMember = await asUser(ben).rpc('add_joint_invitees', {
      p_splash: TOGETHER,
      p_users: [cal],
    });
    expect(notMember.error?.code).toBe('42501');
    const outsider = await asUser(cal).rpc('add_joint_invitees', {
      p_splash: TOGETHER,
      p_users: [cal],
    });
    expect(outsider.error?.code).toBe('42501');
    expect((await asUser(cal).from('joint_invitees').select('*')).data).toEqual([]);
    // Nobody writes the table directly.
    const direct = await asUser(ana)
      .from('joint_invitees')
      .insert({ splash_id: TOGETHER, user_id: ana });
    expect(direct.error).not.toBeNull();

    await asUser(ben).rpc('delete_joint_splash', { p_splash: TOGETHER });
  });

  it('Everyone invites every current member, one who joins later too; picks do not', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    const EVERYONE = '0e500000-0000-0000-0000-000000000004';
    const PICKED = '0e500000-0000-0000-0000-000000000005';
    // As the new app makes them: Everyone said explicitly, off.
    for (const id of [EVERYONE, PICKED]) {
      const made = await asUser(ben).rpc('create_together_splash', {
        p_id: id,
        p_pool: pool,
        p_pool_lane: days,
        p_title: id === EVERYONE ? 'Everyone' : 'Picked',
        p_icon: '',
        p_declared_start: null as unknown as string,
        p_invite_all: false,
      });
      expect(made.error).toBeNull();
    }
    expect(
      (
        await asUser(ben).rpc('add_joint_invitees', {
          p_splash: EVERYONE,
          p_users: [],
          p_everyone: true,
        })
      ).error,
    ).toBeNull();
    const together = async (id: string) =>
      ((await asUser(ben).rpc('joint_together', { p_splashes: [id] })).data ?? [])
        .map((row) => row.user_id)
        .sort();
    const before = await together(EVERYONE);
    expect(before).toContain(ben);
    expect(await together(PICKED)).toEqual([ben]);

    // Dee joins after both were made: Everyone takes her in, the picks do not.
    dee = await person('Dee', '0e000000-0000-0000-0000-0000000000d1');
    expect(
      (
        await asUser(dee).rpc('join_pool', {
          p_token: token,
          p_links: [],
          p_include_history: false,
        })
      ).error,
    ).toBeNull();
    expect(await together(EVERYONE)).toEqual([...before, dee].sort());
    expect(await together(PICKED)).toEqual([ben]);

    // Everyone stays on: nobody is taken off by hand.
    const off = await asUser(ben)
      .from('splashes')
      .update({ joint_invite_all: false })
      .eq('id', EVERYONE);
    expect(off.error?.code).toBe('42501');

    // Dee leaves: she drops out of the open slots.
    await asUser(dee).rpc('leave_pool', { p_pool: pool, p_keep: true });
    expect(await together(EVERYONE)).toEqual(before);

    for (const id of [EVERYONE, PICKED]) {
      await asUser(ben).rpc('delete_joint_splash', { p_splash: id });
    }
  });

  it('keeps the old app inviting everyone until the deploy; my own record never is', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    const OLD = '0e500000-0000-0000-0000-000000000006';
    const MINE = '0e500000-0000-0000-0000-000000000007';
    // The old app's call: the column's default, Everyone.
    await asUser(ben).rpc('create_joint_splash', {
      p_id: OLD,
      p_pool: pool,
      p_pool_lane: days,
      p_title: 'From the old app',
    });
    const flag = async (id: string) =>
      (await asAdmin().from('splashes').select('joint_invite_all').eq('id', id).single()).data!
        .joint_invite_all;
    expect(await flag(OLD)).toBe(true);
    // A record of my own, inserted with the default: never together.
    expect(
      (
        await asUser(ben)
          .from('splashes')
          .insert({ id: MINE, owner_id: ben, title: 'mine', declared_lane_id: BEN_TRIPS })
      ).error,
    ).toBeNull();
    expect(await flag(MINE)).toBe(false);
    // The old app's conversion too: Everyone.
    await asUser(ben)
      .from('splash_placements')
      .insert({ splash_id: MINE, pool_id: pool, pool_lane_id: tripsLane });
    expect(
      (await asUser(ben).rpc('splash_to_joint', { p_splash: MINE, p_pool_lane: days })).error,
    ).toBeNull();
    expect(await flag(MINE)).toBe(true);
    for (const id of [OLD, MINE]) await asUser(ben).rpc('delete_joint_splash', { p_splash: id });
  });

  it('holds per-pool invitees on my record beside a joint record’s own (0034 shape, 0035 use)', async () => {
    const admin = asAdmin();
    const mine = { splash_id: ANA_OLD_POST, pool_id: pool, user_id: ben };
    // Nothing writes these yet (0035): the shape alone, as the service role.
    // A per-pool row hangs off a placement: none, refused.
    const loose = await admin
      .from('joint_invitees')
      .insert({ splash_id: ANA_DAY_POST, pool_id: pool, user_id: ben });
    expect(loose.error?.code).toBe('23503');
    expect((await admin.from('joint_invitees').insert(mine)).error).toBeNull();
    // Once per pool and person.
    expect((await admin.from('joint_invitees').insert(mine)).error?.code).toBe('23505');
    // Who reads these rows is 0035's to settle, with the key that lets one
    // person be invited in two pools.
    // It is not a joint record's: "together" reads joint rows alone.
    expect((await asUser(ben).rpc('joint_together', { p_splashes: [ANA_OLD_POST] })).data).toEqual(
      [],
    );
    await admin.from('joint_invitees').delete().match(mine);
  });

  it('keeps the pool setting, any current member, and nobody outside', async () => {
    const read = async () =>
      (await asAdmin().from('pools').select('invite_all_by_default').eq('id', pool).single()).data!
        .invite_all_by_default;
    expect(await read()).toBe(false);
    expect(
      (await asUser(ben).rpc('set_pool_invite_all', { p_pool: pool, p_on: true })).error,
    ).toBeNull();
    expect(await read()).toBe(true);
    const outside = await asUser(cal).rpc('set_pool_invite_all', { p_pool: pool, p_on: false });
    expect(outside.error?.code).toBe('42501');
    expect(await read()).toBe(true);
    await asUser(ben).rpc('set_pool_invite_all', { p_pool: pool, p_on: false });
  });
});

describe('editing a joint splash (review)', () => {
  it('lets any current member change its title and icon, and nobody outside', async () => {
    const joint = '0e600000-0000-0000-0000-000000000001';
    await asUser(ana).rpc('create_joint_splash', {
      p_id: joint,
      p_pool: pool,
      p_pool_lane: tripsLane,
      p_title: 'Opened by Ana',
    });
    // Ben did not open it, and edits it all the same.
    const edited = await asUser(ben)
      .from('splashes')
      .update({ title: 'Renamed by Ben', icon: '🎲' })
      .eq('id', joint)
      .select('title, icon')
      .single();
    expect(edited.data).toEqual({ title: 'Renamed by Ben', icon: '🎲' });
    const outside = await asUser(cal)
      .from('splashes')
      .update({ title: 'Cal was here' })
      .eq('id', joint)
      .select('id');
    expect(outside.data).toEqual([]);
  });
});

describe('writing', () => {
  it('refuses a block written into another member’s post', async () => {
    const { error } = await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, note: 'mine?', splash_id: ANA_OLD_POST });
    // Refused: with no pool named, the thread rule says so first (0035);
    // naming one he is not invited in, RLS does (per-pool-invitees-db).
    expect(error?.code).toBe('23514');
  });

  it('lets members write into a joint splash, and only members', async () => {
    const joint = '0e200000-0000-0000-0000-000000000001';
    const made = await asUser(ben).rpc('create_joint_splash', {
      p_id: joint,
      p_pool: pool,
      p_pool_lane: tripsLane,
      p_title: 'Tofino plan',
    });
    expect(made.error).toBeNull();

    for (const who of [ana, ben]) {
      const { error } = await asUser(who)
        .from('ripples')
        .insert({ author_id: who, note: `${who} in`, splash_id: joint });
      expect(error).toBeNull();
    }
    const outsider = await asUser(cal)
      .from('ripples')
      .insert({ author_id: cal, note: 'let me in', splash_id: joint });
    expect(outsider.error?.code).toBe('42501');

    const both = await asUser(ana).from('ripples').select('author_id').eq('splash_id', joint);
    expect(both.data).toHaveLength(2);

    // Ben cannot delete what Ana wrote along with his own.
    const refused = await asUser(ben).rpc('delete_joint_splash', { p_splash: joint });
    expect(refused.error?.message).toMatch(/1 ripple by other members/);
  });

  it('refuses a joint splash on another pool’s lane', async () => {
    const other = await asUser(cal).rpc('create_pool', {
      p_name: 'Elsewhere',
      p_kind: 'study',
      p_lanes: [{ name: 'Notes', my_category_id: null }],
      p_include_history: false,
    });
    pools.push(other.data!);
    const { error } = await asUser(cal).rpc('create_joint_splash', {
      p_id: '0e200000-0000-0000-0000-000000000003',
      p_pool: other.data!,
      p_pool_lane: tripsLane,
      p_title: 'stolen lane',
    });
    expect(error?.code).toBe('42501');
  });
});

describe('invites', () => {
  it('previews only the pool’s name and its members’ initials', async () => {
    const { data } = await asUser(cal).rpc('invite_preview', { p_token: token });
    expect(data).toEqual([{ pool_name: 'Weekend crew', member_initials: ['AL', 'BE'] }]);
  });

  it('opens nothing once expired', async () => {
    const fresh = await asUser(ana).rpc('create_invite', { p_pool: pool });
    const expiring = fresh.data![0].token;
    await asAdmin()
      .from('pool_invites')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('token', expiring);

    const preview = await asUser(cal).rpc('invite_preview', { p_token: expiring });
    expect(preview.data).toEqual([]);
    const join = await asUser(cal).rpc('join_pool', {
      p_token: expiring,
      p_links: [],
      p_include_history: false,
    });
    expect(join.error?.code).toBe('42501');
  });

  it('opens nothing once revoked', async () => {
    const fresh = await asUser(ana).rpc('create_invite', { p_pool: pool });
    const row = await asUser(ana)
      .from('pool_invites')
      .select('id')
      .eq('token', fresh.data![0].token)
      .single();
    await asUser(ana).rpc('revoke_invite', { p_invite: row.data!.id });

    const join = await asUser(cal).rpc('join_pool', {
      p_token: fresh.data![0].token,
      p_links: [],
      p_include_history: false,
    });
    expect(join.error?.code).toBe('42501');
  });
});

describe('the creator’s account', () => {
  it('can go without taking the pool or anyone’s joint ripples', async () => {
    dee = await person('Dee', '0e000000-0000-0000-0000-0000000000d1');
    const made = await asUser(dee).rpc('create_pool', {
      p_name: 'Dee’s pool',
      p_kind: 'study',
      p_lanes: [{ name: 'Notes', my_category_id: null }],
      p_include_history: false,
    });
    const deePool = made.data!;
    pools.push(deePool);
    const lanes = await asUser(dee).from('pool_lanes').select('id').eq('pool_id', deePool);
    const invite = await asUser(dee).rpc('create_invite', { p_pool: deePool });
    await asUser(ben).rpc('join_pool', {
      p_token: invite.data![0].token,
      p_links: [{ pool_lane_id: lanes.data![0].id, my_category_id: BEN_TRIPS }],
      p_include_history: false,
    });
    const joint = '0e200000-0000-0000-0000-000000000002';
    await asUser(ben).rpc('create_joint_splash', {
      p_id: joint,
      p_pool: deePool,
      p_pool_lane: lanes.data![0].id,
      p_title: 'Reading list',
    });
    await asUser(ben)
      .from('ripples')
      .insert({ author_id: ben, note: 'Ben reads', splash_id: joint });

    await asAdmin().auth.admin.deleteUser(dee);
    dee = undefined;

    const pool = await asUser(ben).from('pools').select('owner_id').eq('id', deePool).single();
    expect(pool.data).toEqual({ owner_id: null });
    const words = await asUser(ben).from('ripples').select('note').eq('splash_id', joint);
    expect(words.data).toEqual([{ note: 'Ben reads' }]);
  });
});

describe('leaving', () => {
  it('hides a leaver’s placements when they remove them, and keeps them when they keep', async () => {
    const left = await asUser(ana).rpc('leave_pool', { p_pool: pool, p_keep: false });
    expect(left.error).toBeNull();

    // The leaver loses the pool at once, and keeps every post of their own.
    expect((await asUser(ana).from('pools').select('id').eq('id', pool)).data).toEqual([]);
    expect(
      (await asUser(ana).from('splashes').select('id').eq('id', ANA_OLD_POST)).data,
    ).toHaveLength(1);

    const removed = await asUser(ben).from('splashes').select('id').eq('id', ANA_OLD_POST);
    expect(removed.data).toEqual([]);

    // Back in, then out again keeping them.
    const back = await asUser(ana).rpc('join_pool', {
      p_token: token,
      p_links: [{ pool_lane_id: tripsLane, my_category_id: ANA_TRIPS }],
      p_include_history: false,
    });
    expect(back.error).toBeNull();
    await asUser(ana).rpc('leave_pool', { p_pool: pool, p_keep: true });

    const kept = await asUser(ben).from('splashes').select('id').eq('id', ANA_OLD_POST);
    expect(kept.data).toHaveLength(1);
    const members = await asUser(ben)
      .from('pool_members')
      .select('user_id, left_at, keep_on_leave')
      .eq('pool_id', pool);
    const former = members.data!.find((m) => m.user_id === ana)!;
    expect(former.left_at).not.toBeNull();
    expect(former.keep_on_leave).toBe(true);
  });
});

describe('one sender per lane of mine (0019)', () => {
  it('refuses a second pool lane taking the same lane as a sender', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    const { error } = await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [
        { pool_lane_id: tripsLane, my_category_id: BEN_TRIPS, direction: 'both' },
        { pool_lane_id: days, my_category_id: BEN_TRIPS, direction: 'out' },
      ],
    });
    expect(error?.code).toBe('23505');
    expect(error?.message).toMatch(/lane_mappings_one_sender/);
  });

  it('lets the same lane bring in from several pool lanes', async () => {
    const days = (await asUser(ben).from('pool_lanes').select('id').eq('name', 'Days').single())
      .data!.id;
    const { error } = await asUser(ben).rpc('set_lane_links', {
      p_pool: pool,
      p_links: [
        { pool_lane_id: tripsLane, my_category_id: BEN_TRIPS, direction: 'both' },
        { pool_lane_id: days, my_category_id: BEN_TRIPS, direction: 'in' },
      ],
    });
    expect(error).toBeNull();
  });
});

describe('renaming a pool (0021)', () => {
  it('is refused to a member who is not its creator', async () => {
    const { error } = await asUser(ben).rpc('rename_pool', { p_pool: pool, p_name: 'Bens' });
    expect(error?.code).toBe('42501');
  });
});
