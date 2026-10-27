import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * Notifications, per pool (0052, H32), through PostgREST with real user
 * tokens. Ana makes Crew (Ben, Cal) and then Club (Ben); Dee is in Club
 * only. The triggers write every notification; these read them back as
 * whoever they are for.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

type Type = 'new_post' | 'reply' | 'reaction';

let ana: string;
let ben: string;
let cal: string;
let dee: string;
let crew: string;
let crewLane: string;
let club: string;
let clubLane: string;
const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `notify-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: id, name: 'Day' });
  people.push(id);
  return id;
}

async function openPool(name: string, members: string[]): Promise<[string, string]> {
  const made = await asUser(ana).rpc('create_pool', {
    p_name: name,
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
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

type Row = {
  id: string;
  type: string;
  pool_id: string;
  splash_id: string;
  ripple_id: string | null;
  reply_id: string | null;
  actor_id: string;
  invited: boolean;
  count: number;
  pushed_at: string | null;
  read_at: string | null;
};

/** What this person has, as they read it. */
async function inbox(who: string, splash?: string): Promise<Row[]> {
  let query = asUser(who).from('notifications').select('*').order('created_at');
  if (splash) query = query.eq('splash_id', splash);
  const { data, error } = await query;
  if (error) throw error;
  return data as Row[];
}

async function setMine(who: string, pool: string, type: Type, value: string | null) {
  const client = asUser(who);
  const done =
    value === null
      ? await client
          .from('member_notification_prefs')
          .delete()
          .match({ pool_id: pool, user_id: who, type })
      : await client
          .from('member_notification_prefs')
          .upsert({ pool_id: pool, user_id: who, type, value });
  if (done.error) throw done.error;
}

async function setDefault(pool: string, type: Type, value: string | null) {
  const client = asUser(ana);
  const done =
    value === null
      ? await client.from('pool_notification_defaults').delete().match({ pool_id: pool, type })
      : await client.from('pool_notification_defaults').upsert({ pool_id: pool, type, value });
  if (done.error) throw done.error;
}

async function setPaused(who: string, paused: boolean) {
  const done = await asUser(who)
    .from('notification_settings')
    .upsert({ user_id: who, paused, show_titles: false });
  if (done.error) throw done.error;
}

async function ripple(who: string, splash: string, pool: string | null = null): Promise<string> {
  const made = await asUser(who)
    .from('ripples')
    .insert({ author_id: who, note: 'words', splash_id: splash, thread_pool_id: pool })
    .select('id')
    .single();
  if (made.error) throw made.error;
  return made.data.id;
}

async function reply(who: string, rid: string): Promise<string> {
  const made = await asUser(who).rpc('add_reply', { p_ripple: rid, p_body: 'hi' });
  if (made.error) throw made.error;
  return made.data!;
}

async function poolRecord(pool: string, poolLane: string): Promise<string> {
  const id = crypto.randomUUID();
  const made = await asUser(ana).rpc('create_own_pool_splash', {
    p_id: id,
    p_pool: pool,
    p_pool_lane: poolLane,
    p_title: 'A pool record',
  });
  if (made.error) throw made.error;
  return id;
}

async function together(invite_all: boolean, invitees: string[]): Promise<string> {
  const id = crypto.randomUUID();
  const made = await asUser(ana).rpc('create_together_splash', {
    p_id: id,
    p_pool: crew,
    p_pool_lane: crewLane,
    p_title: 'Tofino',
    p_icon: '',
    p_declared_start: null as unknown as string,
    p_invite_all: invite_all,
  });
  if (made.error) throw made.error;
  if (invitees.length > 0) {
    const asked = await asUser(ana).rpc('add_joint_invitees', { p_splash: id, p_users: invitees });
    if (asked.error) throw asked.error;
  }
  return id;
}

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  dee = await person('Dee');
  [crew, crewLane] = await openPool('Crew', [ben, cal]);
  [club, clubLane] = await openPool('Club', [ben, dee]);
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

describe('the effective value', () => {
  const VALUES: Record<Type, string[]> = {
    new_post: ['all', 'invited', 'off'],
    reply: ['on', 'off'],
    reaction: ['on', 'off'],
  };
  const APP: Record<Type, string> = { new_post: 'invited', reply: 'on', reaction: 'off' };

  it('is paused ? off : mine ?? the pool default ?? the app default, in every combination', async () => {
    for (const type of Object.keys(VALUES) as Type[]) {
      for (const paused of [false, true]) {
        await setPaused(ben, paused);
        for (const mine of [null, ...VALUES[type]]) {
          await setMine(ben, crew, type, mine);
          for (const pool of [null, ...VALUES[type]]) {
            await setDefault(crew, type, pool);
            const { data, error } = await asUser(ben).rpc('my_notification_value', {
              p_pool: crew,
              p_type: type,
            });
            expect(error).toBeNull();
            const expected = paused ? 'off' : (mine ?? pool ?? APP[type]);
            expect({ type, paused, mine, pool, value: data }).toEqual({
              type,
              paused,
              mine,
              pool,
              value: expected,
            });
          }
        }
        await setMine(ben, crew, type, null);
        await setDefault(crew, type, null);
      }
    }
    await setPaused(ben, false);
  });

  it('keeps a value I set when the pool default changes later', async () => {
    await setMine(ben, crew, 'reply', 'off');
    await setDefault(crew, 'reply', 'on');
    expect(
      (await asUser(ben).rpc('my_notification_value', { p_pool: crew, p_type: 'reply' })).data,
    ).toBe('off');
    await setMine(ben, crew, 'reply', null);
    await setDefault(crew, 'reply', null);
  });
});

describe('who decides', () => {
  it('lets only the pool’s creator set its defaults', async () => {
    const theirs = await asUser(ben)
      .from('pool_notification_defaults')
      .insert({ pool_id: crew, type: 'reply', value: 'off' });
    expect(theirs.error).not.toBeNull();
    const outsider = await asUser(dee)
      .from('pool_notification_defaults')
      .insert({ pool_id: crew, type: 'reply', value: 'off' });
    expect(outsider.error).not.toBeNull();
    await setDefault(crew, 'reply', 'off');
    // A member reads them, so the screen can say what "Use pool default" means.
    const read = await asUser(ben)
      .from('pool_notification_defaults')
      .select('value')
      .eq('pool_id', crew);
    expect(read.data).toEqual([{ value: 'off' }]);
    // Ben cannot change it, even as an update.
    await asUser(ben)
      .from('pool_notification_defaults')
      .update({ value: 'on' })
      .match({ pool_id: crew, type: 'reply' });
    expect(
      (await asUser(ben).from('pool_notification_defaults').select('value').eq('pool_id', crew))
        .data,
    ).toEqual([{ value: 'off' }]);
    await setDefault(crew, 'reply', null);
  });

  it('lets only the member set their own, and only in a pool they are in', async () => {
    const forBen = await asUser(ana)
      .from('member_notification_prefs')
      .insert({ pool_id: crew, user_id: ben, type: 'reply', value: 'off' });
    expect(forBen.error).not.toBeNull();
    const notMine = await asUser(dee)
      .from('member_notification_prefs')
      .insert({ pool_id: crew, user_id: dee, type: 'reply', value: 'off' });
    expect(notMine.error).not.toBeNull();
    await setMine(ben, crew, 'reply', 'off');
    expect(
      (await asUser(ana).from('member_notification_prefs').select('*').eq('user_id', ben)).data,
    ).toEqual([]);
    await setMine(ben, crew, 'reply', null);
  });

  it('keeps pause and titles to their owner', async () => {
    await setPaused(ben, false);
    expect(
      (await asUser(ana).from('notification_settings').select('*').eq('user_id', ben)).data,
    ).toEqual([]);
    const forBen = await asUser(ana)
      .from('notification_settings')
      .upsert({ user_id: ben, paused: true, show_titles: false });
    expect(forBen.error).not.toBeNull();
  });
});

describe('new posts', () => {
  beforeAll(async () => {
    await setMine(ben, crew, 'new_post', 'all');
    // Cal keeps the app default: Only when I'm invited.
  });

  it('notifies All on any record, and Only when invited on none that is not an invite', async () => {
    const record = await poolRecord(crew, crewLane);
    expect((await inbox(ben, record)).map((n) => [n.type, n.invited, n.actor_id])).toEqual([
      ['new_post', false, ana],
    ]);
    expect(await inbox(cal, record)).toEqual([]);
    expect(await inbox(ana, record)).toEqual([]);
  });

  it('notifies a picked member as an invite, and the rest by their value', async () => {
    const joint = await together(false, [cal]);
    expect((await inbox(cal, joint)).map((n) => n.invited)).toEqual([true]);
    expect((await inbox(ben, joint)).map((n) => n.invited)).toEqual([false]);
    expect(await inbox(ana, joint)).toEqual([]);
  });

  it('upgrades an earlier notification to an invite, to be pushed again', async () => {
    const joint = await together(false, [cal]);
    await asAdmin()
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('splash_id', joint);
    const asked = await asUser(ana).rpc('add_joint_invitees', { p_splash: joint, p_users: [ben] });
    expect(asked.error).toBeNull();
    const [row] = await inbox(ben, joint);
    expect(row.invited).toBe(true);
    expect(row.pushed_at).toBeNull();
    // Cal's stays as it was: one row, still pushed.
    const cals = await inbox(cal, joint);
    expect(cals).toHaveLength(1);
    expect(cals[0].pushed_at).not.toBeNull();
  });

  it('counts Everyone as an invite for every current member', async () => {
    const joint = await together(true, []);
    expect((await inbox(cal, joint)).map((n) => n.invited)).toEqual([true]);
    expect((await inbox(ben, joint)).map((n) => n.invited)).toEqual([true]);
  });

  it('notifies Off of nothing, and a paused member of nothing', async () => {
    await setMine(cal, crew, 'new_post', 'off');
    await setPaused(ben, true);
    const joint = await together(true, []);
    expect(await inbox(cal, joint)).toEqual([]);
    expect(await inbox(ben, joint)).toEqual([]);
    await setMine(cal, crew, 'new_post', null);
    await setPaused(ben, false);
  });

  it('notifies a Home record shared into the pool', async () => {
    const id = crypto.randomUUID();
    const lane = (
      await asAdmin().from('my_categories').select('id').eq('user_id', ana).limit(1).single()
    ).data!.id;
    expect(
      (
        await asUser(ana)
          .from('splashes')
          .insert({ id, owner_id: ana, title: 'Home', declared_lane_id: lane })
      ).error,
    ).toBeNull();
    expect(await inbox(ben, id)).toEqual([]);
    const placed = await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: id, pool_id: crew, pool_lane_id: crewLane });
    expect(placed.error).toBeNull();
    expect((await inbox(ben, id)).map((n) => [n.type, n.pool_id])).toEqual([['new_post', crew]]);
    // Switched off, its unread notification goes with it.
    await asUser(ana)
      .from('splash_placements')
      .update({ shared: false })
      .match({ splash_id: id, pool_id: crew });
    expect(await inbox(ben, id)).toEqual([]);
  });
});

describe('replies', () => {
  let record: string;
  let rid: string;

  beforeAll(async () => {
    record = await poolRecord(crew, crewLane);
    rid = await ripple(ana, record);
  });

  it('notifies only the thread’s people, never the one replying', async () => {
    const first = await reply(ben, rid);
    expect(
      (await inbox(ana, record)).filter((n) => n.type === 'reply').map((n) => n.reply_id),
    ).toEqual([first]);
    expect((await inbox(cal, record)).filter((n) => n.type === 'reply')).toEqual([]);
    expect((await inbox(ben, record)).filter((n) => n.type === 'reply')).toEqual([]);

    // Cal joins the thread: Ana (the ripple's) and Ben (replied before) hear.
    const second = await reply(cal, rid);
    expect((await inbox(ana, record)).filter((n) => n.reply_id === second)).toHaveLength(1);
    expect((await inbox(ben, record)).filter((n) => n.reply_id === second)).toHaveLength(1);
    expect((await inbox(cal, record)).filter((n) => n.type === 'reply')).toEqual([]);

    // Ana replying on her own ripple notifies the others, never herself.
    const third = await reply(ana, rid);
    expect((await inbox(ana, record)).filter((n) => n.reply_id === third)).toEqual([]);
    expect((await inbox(ben, record)).filter((n) => n.reply_id === third)).toHaveLength(1);
  });

  it('reaches everyone who wrote a side of a joint record', async () => {
    const joint = await together(true, []);
    const anas = await ripple(ana, joint);
    await ripple(ben, joint);
    const said = await reply(cal, anas);
    expect((await inbox(ana, joint)).filter((n) => n.reply_id === said)).toHaveLength(1);
    expect((await inbox(ben, joint)).filter((n) => n.reply_id === said)).toHaveLength(1);
  });

  it('takes a hidden reply’s unread notification away', async () => {
    const said = await reply(ben, rid);
    expect((await inbox(ana, record)).filter((n) => n.reply_id === said)).toHaveLength(1);
    expect(
      (await asUser(ana).rpc('hide_reply', { p_reply: said, p_hidden: true })).error,
    ).toBeNull();
    expect((await inbox(ana, record)).filter((n) => n.reply_id === said)).toEqual([]);
  });

  it('picks one pool for a record shared into several: the one the recipient joined first', async () => {
    const id = crypto.randomUUID();
    const lane = (
      await asAdmin().from('my_categories').select('id').eq('user_id', ana).limit(1).single()
    ).data!.id;
    await asUser(ana)
      .from('splashes')
      .insert({ id, owner_id: ana, title: 'Both', declared_lane_id: lane });
    for (const [pool, poolLane] of [
      [club, clubLane],
      [crew, crewLane],
    ]) {
      const placed = await asUser(ana)
        .from('splash_placements')
        .insert({ splash_id: id, pool_id: pool, pool_lane_id: poolLane });
      expect(placed.error).toBeNull();
    }
    const mine = await ripple(ana, id);
    const said = await reply(ben, mine);
    // Ana made Crew before Club, so she joined it first.
    expect((await inbox(ana, id)).filter((n) => n.reply_id === said).map((n) => n.pool_id)).toEqual(
      [crew],
    );

    // Only that pool's settings count: off in Crew is off, though Club is on.
    await setMine(ana, crew, 'reply', 'off');
    const again = await reply(ben, mine);
    expect((await inbox(ana, id)).filter((n) => n.reply_id === again)).toEqual([]);
    await setMine(ana, crew, 'reply', null);

    // Dee shares only Club with Ana, so Dee's reply is Club's.
    const dees = await reply(dee, mine);
    expect((await inbox(ana, id)).filter((n) => n.reply_id === dees).map((n) => n.pool_id)).toEqual(
      [club],
    );
  });

  it('uses a member’s ripple’s thread pool', async () => {
    const id = crypto.randomUUID();
    const lane = (
      await asAdmin().from('my_categories').select('id').eq('user_id', ana).limit(1).single()
    ).data!.id;
    await asUser(ana)
      .from('splashes')
      .insert({ id, owner_id: ana, title: 'Threads', declared_lane_id: lane });
    for (const [pool, poolLane] of [
      [crew, crewLane],
      [club, clubLane],
    ]) {
      await asUser(ana)
        .from('splash_placements')
        .insert({ splash_id: id, pool_id: pool, pool_lane_id: poolLane });
    }
    await asUser(ana).rpc('set_placement_together', {
      p_splash: id,
      p_pool: club,
      p_users: [ben],
      p_everyone: false,
    });
    const bens = await ripple(ben, id, club);
    const said = await reply(ana, bens);
    expect((await inbox(ben, id)).filter((n) => n.reply_id === said).map((n) => n.pool_id)).toEqual(
      [club],
    );
  });
});

describe('reactions', () => {
  it('notifies the ripple’s author once an hour per pool, folding the rest in', async () => {
    await setMine(ana, crew, 'reaction', 'on');
    const record = await poolRecord(crew, crewLane);
    const rid = await ripple(ana, record);
    for (const [who, emoji] of [
      [ben, '❤️'],
      [ben, '😂'],
      [cal, '🔥'],
    ]) {
      const left = await asUser(who)
        .from('ripple_reactions')
        .insert({ ripple_id: rid, user_id: who, emoji });
      expect(left.error).toBeNull();
    }
    const reactions = (await inbox(ana)).filter((n) => n.type === 'reaction' && n.pool_id === crew);
    expect(reactions).toHaveLength(1);
    expect(reactions[0].count).toBe(3);
    expect(reactions[0].actor_id).toBe(cal);

    // My own reaction on my ripple is no notification.
    await asUser(ana)
      .from('ripple_reactions')
      .insert({ ripple_id: rid, user_id: ana, emoji: '👏' });
    expect((await inbox(ana)).filter((n) => n.type === 'reaction')[0].count).toBe(3);
  });

  it('stays off by the app default', async () => {
    const joint = await together(true, []);
    const rid = await ripple(cal, joint);
    await asUser(ben)
      .from('ripple_reactions')
      .insert({ ripple_id: rid, user_id: ben, emoji: '❤️' });
    expect((await inbox(cal)).filter((n) => n.type === 'reaction')).toEqual([]);
  });
});

describe('reading', () => {
  it('shows each person only their own, and marks read only theirs', async () => {
    const anas = await inbox(ana);
    expect(anas.length).toBeGreaterThan(0);
    const peek = await asUser(ben)
      .from('notifications')
      .select('id')
      .in(
        'id',
        anas.map((n) => n.id),
      );
    expect(peek.data).toEqual([]);
    // Ben cannot mark Ana's read, nor write one.
    await asUser(ben).rpc('mark_notifications_read', { p_ids: [anas[0].id] });
    expect((await inbox(ana)).find((n) => n.id === anas[0].id)!.read_at).toBeNull();
    const forged = await asUser(ben).from('notifications').insert({
      recipient_id: ana,
      type: 'new_post',
      pool_id: crew,
      splash_id: anas[0].splash_id,
      actor_id: ben,
    });
    expect(forged.error).not.toBeNull();

    await asUser(ana).rpc('mark_notifications_read', { p_ids: [anas[0].id] });
    expect((await inbox(ana)).find((n) => n.id === anas[0].id)!.read_at).not.toBeNull();
    await asUser(ana).rpc('mark_notifications_read', {});
    expect((await inbox(ana)).every((n) => n.read_at !== null)).toBe(true);
  });

  it('keeps a push subscription to whoever is signed in on that browser', async () => {
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
    const keys = { p_endpoint: endpoint, p_p256dh: 'key', p_auth: 'secret' };
    expect((await asUser(ben).rpc('save_push_subscription', keys)).error).toBeNull();
    expect(
      (await asUser(ana).from('push_subscriptions').select('id').eq('endpoint', endpoint)).data,
    ).toEqual([]);
    expect((await asUser(cal).rpc('save_push_subscription', keys)).error).toBeNull();
    expect(
      (await asUser(ben).from('push_subscriptions').select('id').eq('endpoint', endpoint)).data,
    ).toEqual([]);
    expect(
      (await asUser(cal).from('push_subscriptions').select('id').eq('endpoint', endpoint)).data,
    ).toHaveLength(1);
    expect(
      (await asUser(cal).rpc('save_push_subscription', { ...keys, p_endpoint: 'http://plain' }))
        .error,
    ).not.toBeNull();
  });

  it('takes a leaver’s notifications in that pool away', async () => {
    expect((await inbox(cal)).some((n) => n.pool_id === crew)).toBe(true);
    expect((await asUser(cal).rpc('leave_pool', { p_pool: crew, p_keep: true })).error).toBeNull();
    expect((await inbox(cal)).some((n) => n.pool_id === crew)).toBe(false);
  });
});
