import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * 0013 against the real schema: `written_on` is the author's local date at
 * insert, from the profile's zone, and nothing moves it after — not the
 * client, not a later change of zone. Needs the local stack.
 */
let author: string;
const LANE = '0d000000-0000-0000-0000-0000000000a1';

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `written-on-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  author = data.user.id;
  await admin
    .from('profiles')
    .insert({ id: author, display_name: 'Van', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ id: LANE, user_id: author, name: 'Food' });
});

afterAll(async () => {
  if (!author) return;
  await asAdmin().from('ripples').delete().eq('author_id', author);
  await asAdmin().from('splashes').delete().eq('owner_id', author);
  await asAdmin().auth.admin.deleteUser(author);
});

describe('written_on (0013)', () => {
  it('is the author’s local date at 23:30 in Vancouver, whatever the client sends', async () => {
    const db = asUser(author);
    const { data: post } = await db
      .from('splashes')
      .insert({
        owner_id: author,
        title: 'late',
        declared_lane_id: LANE,
        created_at: '2026-10-23T06:30:00.000Z',
        written_on: '1999-01-01',
      })
      .select('written_on')
      .single();
    expect(post!.written_on).toBe('2026-10-22');
  });

  it('stays put when the author’s zone changes, and new rows use the new zone', async () => {
    const db = asUser(author);
    // Every ripple belongs to a splash (H24).
    const { data: post } = await db
      .from('splashes')
      .insert({ owner_id: author, title: 'zones', declared_lane_id: LANE })
      .select('id')
      .single();
    const { data: first } = await db
      .from('ripples')
      .insert({
        author_id: author,
        splash_id: post!.id,
        note: 'van',
        created_at: '2026-10-23T06:30:00.000Z',
      })
      .select('id, written_on')
      .single();
    expect(first!.written_on).toBe('2026-10-22');

    await asAdmin().from('profiles').update({ timezone: 'Asia/Seoul' }).eq('id', author);
    await db
      .from('ripples')
      .update({ note: 'edited', written_on: '2030-01-01' })
      .eq('id', first!.id);
    const { data: again } = await db
      .from('ripples')
      .select('written_on')
      .eq('id', first!.id)
      .single();
    expect(again!.written_on).toBe('2026-10-22');

    const { data: second } = await db
      .from('ripples')
      .insert({
        author_id: author,
        splash_id: post!.id,
        note: 'seoul',
        created_at: '2026-10-23T06:30:00.000Z',
      })
      .select('written_on')
      .single();
    expect(second!.written_on).toBe('2026-10-23');
  });
});
