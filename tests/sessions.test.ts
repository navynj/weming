import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser, MINA } from './as-user';

/**
 * H21e: sessions are shelves. A monthly row exists only once titled and is
 * unique per owner and month; a custom row is made; a post sits on at most
 * one custom session, by replacement; removing a shelf unshelves. Owner-only
 * RLS is checked with a real user token, because the service role bypasses
 * the policy. The shape rules live in the table, so this runs through
 * PostgREST against the real schema.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const PLACE = '0f000000-0000-0000-0000-0000000000b1';
let author: string;

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `session-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  author = data.user.id;

  await admin
    .from('profiles')
    .insert({ id: author, display_name: 'Shelver', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ id: PLACE, user_id: author, name: 'Place' });
});

afterAll(async () => {
  if (author) await asAdmin().auth.admin.deleteUser(author);
});

afterEach(async () => {
  await asAdmin().from('splashes').delete().eq('owner_id', author);
  await asAdmin().from('sessions').delete().eq('owner_id', author);
});

async function custom(title = 'Trips') {
  const { data, error } = await asUser(author)
    .from('sessions')
    .insert({ owner_id: author, kind: 'custom', title })
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id;
}

describe('a monthly session is a lazy row (H21e)', () => {
  it('is titled once per month per owner', async () => {
    const { error } = await asUser(author)
      .from('sessions')
      .insert({ owner_id: author, kind: 'monthly', title: 'The month', month: '2026-09-01' });
    expect(error).toBeNull();

    const { error: again } = await asUser(author)
      .from('sessions')
      .insert({ owner_id: author, kind: 'monthly', title: 'Twice', month: '2026-09-01' });
    expect(again?.message).toMatch(/sessions_monthly_unique/);

    // Another owner's September is their own.
    const { error: hers } = await asUser(MINA)
      .from('sessions')
      .insert({ owner_id: MINA, kind: 'monthly', title: 'Mine', month: '2026-09-01' });
    expect(hers).toBeNull();
    await asAdmin().from('sessions').delete().eq('owner_id', MINA);
  });

  it('keys on the first of the month and carries no range or lane', async () => {
    const { error } = await asUser(author)
      .from('sessions')
      .insert({ owner_id: author, kind: 'monthly', title: 'x', month: '2026-09-02' });
    expect(error?.message).toMatch(/sessions_shape/);

    const { error: laned } = await asUser(author).from('sessions').insert({
      owner_id: author,
      kind: 'monthly',
      title: 'x',
      month: '2026-09-01',
      lane_id: PLACE,
    });
    expect(laned?.message).toMatch(/sessions_shape/);
  });

  it('refuses an empty title: an untitled month has no row', async () => {
    const { error } = await asUser(author)
      .from('sessions')
      .insert({ owner_id: author, kind: 'monthly', title: '  ', month: '2026-09-01' });
    expect(error?.message).toMatch(/sessions_title_present/);
  });
});

describe('a custom session belongs to its owner', () => {
  it('is made, read back, corrected and removed by its owner', async () => {
    const id = await custom();
    const { error } = await asUser(author)
      .from('sessions')
      .update({ declared_start: '2026-08-01', declared_end: '2026-08-31', lane_id: PLACE })
      .eq('id', id);
    expect(error).toBeNull();

    const { data } = await asUser(author).from('sessions').select('*').eq('id', id).single();
    expect(data).toMatchObject({ kind: 'custom', month: null, lane_id: PLACE });

    const { error: gone } = await asUser(author).from('sessions').delete().eq('id', id);
    expect(gone).toBeNull();
  });

  it('never carries a month', async () => {
    const { error } = await asUser(author)
      .from('sessions')
      .insert({ owner_id: author, kind: 'custom', title: 'x', month: '2026-09-01' });
    expect(error?.message).toMatch(/sessions_shape/);
  });

  it('is invisible to anyone else, and cannot be made for someone else', async () => {
    const id = await custom();
    const { data } = await asUser(MINA).from('sessions').select('id').eq('id', id);
    expect(data).toEqual([]);
    const { error } = await asUser(MINA)
      .from('sessions')
      .insert({ owner_id: author, kind: 'custom', title: 'not mine' });
    expect(error).not.toBeNull();
  });
});

describe('a post sits on at most one custom session (H21e)', () => {
  it('moves by replacement, and is unshelved when the shelf goes', async () => {
    const trips = await custom('Trips');
    const runs = await custom('Food runs');
    const { data: splash, error } = await asUser(author)
      .from('splashes')
      .insert({ owner_id: author, title: 'Whistler', session_id: trips, declared_lane_id: PLACE })
      .select('id')
      .single();
    expect(error).toBeNull();

    const { error: moved } = await asUser(author)
      .from('splashes')
      .update({ session_id: runs })
      .eq('id', splash!.id);
    expect(moved).toBeNull();
    const { data: after } = await asUser(author)
      .from('splashes')
      .select('session_id')
      .eq('id', splash!.id)
      .single();
    expect(after?.session_id).toBe(runs);

    await asUser(author).from('sessions').delete().eq('id', runs);
    const { data: unshelved } = await asUser(author)
      .from('splashes')
      .select('session_id')
      .eq('id', splash!.id)
      .single();
    expect(unshelved?.session_id).toBeNull();
  });
});
