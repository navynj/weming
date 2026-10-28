import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * Per-pool invitees on my records (0035, SHARING-V2 §7–8), through PostgREST
 * with real user tokens. Ana's record is shared to Crew (Ben, Cal) and Club
 * (Ben, Eve); Dee is in neither. Ana invites per pool; the invited write
 * their side there, read only in that pool and by Ana.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

let ana: string;
let ben: string;
let cal: string;
let eve: string;
let dee: string;
let crew: string;
let club: string;
let crewLane: string;
let clubLane: string;
const people: string[] = [];
const pools: string[] = [];
const RECORD = crypto.randomUUID();

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `ppi-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: id, name: 'Day' });
  people.push(id);
  return id;
}

async function lane(who: string): Promise<string> {
  return (await asAdmin().from('my_categories').select('id').eq('user_id', who).limit(1).single())
    .data!.id;
}

async function openPool(
  name: string,
  laneName: string,
  members: string[],
): Promise<[string, string]> {
  const made = await asUser(ana).rpc('create_pool', {
    p_name: name,
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: laneName, icon: '🎲', my_category_id: null }],
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
  const poolLane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', id).single())
    .data!.id;
  return [id, poolLane];
}

/** A ripple on Ana's record, written in a pool (or as Ana, in none). */
async function write(who: string, note: string, pool: string | null, splash = RECORD) {
  return asUser(who)
    .from('ripples')
    .insert({ author_id: who, note, splash_id: splash, thread_pool_id: pool })
    .select('id')
    .single();
}

const sees = async (who: string, id: string): Promise<boolean> =>
  ((await asUser(who).from('ripples').select('id').eq('id', id)).data ?? []).length === 1;

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  eve = await person('Eve');
  dee = await person('Dee');
  [crew, crewLane] = await openPool('Crew', 'Trips', [ben, cal]);
  [club, clubLane] = await openPool('Club', 'Games', [ben, eve]);
  const made = await asUser(ana)
    .from('splashes')
    .insert({ id: RECORD, owner_id: ana, title: 'Tofino', declared_lane_id: await lane(ana) });
  if (made.error) throw made.error;
  await write(ana, 'Ana wrote', null);
  for (const [pool, poolLane] of [
    [crew, crewLane],
    [club, clubLane],
  ]) {
    const placed = await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: RECORD, pool_id: pool, pool_lane_id: poolLane });
    if (placed.error) throw placed.error;
  }
});

afterAll(async () => {
  const admin = asAdmin();
  for (const id of pools) {
    await admin.from('ripples').delete().in('author_id', people);
    await admin.from('pools').delete().eq('id', id);
  }
  for (const id of people) {
    await admin.from('ripples').delete().eq('author_id', id);
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('writing my record’s side, per pool', () => {
  it('refuses anyone not invited in that pool, and Ana herself writing in a pool', async () => {
    expect((await write(ben, 'not yet', crew)).error?.code).toBe('42501');
    expect((await write(ben, 'no pool', null)).error).not.toBeNull();
    expect((await write(dee, 'outside', crew)).error).not.toBeNull();
    expect((await write(ana, 'mine, in a pool', crew)).error?.code).toBe('23514');
  });

  it('lets the author alone set With, to current members of that pool', async () => {
    const theirs = await asUser(ben).rpc('set_placement_together', {
      p_splash: RECORD,
      p_pool: crew,
      p_users: [ben],
      p_everyone: false,
    });
    expect(theirs.error?.code).toBe('42501');
    const outsider = await asUser(ana).rpc('set_placement_together', {
      p_splash: RECORD,
      p_pool: crew,
      p_users: [eve],
      p_everyone: false,
    });
    expect(outsider.error?.code).toBe('42501');
    const ok = await asUser(ana).rpc('set_placement_together', {
      p_splash: RECORD,
      p_pool: crew,
      p_users: [ben],
      p_everyone: false,
    });
    expect(ok.error).toBeNull();
    const together = (await asUser(ana).rpc('placement_together', { p_splashes: [RECORD] })).data!;
    expect(together).toEqual([{ splash_id: RECORD, pool_id: crew, user_id: ben }]);
  });

  it('lets the invited write there, and only there', async () => {
    expect((await write(ben, 'Ben in Crew', crew)).error).toBeNull();
    // Ben is in Club too, but not invited there.
    expect((await write(ben, 'Ben in Club', club)).error?.code).toBe('42501');
    // Cal is in Crew but not invited.
    expect((await write(cal, 'Cal in Crew', crew)).error?.code).toBe('42501');
  });

  it('Everyone invites every current member of that pool', async () => {
    await asUser(ana).rpc('set_placement_together', {
      p_splash: RECORD,
      p_pool: club,
      p_users: [],
      p_everyone: true,
    });
    expect((await write(eve, 'Eve in Club', club)).error).toBeNull();
    const together = (await asUser(ana).rpc('placement_together', { p_splashes: [RECORD] })).data!;
    expect(
      together
        .filter((t) => t.pool_id === club)
        .map((t) => t.user_id)
        .sort(),
    ).toEqual([ben, eve].sort());
  });
});

describe('reading my record’s sides', () => {
  let benCrew: string;
  let eveClub: string;
  beforeAll(async () => {
    benCrew = (await asUser(ben).from('ripples').select('id').eq('note', 'Ben in Crew').single())
      .data!.id;
    eveClub = (await asUser(eve).from('ripples').select('id').eq('note', 'Eve in Club').single())
      .data!.id;
  });

  it('shows a member’s ripple to that pool and to me, nowhere else', async () => {
    expect(await sees(ana, benCrew)).toBe(true);
    expect(await sees(cal, benCrew)).toBe(true);
    expect(await sees(eve, benCrew)).toBe(false);
    expect(await sees(dee, benCrew)).toBe(false);
    expect(await sees(eve, eveClub)).toBe(true);
    expect(await sees(cal, eveClub)).toBe(false);
    // My own ripples, in every pool it is shared to.
    const mine = (await asUser(ana).from('ripples').select('id').eq('note', 'Ana wrote').single())
      .data!.id;
    for (const who of [ben, cal, eve]) expect(await sees(who, mine), who).toBe(true);
  });

  it('lets reactions follow the ripple’s one pool', async () => {
    expect((await asUser(cal).rpc('can_respond', { rid: benCrew })).data).toBe(true);
    expect((await asUser(eve).rpc('can_respond', { rid: benCrew })).data).toBe(false);
  });

  it('switched off: hidden from the pool, never deleted, kept for me and its author; on again: back', async () => {
    const off = await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .eq('splash_id', RECORD)
      .eq('pool_id', crew);
    expect(off.error).toBeNull();
    expect(await sees(cal, benCrew)).toBe(false);
    expect(await sees(ana, benCrew)).toBe(true);
    expect(await sees(ben, benCrew)).toBe(true);
    // Never deleted: the placement holding it cannot go.
    const gone = await asAdmin()
      .from('splash_placements')
      .delete()
      .eq('splash_id', RECORD)
      .eq('pool_id', crew);
    expect(gone.error?.code).toBe('23503');
    // Ben's Home still has it, under the record's title, not shared.
    const home = (await asUser(ben).rpc('my_thread_ripples')).data!;
    expect(home).toMatchObject([{ ripple_id: benCrew, title: 'Tofino', shared: false }]);
    await asUser(ana)
      .from('splash_placements')
      .update({ shared: true })
      .eq('splash_id', RECORD)
      .eq('pool_id', crew);
    expect(await sees(cal, benCrew)).toBe(true);
  });

  it('follows a leaver’s keep-or-remove choice', async () => {
    await asUser(eve).rpc('leave_pool', { p_pool: club, p_keep: false });
    expect(await sees(ben, eveClub)).toBe(false);
    expect(await sees(eve, eveClub)).toBe(true);
  });
});

describe('what makes my record leave or end', () => {
  it('refuses making it joint while members have written; Move to Home keeps their side (0056)', async () => {
    const own = crypto.randomUUID();
    await asUser(ana).rpc('create_own_pool_splash', {
      p_id: own,
      p_pool: crew,
      p_pool_lane: crewLane,
      p_title: 'In Crew',
    });
    await asUser(ana).rpc('set_placement_together', {
      p_splash: own,
      p_pool: crew,
      p_users: [cal],
      p_everyone: false,
    });
    expect((await write(cal, 'Cal on the pool record', crew, own)).error).toBeNull();
    const joint = await asUser(ana).rpc('splash_to_together', {
      p_splash: own,
      p_pool_lane: crewLane,
      p_invite_all: false,
    });
    expect(joint.error?.message).toMatch(/others have written here/);
    // Moved Home it keeps its placement in Crew (0056), so Cal's side stays where it hangs.
    const home = await asUser(ana).rpc('splash_to_mine', {
      p_splash: own,
      p_my_lane: await lane(ana),
    });
    expect(home.error).toBeNull();
    const placed = (
      await asAdmin().from('splash_placements').select('pool_id, shared').eq('splash_id', own)
    ).data;
    expect(placed).toEqual([{ pool_id: crew, shared: true }]);
    const side = (
      await asAdmin().from('ripples').select('thread_pool_id').eq('note', 'Cal on the pool record')
    ).data;
    expect(side).toEqual([{ thread_pool_id: crew }]);
  });

  it('deleting my record returns each member’s side to them as a post of one', async () => {
    const del = await asUser(ana).from('splashes').delete().eq('id', RECORD);
    expect(del.error).toBeNull();
    const benPosts = (
      await asAdmin()
        .from('splashes')
        .select('id, title, declared_lane_id')
        .eq('owner_id', ben)
        .eq('title', 'Tofino')
    ).data!;
    expect(benPosts).toHaveLength(1);
    const moved = (
      await asAdmin().from('ripples').select('splash_id, thread_pool_id').eq('note', 'Ben in Crew')
    ).data!;
    expect(moved).toEqual([{ splash_id: benPosts[0].id, thread_pool_id: null }]);
    const laneName = (
      await asAdmin()
        .from('my_categories')
        .select('name')
        .eq('id', benPosts[0].declared_lane_id!)
        .single()
    ).data!.name;
    expect(laneName).toBe('Trips');
  });

  it('deleting the pool returns members’ sides there to them too', async () => {
    const own = (
      await asAdmin()
        .from('splashes')
        .select('id')
        .eq('owner_id', ana)
        .eq('title', 'In Crew')
        .single()
    ).data!.id;
    const done = await asUser(ana).rpc('delete_pool', { p_pool: crew });
    expect(done.error).toBeNull();
    const calPost = (
      await asAdmin().from('splashes').select('id').eq('owner_id', cal).eq('title', 'In Crew')
    ).data!;
    expect(calPost).toHaveLength(1);
    const ripple = (
      await asAdmin()
        .from('ripples')
        .select('splash_id, thread_pool_id')
        .eq('note', 'Cal on the pool record')
        .single()
    ).data!;
    expect(ripple).toEqual({ splash_id: calPost[0].id, thread_pool_id: null });
    expect(own).toBeTruthy();
  });
});
