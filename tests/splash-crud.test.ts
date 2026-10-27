import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser, MINA } from './as-user';

/**
 * H21: a Splash is a post and its Ripples compose it. Deleting the post
 * DELETES its blocks — the reversal of H20d's detach, held in the foreign key
 * (`on delete cascade`), so this runs through PostgREST against the real
 * schema, not a mock. Owner-only RLS is checked with a real user token,
 * because the service role bypasses the policy.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const PLACE = '0f000000-0000-0000-0000-0000000000a1';
let author: string;

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `splash-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  author = data.user.id;

  await admin
    .from('profiles')
    .insert({ id: author, display_name: 'Splash', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ id: PLACE, user_id: author, name: 'Place' });
});

afterAll(async () => {
  if (author) await asAdmin().auth.admin.deleteUser(author);
});

afterEach(async () => {
  await asAdmin().from('splashes').delete().eq('owner_id', author);
  await asAdmin().from('ripples').delete().eq('author_id', author);
});

async function board(over: { declared_lane_id?: string; declared_start?: string } = {}) {
  const { data, error } = await asUser(author)
    .from('splashes')
    // A personal post owns its lane (H24).
    .insert({ owner_id: author, title: 'Whistler', declared_lane_id: PLACE, ...over })
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function fragment(splashId: string) {
  const { data, error } = await asUser(author)
    .from('ripples')
    .insert({ author_id: author, note: 'fixture', splash_id: splashId })
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id;
}

describe('a splash belongs to its owner', () => {
  it('is created, read back and updated by its owner', async () => {
    const id = await board({ declared_start: '2027-03-04' });

    const { data } = await asUser(author).from('splashes').select('*').eq('id', id).single();
    expect(data?.title).toBe('Whistler');
    expect(data?.declared_start).toBe('2027-03-04');
    expect(data?.declared_lane_id).toBe(PLACE);
    expect(data?.pinned_at).toBeNull();
    expect(data?.session_id).toBeNull();

    const { error } = await asUser(author)
      .from('splashes')
      .update({ title: 'Whistler, two nights' })
      .eq('id', id);
    expect(error).toBeNull();
  });

  it('is invisible to anyone else, linked or not', async () => {
    const id = await board();
    const { data } = await asUser(MINA).from('splashes').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  it('cannot be created for someone else', async () => {
    const { error } = await asUser(MINA)
      .from('splashes')
      .insert({ owner_id: author, title: 'not mine' });
    expect(error).not.toBeNull();
  });

  it('refuses a declared range that ends before it starts', async () => {
    const { error } = await asUser(author).from('splashes').insert({
      owner_id: author,
      title: 'x',
      declared_lane_id: PLACE,
      declared_start: '2027-03-04',
      declared_end: '2027-03-01',
    });
    expect(error?.message).toMatch(/splashes_declared_range/);
  });
});

describe('deleting a post deletes its blocks (H21)', () => {
  it('takes every block with it: the FK cascades', async () => {
    const id = await board();
    const a = await fragment(id);
    const b = await fragment(id);

    const { error } = await asUser(author).from('splashes').delete().eq('id', id);
    expect(error).toBeNull();

    const { data } = await asUser(author).from('ripples').select('id').in('id', [a, b]);
    expect(data).toEqual([]);
  });

  it('declares one lane, and may be pinned', async () => {
    const id = await board({ declared_lane_id: PLACE });
    const { error } = await asUser(author)
      .from('splashes')
      .update({ pinned_at: new Date().toISOString() })
      .eq('id', id);
    expect(error).toBeNull();
    const { data } = await asUser(author).from('splashes').select('*').eq('id', id).single();
    expect(data?.declared_lane_id).toBe(PLACE);
    expect(data?.pinned_at).not.toBeNull();
  });

  it('deleting a fragment leaves the board alone', async () => {
    const id = await board();
    const a = await fragment(id);
    await asUser(author).from('ripples').delete().eq('id', a);

    const { data } = await asUser(author).from('splashes').select('id').eq('id', id);
    expect(data).toHaveLength(1);
  });
});
