import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Skipped (H24, H20b): These tests write a ripple's own date, time, span or
// parent — fields 0029 freezes: a ripple takes its lane and date from its
// splash, and nothing writes them again. The machinery they test is the
// dormant Timer's (inner ripples, timed spans), kept for P3's Swim (H20b);
// the tests stay, skipped rather than rewritten, until Swim decides what a
// live record's time belongs to.

import { asAdmin, asUser } from './as-user';

/**
 * Migration 0006: a span by dates alone. `ripples_ended_needs_time` is gone;
 * `ripples_ended_needs_date` stands in its place, so an end needs a date and
 * never a clock (H20a: time is an annotation, not an obligation). Runs
 * against the real schema, because the shape rule is the row's own.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const PLACE = '0f000000-0000-0000-0000-0000000000b1';
let author: string;

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `span-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  author = data.user.id;

  await admin
    .from('profiles')
    .insert({ id: author, display_name: 'Span', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ id: PLACE, user_id: author, name: 'Place' });
});

afterAll(async () => {
  if (author) await asAdmin().auth.admin.deleteUser(author);
});

afterEach(async () => {
  await asAdmin().from('ripples').delete().eq('author_id', author);
});

function insert(row: Record<string, unknown>) {
  return asUser(author)
    .from('ripples')
    .insert({ author_id: author, category_id: PLACE, note: 'fixture', ...row })
    .select('id, occurred_on, occurred_time, started_at, ended_at')
    .single();
}

describe.skip('a span by dates alone (migration 0006)', () => {
  it('stores an end with a date and no clock, and no start instant', async () => {
    const { data, error } = await insert({
      occurred_on: '2026-08-17',
      occurred_time: null,
      ended_at: '2026-08-21T06:59:00.000Z',
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      occurred_on: '2026-08-17',
      occurred_time: null,
      started_at: null,
    });
    expect(Date.parse(data!.ended_at!)).toBe(Date.parse('2026-08-21T06:59:00.000Z'));
  });

  it('still refuses an end with no date at all', async () => {
    const { error } = await insert({
      occurred_on: null,
      occurred_time: null,
      ended_at: '2026-08-21T06:59:00.000Z',
    });
    expect(error?.message).toContain('ripples_ended_needs_date');
  });

  it('keeps a clocked span as before', async () => {
    const { data, error } = await insert({
      occurred_on: '2026-08-17',
      occurred_time: '19:00',
      ended_at: '2026-08-18T04:00:00.000Z',
    });
    expect(error).toBeNull();
    expect(data!.started_at).not.toBeNull();
  });
});
