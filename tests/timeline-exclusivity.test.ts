import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Skipped (H24, H20b): these dormant Timer tests write a ripple's own date,
// time and parent — fields 0029 freezes: a ripple takes its lane and date
// from its splash, and nothing writes them again. The modules stay dormant
// and untouched for P3's Swim (H20b); the tests stay too, skipped rather than
// rewritten, until Swim decides what a live record's time belongs to.

import { getRipplesForDate } from '@/lib/queries/ripples';
import { asAdmin } from './as-user';

/**
 * H20c: the display axis is the diary's own order, so two overlapping spans
 * are two legitimate records and the exclusion constraint H10 wrote is gone
 * (migration 0005). What survives, dormant, is containment: an inner ripple
 * still has to lie inside its parent, because the modules that compose one
 * are P3's. These go through the service role — the point is what the
 * database accepts and refuses, not what a policy hides.
 *
 * On a throwaway author rather than a seeded one, so nothing here can touch a
 * real record.
 */

const DAY = '2027-03-04';
const FOCUS = '0f000000-0000-0000-0000-0000000000f1';
const LISTENING = '0f000000-0000-0000-0000-0000000000f2';

let author: string;

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `exclusivity-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  author = data.user.id;

  await admin
    .from('profiles')
    .insert({ id: author, display_name: 'Exclusivity', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert([
    { id: FOCUS, user_id: author, name: 'Focus', default_mode: 'timed', position: 0 },
    { id: LISTENING, user_id: author, name: 'Listening', default_mode: 'drop', position: 1 },
  ]);
});

afterAll(async () => {
  if (author) await asAdmin().auth.admin.deleteUser(author);
});

const written: string[] = [];

afterEach(async () => {
  if (written.length === 0) return;
  await asAdmin().from('ripples').delete().in('id', written);
  written.length = 0;
});

type Row = {
  id?: string;
  occurred_time: string | null;
  ended_at?: string | null;
  planned?: boolean;
  parent_ripple_id?: string | null;
};

/** Vancouver is UTC-8 on this date — before DST starts — so 09:00 is 17:00Z. */
function utc(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2027, 2, 4, h + 8, m)).toISOString();
}

async function insert(row: Row) {
  const id = row.id ?? crypto.randomUUID();
  written.push(id);

  return asAdmin()
    .from('ripples')
    .insert({
      id,
      author_id: author,
      note: 'fixture',
      occurred_on: DAY,
      occurred_time: row.occurred_time,
      ended_at: row.ended_at ?? null,
      planned: row.planned ?? false,
      parent_ripple_id: row.parent_ripple_id ?? null,
    })
    .select('id');
}

async function session(from: string, to: string) {
  const { data, error } = await insert({ occurred_time: from, ended_at: utc(to) });
  expect(error).toBeNull();
  return data![0].id;
}

describe.skip('overlap is allowed (H20c)', () => {
  it('commits two overlapping spans, both of them', async () => {
    const first = await session('09:00', '10:30');

    const { data, error } = await insert({ occurred_time: '10:00', ended_at: utc('11:00') });
    expect(error).toBeNull();

    const { data: rows } = await asAdmin()
      .from('ripples')
      .select('id')
      .in('id', [first, data![0].id]);
    expect(rows).toHaveLength(2);
  });

  it('commits a drop inside a span: a call during dinner is two things that happened', async () => {
    await session('19:00', '21:00');

    const { error } = await insert({ occurred_time: '19:40', ended_at: utc('19:40') });
    expect(error).toBeNull();
  });

  it('no longer carries the constraint at all', async () => {
    const { data } = await asAdmin().rpc('ripple_author', {
      rid: '00000000-0000-0000-0000-000000000000',
    });
    // The function is reachable, so the schema is the live one; the
    // constraint is checked by the migration rehearsal and by the two
    // commits above, which it would have refused.
    expect(data).toBeNull();
  });

  it('accepts an unannotated fragment: no date, no time', async () => {
    const { data, error } = await asAdmin()
      .from('ripples')
      .insert({ author_id: author, note: 'posted, not placed' })
      .select('id, occurred_on, started_at');
    written.push(data![0].id);

    expect(error).toBeNull();
    expect(data![0].occurred_on).toBeNull();
    expect(data![0].started_at).toBeNull();
  });

  it('refuses a time without a date', async () => {
    const { error } = await asAdmin()
      .from('ripples')
      .insert({ author_id: author, occurred_time: '09:00' });
    expect(error?.message).toMatch(/ripples_time_needs_date/);
  });
});

describe.skip('containment (dormant with inner ripples, H20b)', () => {
  it('refuses an inner ripple outside its parent span', async () => {
    const parent = await session('09:00', '10:30');

    const { error } = await insert({
      occurred_time: '11:00',
      ended_at: utc('11:00'),
      parent_ripple_id: parent,
    });
    expect(error?.message).toMatch(/within its parent/i);
  });

  it('refuses an inner ripple inside an inner ripple', async () => {
    const parent = await session('09:00', '10:30');
    const { data } = await insert({
      occurred_time: '09:20',
      ended_at: utc('09:50'),
      parent_ripple_id: parent,
    });

    const { error } = await insert({
      occurred_time: '09:30',
      ended_at: utc('09:30'),
      parent_ripple_id: data![0].id,
    });
    expect(error?.message).toMatch(/cannot carry inner ripples/i);
  });
});

describe.skip('inner ripples on the axis (dormant, H20b)', () => {
  it('are not returned for the timeline: the parent owns the row', async () => {
    const parent = await session('09:00', '10:30');
    const inner = await insert({
      occurred_time: '09:40',
      ended_at: utc('09:40'),
      parent_ripple_id: parent,
    });
    expect(inner.error).toBeNull();

    const { data } = await getRipplesForDate(
      asAdmin() as unknown as Parameters<typeof getRipplesForDate>[0],
      author,
      DAY,
    ).then((rows) => ({ data: rows }));

    const ids = data.map((r) => r.id);
    expect(ids).toContain(parent);
    expect(ids).not.toContain(inner.data![0].id);
  });
});
