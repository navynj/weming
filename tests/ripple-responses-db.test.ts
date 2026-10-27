import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { anonymous, asAdmin, asUser } from './as-user';

/**
 * Reactions and replies (H25, 0030), proved through PostgREST with real user
 * tokens. Ana opens a pool and writes on a joint splash; Ben is a member; Cal
 * stays outside; Dee joins and leaves taking her records; Eve joins and
 * leaves keeping hers. Everything goes with them in afterAll.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

let ana: string;
let ben: string;
let cal: string;
let dee: string;
let eve: string;
let pool: string;
let lane: string;
let joint: string;
let open: string;
let locked: string;
const people: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `resp-${name.toLowerCase()}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: id, name: 'Days' });
  people.push(id);
  return id;
}

async function join(who: string): Promise<void> {
  const invite = await asUser(ana).rpc('create_invite', { p_pool: pool });
  expect(invite.error).toBeNull();
  const joined = await asUser(who).rpc('join_pool', {
    p_token: invite.data![0].token,
    p_links: [],
    p_include_history: false,
  });
  expect(joined.error).toBeNull();
}

async function block(note: string): Promise<string> {
  const { data, error } = await asUser(ana)
    .from('ripples')
    .insert({ author_id: ana, category_id: null, note, splash_id: joint })
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function repliesFor(who: string | null, rid: string) {
  const client = who ? asUser(who) : anonymous();
  return client.rpc('ripple_replies_for', { p_ripples: [rid] });
}

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  dee = await person('Dee');
  eve = await person('Eve');

  const created = await asUser(ana).rpc('create_pool', {
    p_name: 'Responses',
    p_kind: 'friends',
    p_lanes: [{ name: 'Days', icon: '☀️', my_category_id: null }],
    p_include_history: false,
  });
  expect(created.error).toBeNull();
  pool = created.data!;
  const lanes = await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool);
  lane = lanes.data![0].id;
  for (const who of [ben, dee, eve]) await join(who);

  joint = crypto.randomUUID();
  const made = await asUser(ana).rpc('create_joint_splash', {
    p_id: joint,
    p_pool: pool,
    p_pool_lane: lane,
    p_title: 'A walk',
  });
  expect(made.error).toBeNull();
  open = await block('the river was high');
  locked = await block('only me');
});

afterAll(async () => {
  const admin = asAdmin();
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of people) {
    await admin.from('ripples').delete().eq('author_id', id);
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('reactions', () => {
  it('a member reacts, and a toggle adds and removes one', async () => {
    const add = await asUser(ben)
      .from('ripple_reactions')
      .insert({ ripple_id: open, user_id: ben, emoji: '🔥' });
    expect(add.error).toBeNull();
    const twice = await asUser(ben)
      .from('ripple_reactions')
      .insert({ ripple_id: open, user_id: ben, emoji: '🔥' });
    expect(twice.error).not.toBeNull(); // one of each emoji per person
    const removed = await asUser(ben)
      .from('ripple_reactions')
      .delete()
      .match({ ripple_id: open, user_id: ben, emoji: '🔥' })
      .select();
    expect(removed.data).toHaveLength(1);
    const left = await asUser(ana).from('ripple_reactions').select('*').eq('ripple_id', open);
    expect(left.data).toHaveLength(0);
  });

  it('several emoji per person; counts group by emoji on the splash', async () => {
    for (const [who, emoji] of [
      [ben, '❤️'],
      [ben, '😂'],
      [ana, '❤️'],
      [eve, '❤️'],
      [eve, '👏'],
    ] as const) {
      const { error } = await asUser(who)
        .from('ripple_reactions')
        .insert({ ripple_id: open, user_id: who, emoji });
      expect(error).toBeNull();
    }
    const { data, error } = await asUser(ben).rpc('splash_reaction_summary', {
      p_splashes: [joint],
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].total).toBe(5);
    expect(data![0].emoji![0]).toBe('❤️');
    expect(data![0].emoji).toHaveLength(3);
  });

  it('refuses whitespace and an over-long emoji', async () => {
    for (const emoji of ['a b', 'x'.repeat(17), '']) {
      const { error } = await asUser(ben)
        .from('ripple_reactions')
        .insert({ ripple_id: open, user_id: ben, emoji });
      expect(error).not.toBeNull();
    }
  });

  it('nobody reacts as someone else', async () => {
    const { error } = await asUser(ben)
      .from('ripple_reactions')
      .insert({ ripple_id: open, user_id: ana, emoji: '😮' });
    expect(error).not.toBeNull();
  });
});

describe('replies', () => {
  let benReply: string;

  it('a member replies; text bounds hold', async () => {
    const add = await asUser(ben).rpc('add_reply', { p_ripple: open, p_body: '  so high!  ' });
    expect(add.error).toBeNull();
    benReply = add.data!;
    expect(
      (await asUser(ben).rpc('add_reply', { p_ripple: open, p_body: '   ' })).error,
    ).not.toBeNull();
    expect(
      (await asUser(ben).rpc('add_reply', { p_ripple: open, p_body: 'x'.repeat(501) })).error,
    ).not.toBeNull();
    const read = await repliesFor(ana, open);
    expect(read.data!.map((r) => r.body)).toEqual(['so high!']);
  });

  it('its writer edits it, marked edited; nobody else can', async () => {
    expect(
      (await asUser(ana).rpc('edit_reply', { p_reply: benReply, p_body: 'mine now' })).error,
    ).not.toBeNull();
    expect(
      (await asUser(ben).rpc('edit_reply', { p_reply: benReply, p_body: 'so very high' })).error,
    ).toBeNull();
    const read = await repliesFor(eve, open);
    expect(read.data![0].body).toBe('so very high');
    expect(read.data![0].edited_at).not.toBeNull();
  });

  it('the ripple author hides a reply: its text reaches only the writer and the author', async () => {
    expect((await asUser(ben).rpc('hide_reply', { p_reply: benReply })).error).not.toBeNull();
    expect((await asUser(ana).rpc('hide_reply', { p_reply: benReply })).error).toBeNull();
    const third = (await repliesFor(eve, open)).data!;
    expect(third[0].hidden).toBe(true);
    expect(third[0].body).toBeNull();
    expect((await repliesFor(ben, open)).data![0].body).toBe('so very high');
    expect((await repliesFor(ana, open)).data![0].body).toBe('so very high');
    // Hidden is skipped and not counted on the board.
    const preview = await asUser(eve).rpc('splash_reply_preview', { p_splashes: [joint] });
    expect(preview.data).toHaveLength(0);
    expect(
      (await asUser(ana).rpc('hide_reply', { p_reply: benReply, p_hidden: false })).error,
    ).toBeNull();
  });

  it('only its writer deletes it, and it is gone', async () => {
    expect((await asUser(ana).rpc('delete_reply', { p_reply: benReply })).error).not.toBeNull();
    expect((await asUser(ben).rpc('delete_reply', { p_reply: benReply })).error).toBeNull();
    const gone = await asAdmin().from('ripple_replies').select('id').eq('id', benReply);
    expect(gone.data).toHaveLength(0);
  });

  it('the board preview: the first three (two shown, the third for "+n"), oldest first, and the count', async () => {
    for (const body of ['one', 'two', 'three', 'four', 'five']) {
      expect(
        (await asUser(eve).rpc('add_reply', { p_ripple: open, p_body: body })).error,
      ).toBeNull();
    }
    const { data } = await asUser(ben).rpc('splash_reply_preview', { p_splashes: [joint] });
    expect(data!.map((r) => r.body)).toEqual(['one', 'two', 'three']);
    expect(data![0].total).toBe(5);
  });

  it('replies are not ripples: the joint splash still awaits Ben', async () => {
    expect(
      (await asUser(ben).rpc('add_reply', { p_ripple: open, p_body: 'me too' })).error,
    ).toBeNull();
    const writers = await asAdmin().from('ripples').select('author_id').eq('splash_id', joint);
    expect(new Set(writers.data!.map((r) => r.author_id))).toEqual(new Set([ana]));
  });
});

describe('outside, signed out, and locked', () => {
  it('a non-member reads and writes neither', async () => {
    expect(
      (await asUser(cal).from('ripple_reactions').select('*').eq('ripple_id', open)).data,
    ).toEqual([]);
    expect(
      (
        await asUser(cal)
          .from('ripple_reactions')
          .insert({ ripple_id: open, user_id: cal, emoji: '❤️' })
      ).error,
    ).not.toBeNull();
    expect((await repliesFor(cal, open)).data).toEqual([]);
    expect(
      (await asUser(cal).rpc('add_reply', { p_ripple: open, p_body: 'hi' })).error,
    ).not.toBeNull();
    expect((await asUser(cal).rpc('splash_reply_preview', { p_splashes: [joint] })).data).toEqual(
      [],
    );
    expect(
      (await asUser(cal).rpc('splash_reaction_summary', { p_splashes: [joint] })).data,
    ).toEqual([]);
  });

  it('a signed-out caller reaches nothing', async () => {
    const reactions = await anonymous().from('ripple_reactions').select('*');
    expect(reactions.error !== null || reactions.data!.length === 0).toBe(true);
    expect((await anonymous().from('ripple_replies').select('*')).error).not.toBeNull();
    expect((await repliesFor(null, open)).error).not.toBeNull();
    expect(
      (await anonymous().rpc('add_reply', { p_ripple: open, p_body: 'hi' })).error,
    ).not.toBeNull();
    expect(
      (await anonymous().rpc('splash_reaction_summary', { p_splashes: [joint] })).error,
    ).not.toBeNull();
  });

  it('a locked ripple refuses both, and shows them to nobody but its author', async () => {
    expect(
      (
        await asUser(ben)
          .from('ripple_reactions')
          .insert({ ripple_id: locked, user_id: ben, emoji: '❤️' })
      ).error,
    ).toBeNull();
    expect(
      (await asUser(ben).rpc('add_reply', { p_ripple: locked, p_body: 'before' })).error,
    ).toBeNull();
    const lock = await asUser(ana)
      .from('ripple_audience')
      .insert({ ripple_id: locked, target_type: 'lock' });
    expect(lock.error).toBeNull();

    expect(
      (
        await asUser(ben)
          .from('ripple_reactions')
          .insert({ ripple_id: locked, user_id: ben, emoji: '😮' })
      ).error,
    ).not.toBeNull();
    expect(
      (await asUser(ben).rpc('add_reply', { p_ripple: locked, p_body: 'after' })).error,
    ).not.toBeNull();
    expect(
      (await asUser(ana).rpc('add_reply', { p_ripple: locked, p_body: 'mine' })).error,
    ).not.toBeNull();
    expect(
      (await asUser(eve).from('ripple_reactions').select('*').eq('ripple_id', locked)).data,
    ).toEqual([]);
    expect((await repliesFor(eve, locked)).data).toEqual([]);
    expect(
      (await asUser(ana).from('ripple_reactions').select('*').eq('ripple_id', locked)).data,
    ).toHaveLength(1);
    expect((await repliesFor(ana, locked)).data).toHaveLength(1);
  });
});

describe('leaving', () => {
  let deeReply: string;
  let eveReply: string;

  beforeAll(async () => {
    deeReply = (await asUser(dee).rpc('add_reply', { p_ripple: open, p_body: 'dee was here' }))
      .data!;
    await asUser(dee)
      .from('ripple_reactions')
      .insert({ ripple_id: open, user_id: dee, emoji: '😢' });
    eveReply = (await asUser(eve).rpc('add_reply', { p_ripple: open, p_body: 'eve was here' }))
      .data!;
    expect((await asUser(dee).rpc('leave_pool', { p_pool: pool, p_keep: false })).error).toBeNull();
    expect((await asUser(eve).rpc('leave_pool', { p_pool: pool, p_keep: true })).error).toBeNull();
  });

  it('remove: a former member’s replies and reactions are hidden from everyone', async () => {
    const replies = (await repliesFor(ben, open)).data!;
    expect(replies.find((r) => r.id === deeReply)).toBeUndefined();
    const reactions = (await asUser(ana).from('ripple_reactions').select('*').eq('ripple_id', open))
      .data!;
    expect(reactions.find((r) => r.user_id === dee)).toBeUndefined();
  });

  it('keep: kept and visible, marked former', async () => {
    const replies = (await repliesFor(ben, open)).data!;
    const kept = replies.find((r) => r.id === eveReply);
    expect(kept?.body).toBe('eve was here');
    expect(kept?.former).toBe(true);
    expect(replies.find((r) => r.author_id === ben)?.former).toBe(false);
  });

  it('a former member reads and writes neither', async () => {
    expect((await repliesFor(eve, open)).data).toEqual([]);
    expect(
      (await asUser(eve).rpc('add_reply', { p_ripple: open, p_body: 'back?' })).error,
    ).not.toBeNull();
    expect(
      (
        await asUser(eve)
          .from('ripple_reactions')
          .insert({ ripple_id: open, user_id: eve, emoji: '🔥' })
      ).error,
    ).not.toBeNull();
  });
});
