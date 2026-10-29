import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * Deleting my account (0065, H53), against the real schema with throwaway
 * users. Ana deletes hers. She owns Crew (Ben joined before Cal) and Solo
 * (hers alone), and is a member of Ben's Club. Everything of hers goes;
 * others' words stay by H46's rules; Crew goes to Ben, Solo is torn down;
 * the pool layout she edited stays with the pool; a joint record left with
 * no ripples goes. The server action's storage and auth steps are not
 * here: this is the one transaction.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `delete-account-${name}-${crypto.randomUUID()}@during.today`,
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

async function write(who: string, splash: string, note: string, pool: string | null = null) {
  const made = await asUser(who)
    .from('ripples')
    .insert({ author_id: who, splash_id: splash, note, thread_pool_id: pool })
    .select('id')
    .single();
  if (made.error) throw made.error;
  return made.data.id;
}

async function joint(who: string, pool: string, lane: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  const made = await asUser(who).rpc('create_together_splash', {
    p_id: id,
    p_pool: pool,
    p_pool_lane: lane,
    p_title: title,
    p_icon: '🎲',
    p_declared_start: null as unknown as string,
    p_invite_all: true,
  });
  if (made.error) throw made.error;
  return id;
}

let ana: string, ben: string, cal: string;
let crew: string, crewLane: string, solo: string, club: string, clubLane: string;
let record: string, benOnRecord: string;
let answeredJoint: string, emptyJoint: string, bensJoint: string, benInBensJoint: string;
let bensRecord: string, anaSide: string, anaUnanswered: string;
let preview: unknown;
let result: { deleted: boolean; counts: Record<string, number>; handed: unknown[]; torn: string[] };

beforeAll(async () => {
  [ana, ben, cal] = [await person('Ana'), await person('Ben'), await person('Cal')];
  [crew, crewLane] = await openPool(ana, 'Crew', [ben, cal]);
  [solo] = await openPool(ana, 'Solo', []);
  [club, clubLane] = await openPool(ben, 'Club', [ana, cal]);

  // Ana's record, with a photo path, shared to Crew, where Ben writes.
  record = crypto.randomUUID();
  const day = (await asAdmin().from('my_categories').select('id').eq('user_id', ana).single()).data!
    .id;
  expect(
    (
      await asUser(ana)
        .from('splashes')
        .insert({ id: record, owner_id: ana, title: 'Tofino', declared_lane_id: day })
    ).error,
  ).toBeNull();
  const anaOwn = await write(ana, record, 'Ana on Tofino');
  await asAdmin()
    .from('ripples')
    .update({ media: [`${ana}/photo.webp`] })
    .eq('id', anaOwn);
  await asUser(ana)
    .from('splash_placements')
    .insert({ splash_id: record, pool_id: crew, pool_lane_id: crewLane });
  await asUser(ana).rpc('set_placement_together', {
    p_splash: record,
    p_pool: crew,
    p_users: [ben],
    p_everyone: false,
  });
  benOnRecord = await write(ben, record, 'Ben on Tofino', crew);

  // A joint record Ana opened in Crew, where she wrote and Cal replied.
  answeredJoint = await joint(ana, crew, crewLane, 'Board night');
  const anaAnswered = await write(ana, answeredJoint, 'Ana at board night');
  expect(
    (await asUser(cal).rpc('add_reply', { p_ripple: anaAnswered, p_body: 'Cal answers' })).error,
  ).toBeNull();

  // A joint record Ben opened in Club that only Ana wrote on: left empty.
  emptyJoint = await joint(ben, club, clubLane, 'Quiet');
  await write(ana, emptyJoint, 'Ana alone here');

  // A joint record Ben opened in Club with his ripple and Ana's reply on it.
  bensJoint = await joint(ben, club, clubLane, 'Walks');
  benInBensJoint = await write(ben, bensJoint, 'Ben walks');
  expect(
    (await asUser(ana).rpc('add_reply', { p_ripple: benInBensJoint, p_body: 'Ana answers' })).error,
  ).toBeNull();
  expect(
    (
      await asUser(ana)
        .from('ripple_reactions')
        .insert({ ripple_id: benInBensJoint, user_id: ana, emoji: '🌊' })
    ).error,
  ).toBeNull();

  // Ben's record shared to Club, where Ana wrote her side twice: Ben
  // replied to one and Cal reacted to it; nobody answered the other.
  bensRecord = crypto.randomUUID();
  const benDay = (await asAdmin().from('my_categories').select('id').eq('user_id', ben).single())
    .data!.id;
  await asUser(ben)
    .from('splashes')
    .insert({ id: bensRecord, owner_id: ben, title: 'Squamish', declared_lane_id: benDay });
  await write(ben, bensRecord, 'Ben on Squamish');
  await asUser(ben)
    .from('splash_placements')
    .insert({ splash_id: bensRecord, pool_id: club, pool_lane_id: clubLane });
  await asUser(ben).rpc('set_placement_together', {
    p_splash: bensRecord,
    p_pool: club,
    p_users: [ana],
    p_everyone: false,
  });
  anaSide = await write(ana, bensRecord, 'Ana on Squamish', club);
  anaUnanswered = await write(ana, bensRecord, 'Ana, unanswered', club);
  expect(
    (await asUser(ben).rpc('add_reply', { p_ripple: anaSide, p_body: 'Ben answers Ana' })).error,
  ).toBeNull();
  expect(
    (
      await asUser(cal)
        .from('ripple_reactions')
        .insert({ ripple_id: anaSide, user_id: cal, emoji: '⛰️' })
    ).error,
  ).toBeNull();

  // Her settings, a Home layout, a pool layout, a link, a device.
  await asUser(ana).rpc('set_board_layout', {
    p_splash: record,
    p_pool: null as unknown as string,
    p_patch: { label: { x: 0.2 } } as never,
    p_clear: [],
  });
  const poolLayout = await asUser(ana).rpc('set_board_layout', {
    p_splash: bensJoint,
    p_pool: club,
    p_patch: { label: { x: -0.2 } } as never,
    p_clear: [],
  });
  expect(poolLayout.error).toBeNull();
  await asUser(ana).rpc('create_invite', { p_pool: crew });
  await asUser(ana).rpc('save_push_subscription', {
    p_endpoint: `https://push.example/${ana}`,
    p_p256dh: 'p',
    p_auth: 'a',
    p_user_agent: 'test',
  });
  await asUser(ana).from('notification_settings').insert({ user_id: ana, show_titles: true });

  preview = (await asUser(ana).rpc('account_deletion_preview')).data;
  const done = await asUser(ana).rpc('delete_my_account');
  expect(done.error).toBeNull();
  result = done.data as typeof result;
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

describe('the confirm sheet’s preview', () => {
  it('names each pool I own and who takes it, or that it is deleted', () => {
    expect(preview).toMatchObject({
      records: 1,
      photos: 1,
      lanes: 1,
      pools: [
        { pool_id: crew, name: 'Crew', heir_id: ben, heir_name: 'Ben' },
        { pool_id: solo, name: 'Solo', heir_id: null, heir_name: null },
      ],
    });
  });
});

describe('deleting my account', () => {
  it('leaves nothing of mine in any table', async () => {
    const admin = asAdmin();
    const mine: [string, string][] = [
      ['profiles', 'id'],
      ['splashes', 'owner_id'],
      ['ripples', 'author_id'],
      ['ripple_replies', 'author_id'],
      ['ripple_reactions', 'user_id'],
      ['ripple_views', 'viewer_id'],
      ['my_categories', 'user_id'],
      ['home_filing', 'user_id'],
      ['board_layouts', 'user_id'],
      ['lane_mappings', 'user_id'],
      ['joint_invitees', 'user_id'],
      ['pool_members', 'user_id'],
      ['pool_invites', 'created_by'],
      ['member_pool_settings', 'user_id'],
      ['member_notification_prefs', 'user_id'],
      ['my_theme_settings', 'user_id'],
      ['notification_settings', 'user_id'],
      ['notifications', 'recipient_id'],
      ['notifications', 'actor_id'],
      ['push_subscriptions', 'user_id'],
      ['sessions', 'owner_id'],
      ['pools', 'owner_id'],
    ];
    for (const [table, column] of mine) {
      const { data, error } = await admin
        .from(table as 'profiles')
        .select('*')
        .eq(column as 'id', ana);
      expect(error, table).toBeNull();
      expect(data, `${table}.${column}`).toEqual([]);
    }
    expect(result.deleted).toBe(true);
    expect(result.counts).toMatchObject({ profiles: 1, splashes: 1, pool_invites: 2 });
  });

  it('hands Crew to the longest-standing member, unannounced, and tears Solo down', async () => {
    const owner = await asAdmin().from('pools').select('owner_id').eq('id', crew).single();
    expect(owner.data!.owner_id).toBe(ben);
    expect(
      (await asAdmin().from('notifications').select('id').eq('type', 'owner').eq('pool_id', crew))
        .data,
    ).toEqual([]);
    expect((await asAdmin().from('pools').select('id').eq('id', solo)).data).toEqual([]);
    expect(result.torn).toEqual([solo]);
  });

  it('keeps what others wrote: Ben’s side of my record as Crew’s joint record', async () => {
    const moved = await asAdmin()
      .from('ripples')
      .select('splash_id, note')
      .eq('id', benOnRecord)
      .single();
    expect(moved.data!.note).toBe('Ben on Tofino');
    const shell = await asUser(ben)
      .from('splashes')
      .select('title, owner_id, pool_id')
      .eq('id', moved.data!.splash_id!)
      .single();
    expect(shell.data).toEqual({ title: 'Tofino', owner_id: null, pool_id: crew });
  });

  it('keeps Cal’s reply on a placeholder, and the joint record with it', async () => {
    const left = await asAdmin()
      .from('ripples')
      .select('author_id, note')
      .eq('splash_id', answeredJoint);
    expect(left.data).toEqual([{ author_id: null, note: null }]);
    const reply = await asAdmin().from('ripple_replies').select('body').eq('author_id', cal);
    expect(reply.data).toEqual([{ body: 'Cal answers' }]);
  });

  it('keeps what others said to my side of someone’s record, on a placeholder in that thread', async () => {
    const left = await asAdmin()
      .from('ripples')
      .select('id, author_id, note, media, thread_pool_id, created_at')
      .eq('splash_id', bensRecord)
      .is('author_id', null);
    expect(left.data).toHaveLength(1);
    const holder = left.data![0];
    expect(holder).toMatchObject({ note: null, media: [], thread_pool_id: club });
    const mine = await asAdmin().from('ripples').select('id').in('id', [anaSide, anaUnanswered]);
    expect(mine.data).toEqual([]);

    // The record's owner and the pool's other member both read it and what hangs on it.
    for (const reader of [ben, cal]) {
      const seen = await asUser(reader).from('ripples').select('id').eq('id', holder.id);
      expect(seen.data, reader).toHaveLength(1);
      const replies = await asUser(reader).rpc('ripple_replies_in', { p_ripples: [holder.id] });
      expect(
        (replies.data ?? []).map((r) => ({ body: r.body, thread_pool_id: r.thread_pool_id })),
        reader,
      ).toEqual([{ body: 'Ben answers Ana', thread_pool_id: club }]);
      const reactions = await asUser(reader)
        .from('ripple_reactions')
        .select('emoji')
        .eq('ripple_id', holder.id);
      expect(reactions.data, reader).toEqual([{ emoji: '⛰️' }]);
    }
    // Nobody outside the pool reads it.
    const stranger = await person('Dee');
    expect((await asUser(stranger).from('ripples').select('id').eq('id', holder.id)).data).toEqual(
      [],
    );
  });

  it('deletes a joint record left with no ripples, and keeps Ben’s with his', async () => {
    expect((await asAdmin().from('splashes').select('id').eq('id', emptyJoint)).data).toEqual([]);
    expect((await asAdmin().from('ripples').select('id').eq('splash_id', bensJoint)).data).toEqual([
      { id: benInBensJoint },
    ]);
    expect(result.counts.empty_joint_splashes).toBe(1);
  });

  it('keeps the pool layout I edited, with the pool', async () => {
    const layout = await asAdmin()
      .from('board_layouts')
      .select('scope, pool_id, updated_by')
      .eq('splash_id', bensJoint);
    expect(layout.data).toEqual([{ scope: 'pool', pool_id: club, updated_by: null }]);
  });

  it('does nothing when run again', async () => {
    const again = await asUser(ana).rpc('delete_my_account');
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ deleted: false, torn: [], handed: [] });
  });

  it('is nobody’s to run for someone else, or without a session', async () => {
    const { anonymous } = await import('./as-user');
    expect((await anonymous().rpc('delete_my_account')).error).not.toBeNull();
    expect((await asUser(cal).rpc('_pool_heir' as never, {} as never)).error).not.toBeNull();
  });
});
