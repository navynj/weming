import { afterAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A pool's owner (0063, H50), against the real schema with throwaway users.
 * Ana opens a pool and is its owner; Ben and Cal join, in that order. Only
 * the owner hands the pool on and removes members; removing is leaving
 * with Remove for them, and no link lets them back until the owner allows
 * it. The backfill's rule, one pool at a time: an owner who is a current
 * member stays, else the longest-standing current member, else the pool
 * is torn down with everyone's words going back to them.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `owner-${name}-${crypto.randomUUID()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: id, name: 'Day' });
  people.push(id);
  return id;
}

async function link(owner: string, pool: string): Promise<string> {
  const made = await asUser(owner).rpc('create_invite', { p_pool: pool });
  if (made.error) throw made.error;
  return made.data![0].token;
}

async function join(who: string, token: string) {
  return asUser(who).rpc('join_pool', { p_token: token, p_links: [], p_include_history: false });
}

type World = { ana: string; ben: string; cal: string; pool: string; lane: string; token: string };

/** Ana's pool "Crew", Ben then Cal in it. */
async function world(): Promise<World> {
  const [ana, ben, cal] = [await person('Ana'), await person('Ben'), await person('Cal')];
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Crew',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🧭', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  const pool = made.data!;
  pools.push(pool);
  const token = await link(ana, pool);
  for (const who of [ben, cal]) {
    const joined = await join(who, token);
    if (joined.error) throw joined.error;
  }
  const lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool).single())
    .data!.id;
  return { ana, ben, cal, pool, lane, token };
}

/** A record of `who`'s with one ripple, shared to the pool's lane. */
async function share(who: string, pool: string, lane: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  const day = (await asAdmin().from('my_categories').select('id').eq('user_id', who).single()).data!
    .id;
  const made = await asUser(who)
    .from('splashes')
    .insert({ id, owner_id: who, title, declared_lane_id: day });
  if (made.error) throw made.error;
  const wrote = await asUser(who)
    .from('ripples')
    .insert({ author_id: who, splash_id: id, note: `${title}, a ripple` });
  if (wrote.error) throw wrote.error;
  const placed = await asUser(who)
    .from('splash_placements')
    .insert({ splash_id: id, pool_id: pool, pool_lane_id: lane });
  if (placed.error) throw placed.error;
  return id;
}

async function ownerOf(pool: string): Promise<string | null> {
  return (await asAdmin().from('pools').select('owner_id').eq('id', pool).single()).data!.owner_id;
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

describe('transferring ownership', () => {
  it('is the owner’s alone, to a current member other than themselves', async () => {
    const w = await world();
    const byMember = await asUser(w.ben).rpc('transfer_pool_owner', {
      p_pool: w.pool,
      p_to: w.cal,
    });
    expect(byMember.error?.code).toBe('42501');
    const toSelf = await asUser(w.ana).rpc('transfer_pool_owner', { p_pool: w.pool, p_to: w.ana });
    expect(toSelf.error?.code).toBe('22023');
    const stranger = await person('Dee');
    const toStranger = await asUser(w.ana).rpc('transfer_pool_owner', {
      p_pool: w.pool,
      p_to: stranger,
    });
    expect(toStranger.error?.code).toBe('22023');
    await asUser(w.cal).rpc('leave_pool', { p_pool: w.pool, p_keep: true });
    const toFormer = await asUser(w.ana).rpc('transfer_pool_owner', {
      p_pool: w.pool,
      p_to: w.cal,
    });
    expect(toFormer.error?.code).toBe('22023');
    expect(await ownerOf(w.pool)).toBe(w.ana);
  });

  it('takes effect at once and tells the new owner in the app, never by push', async () => {
    const w = await world();
    const done = await asUser(w.ana).rpc('transfer_pool_owner', { p_pool: w.pool, p_to: w.ben });
    expect(done.error).toBeNull();
    expect(await ownerOf(w.pool)).toBe(w.ben);

    const told = await asUser(w.ben)
      .from('notifications')
      .select('type, pool_id, splash_id, actor_id, pushed_at, read_at')
      .eq('pool_id', w.pool);
    expect(told.data).toHaveLength(1);
    expect(told.data![0]).toMatchObject({
      type: 'owner',
      pool_id: w.pool,
      splash_id: null,
      actor_id: w.ana,
      read_at: null,
    });
    expect(told.data![0].pushed_at).not.toBeNull();
    const others = await asUser(w.cal).from('notifications').select('id').eq('pool_id', w.pool);
    expect(others.data).toHaveLength(0);

    // The old owner is a member now: nothing of the owner's is theirs.
    const again = await asUser(w.ana).rpc('transfer_pool_owner', { p_pool: w.pool, p_to: w.cal });
    expect(again.error?.code).toBe('42501');
  });

  it('carries the members’ notification defaults with it', async () => {
    const w = await world();
    await asUser(w.ana).rpc('transfer_pool_owner', { p_pool: w.pool, p_to: w.ben });
    const byOld = await asUser(w.ana)
      .from('pool_notification_defaults')
      .insert({ pool_id: w.pool, type: 'reply', value: 'off' });
    expect(byOld.error).not.toBeNull();
    const byNew = await asUser(w.ben)
      .from('pool_notification_defaults')
      .insert({ pool_id: w.pool, type: 'reply', value: 'off' });
    expect(byNew.error).toBeNull();
  });
});

describe('removing a member', () => {
  it('is the owner’s alone, and never of themselves', async () => {
    const w = await world();
    const byMember = await asUser(w.ben).rpc('remove_pool_member', {
      p_pool: w.pool,
      p_user: w.cal,
    });
    expect(byMember.error?.code).toBe('42501');
    const self = await asUser(w.ana).rpc('remove_pool_member', { p_pool: w.pool, p_user: w.ana });
    expect(self.error?.code).toBe('22023');
    const stranger = await person('Dee');
    const outsider = await asUser(w.ana).rpc('remove_pool_member', {
      p_pool: w.pool,
      p_user: stranger,
    });
    expect(outsider.error?.code).toBe('22023');
  });

  it('shuts them out at once, hides their records, and tells them nothing', async () => {
    const w = await world();
    const record = await share(w.ben, w.pool, w.lane, 'Tofino');
    const anaRecord = await share(w.ana, w.pool, w.lane, 'Ucluelet');
    expect((await asUser(w.cal).from('splashes').select('id').eq('id', record)).data).toHaveLength(
      1,
    );

    const done = await asUser(w.ana).rpc('remove_pool_member', { p_pool: w.pool, p_user: w.ben });
    expect(done.error).toBeNull();

    const row = await asAdmin()
      .from('pool_members')
      .select('left_at, keep_on_leave')
      .eq('pool_id', w.pool)
      .eq('user_id', w.ben)
      .single();
    expect(row.data!.left_at).not.toBeNull();
    expect(row.data!.keep_on_leave).toBe(false);

    // Ben reads nothing in the pool.
    const ben = asUser(w.ben);
    expect((await ben.from('pools').select('id').eq('id', w.pool)).data).toHaveLength(0);
    expect((await ben.from('pool_members').select('user_id').eq('pool_id', w.pool)).data).toEqual(
      [],
    );
    expect((await ben.from('pool_lanes').select('id').eq('pool_id', w.pool)).data).toEqual([]);
    expect((await ben.from('splashes').select('id').eq('id', anaRecord)).data).toEqual([]);
    expect((await ben.from('ripples').select('id').eq('splash_id', anaRecord)).data).toEqual([]);
    expect((await ben.from('pool_invites').select('id').eq('pool_id', w.pool)).data).toEqual([]);

    // His record is hidden from the pool, never deleted.
    expect((await asUser(w.cal).from('splashes').select('id').eq('id', record)).data).toEqual([]);
    expect((await ben.from('splashes').select('id').eq('id', record)).data).toHaveLength(1);
    expect((await ben.from('ripples').select('id').eq('splash_id', record)).data).toHaveLength(1);

    // No notification to him.
    expect((await ben.from('notifications').select('id').eq('pool_id', w.pool)).data).toEqual([]);
  });

  it('keeps them out through every link, until the owner allows them back', async () => {
    const w = await world();
    const record = await share(w.ben, w.pool, w.lane, 'Squamish');
    await asUser(w.ana).rpc('remove_pool_member', { p_pool: w.pool, p_user: w.ben });

    // The old link and a new one alike.
    for (const token of [w.token, await link(w.ana, w.pool)]) {
      const back = await join(w.ben, token);
      expect(back.error?.code).toBe('42501');
      expect(back.error?.message).toBe("You can't join this Pool.");
    }

    // Only the owner reads and clears the list.
    expect(
      (await asUser(w.cal).from('pool_removed_members').select('user_id').eq('pool_id', w.pool))
        .data,
    ).toEqual([]);
    const byMember = await asUser(w.cal)
      .from('pool_removed_members')
      .delete()
      .eq('pool_id', w.pool)
      .select('user_id');
    expect(byMember.data).toEqual([]);
    const listed = await asUser(w.ana)
      .from('pool_removed_members')
      .select('user_id, removed_by')
      .eq('pool_id', w.pool);
    expect(listed.data).toEqual([{ user_id: w.ben, removed_by: w.ana }]);
    expect(
      (await asUser(w.ana).from('pool_removed_members').insert({ pool_id: w.pool, user_id: w.cal }))
        .error,
    ).not.toBeNull();

    const allowed = await asUser(w.ana)
      .from('pool_removed_members')
      .delete()
      .eq('pool_id', w.pool)
      .eq('user_id', w.ben)
      .select('user_id');
    expect(allowed.data).toHaveLength(1);

    // Joining again restores what was hidden.
    const back = await join(w.ben, w.token);
    expect(back.error).toBeNull();
    expect((await asUser(w.cal).from('splashes').select('id').eq('id', record)).data).toHaveLength(
      1,
    );
    expect(
      (await asUser(w.cal).from('ripples').select('id').eq('splash_id', record)).data,
    ).toHaveLength(1);
  });

  it('hands over a thread others wrote on their record, as leaving with Remove does (H46)', async () => {
    const w = await world();
    const record = await share(w.ben, w.pool, w.lane, 'Whistler');
    const opened = await asUser(w.ben).rpc('set_placement_together', {
      p_splash: record,
      p_pool: w.pool,
      p_users: [w.cal],
      p_everyone: false,
    });
    expect(opened.error).toBeNull();
    const calSaid = await asUser(w.cal)
      .from('ripples')
      .insert({
        author_id: w.cal,
        splash_id: record,
        note: 'Cal was there',
        thread_pool_id: w.pool,
      })
      .select('id')
      .single();
    expect(calSaid.error).toBeNull();

    await asUser(w.ana).rpc('remove_pool_member', { p_pool: w.pool, p_user: w.ben });

    const moved = await asAdmin()
      .from('ripples')
      .select('splash_id')
      .eq('id', calSaid.data!.id)
      .single();
    expect(moved.data!.splash_id).not.toBe(record);
    const joint = await asUser(w.cal)
      .from('splashes')
      .select('title, pool_id, owner_id')
      .eq('id', moved.data!.splash_id!)
      .single();
    expect(joint.data).toEqual({ title: 'Whistler', pool_id: w.pool, owner_id: null });
  });
});

describe('settling an owner (the 0063 backfill, per pool)', () => {
  it('keeps an owner who is a current member', async () => {
    const w = await world();
    const said = await asAdmin().rpc('_settle_pool_owner', { pid: w.pool });
    expect(said.data).toBe('kept');
    expect(await ownerOf(w.pool)).toBe(w.ana);
  });

  it('gives an owner who has left’s pool to the longest-standing current member', async () => {
    const w = await world();
    await asUser(w.ana).rpc('leave_pool', { p_pool: w.pool, p_keep: true });
    const said = await asAdmin().rpc('_settle_pool_owner', { pid: w.pool });
    expect(said.data).toBe('given');
    expect(await ownerOf(w.pool)).toBe(w.ben);
  });

  it('gives a pool with no owner to the longest-standing current member', async () => {
    const w = await world();
    await asUser(w.ana).rpc('leave_pool', { p_pool: w.pool, p_keep: true });
    // Ben left and came back: his stint now starts after Cal's.
    await asUser(w.ben).rpc('leave_pool', { p_pool: w.pool, p_keep: true });
    await join(w.ben, w.token);
    await asAdmin().from('pools').update({ owner_id: null }).eq('id', w.pool);
    await asAdmin().rpc('_settle_pool_owner', { pid: w.pool });
    expect(await ownerOf(w.pool)).toBe(w.cal);
  });

  it('tears down a pool with no current members, returning people’s words', async () => {
    const w = await world();
    const record = await share(w.ben, w.pool, w.lane, 'Kept here');
    for (const who of [w.ben, w.cal, w.ana]) {
      await asUser(who).rpc('leave_pool', { p_pool: w.pool, p_keep: true });
    }
    const said = await asAdmin().rpc('_settle_pool_owner', { pid: w.pool });
    expect(said.data).toBe('torn');
    expect((await asAdmin().from('pools').select('id').eq('id', w.pool)).data).toEqual([]);
    expect((await asUser(w.ben).from('splashes').select('id').eq('id', record)).data).toHaveLength(
      1,
    );
    const origin = await asAdmin()
      .from('splash_origins')
      .select('pool_name')
      .eq('splash_id', record);
    expect(origin.data).toEqual([{ pool_name: 'Crew' }]);
  });

  it('is nobody’s to call but the migration’s', async () => {
    const w = await world();
    const called = await asUser(w.ana).rpc('_settle_pool_owner', { pid: w.pool });
    expect(called.error).not.toBeNull();
    const torn = await asUser(w.ana).rpc('_teardown_pool' as never, { p_pool: w.pool } as never);
    expect(torn.error).not.toBeNull();
  });
});
