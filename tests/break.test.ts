import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Skipped (H24, H20b): these dormant Timer tests write a ripple's own date,
// time and parent — fields 0029 freezes: a ripple takes its lane and date
// from its splash, and nothing writes them again. The modules stay dormant
// and untouched for P3's Swim (H20b); the tests stay too, skipped rather than
// rewritten, until Swim decides what a live record's time belongs to.

import { getInnerRipples, runningBreak } from '@/lib/queries/compose';
import { asAdmin } from './as-user';

/**
 * H15a2: a break is a timed inner ripple. These go through the service role —
 * what is under test is the shape of the record and the order of the writes,
 * not what a policy hides.
 */

const DAY = '2027-05-04';
const FOCUS = '0e000000-0000-0000-0000-0000000000e1';
let author: string;

/** Vancouver is UTC-7 in May, so 09:00 local is 16:00Z. */
function utc(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2027, 4, 4, h + 7, m)).toISOString();
}

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `break-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  author = data.user.id;

  await admin
    .from('profiles')
    .insert({ id: author, display_name: 'Break', timezone: 'America/Vancouver' });
  await admin
    .from('my_categories')
    .insert({ id: FOCUS, user_id: author, name: 'Focus', default_mode: 'timed', position: 0 });
});

afterAll(async () => {
  if (author) await asAdmin().auth.admin.deleteUser(author);
});

const written: string[] = [];
afterEach(async () => {
  if (written.length) await asAdmin().from('ripples').delete().in('id', written);
  written.length = 0;
});

async function insert(row: {
  time: string | null;
  endedAt?: string | null;
  parent?: string | null;
  category?: string;
}) {
  const id = crypto.randomUUID();
  written.push(id);

  return asAdmin()
    .from('ripples')
    .insert({
      id,
      author_id: author,
      category_id: row.category ?? FOCUS,
      occurred_on: DAY,
      occurred_time: row.time,
      ended_at: row.endedAt ?? null,
      parent_ripple_id: row.parent ?? null,
    })
    .select('id, started_at, ended_at, parent_ripple_id');
}

describe.skip('a break is an inner ripple', () => {
  it('lies within the parent span and keeps off the top-level axis', async () => {
    const session = await insert({ time: '09:00' });
    const inside = await insert({
      time: '09:20',
      endedAt: utc('09:35'),
      parent: session.data![0].id,
    });

    expect(inside.error).toBeNull();
    expect(inside.data![0].parent_ripple_id).toBe(session.data![0].id);

    const { data: topLevel } = await asAdmin()
      .from('ripples')
      .select('id')
      .eq('author_id', author)
      .is('parent_ripple_id', null);
    expect(topLevel!.map((r) => r.id)).not.toContain(inside.data![0].id);
  });

  it('is refused outside the parent span', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('10:00') });
    const outside = await insert({
      time: '11:00',
      endedAt: utc('11:10'),
      parent: session.data![0].id,
    });

    expect(outside.error?.message).toMatch(/within its parent/i);
  });

  it("carries the parent session's category, having none of its own", async () => {
    const session = await insert({ time: '09:00' });
    const child = await insert({
      time: '09:20',
      endedAt: utc('09:35'),
      parent: session.data![0].id,
    });

    const { data } = await asAdmin()
      .from('ripples')
      .select('category_id')
      .eq('id', child.data![0].id)
      .single();

    expect(data!.category_id).toBe(FOCUS);
  });

  it('leaves no Break category behind anywhere', async () => {
    // A category that had to be hidden from category surfaces was the wrong
    // shape; identity is structural now (H15a2).
    const { data } = await asAdmin().from('my_categories').select('id').eq('name', 'Break');
    expect(data).toEqual([]);
  });

  it('is distinguishable by its span, which is what a detail sheet needs', async () => {
    const session = await insert({ time: '09:00' });
    const brk = await insert({ time: '09:20', endedAt: utc('09:35'), parent: session.data![0].id });
    const note = await insert({
      time: '09:40',
      endedAt: utc('09:40'),
      parent: session.data![0].id,
    });

    const { data } = await asAdmin()
      .from('ripples')
      .select('id, started_at, ended_at')
      .in('id', [brk.data![0].id, note.data![0].id]);

    const asBreak = data!.find((r) => r.id === brk.data![0].id)!;
    const asDrop = data!.find((r) => r.id === note.data![0].id)!;

    // Inner composition is Drop-only, so a timed child is a break and a
    // point-in-time child is anything else.
    expect(asBreak.ended_at).not.toBe(asBreak.started_at);
    expect(asDrop.ended_at).toBe(asDrop.started_at);
  });
});

describe.skip('one running break at a time', () => {
  it('is recognised from the children, so the UI can enforce it', async () => {
    const session = await insert({ time: '09:00' });
    const open = await insert({
      time: '09:20',
      parent: session.data![0].id,
    });

    const inner = await getInnerRipples(
      asAdmin() as unknown as Parameters<typeof getInnerRipples>[0],
      [session.data![0].id],
    );

    expect(runningBreak(inner)?.id).toBe(open.data![0].id);
  });

  it('reports none once the break has ended', async () => {
    const session = await insert({ time: '09:00' });
    await insert({
      time: '09:20',
      endedAt: utc('09:40'),
      parent: session.data![0].id,
    });

    const inner = await getInnerRipples(
      asAdmin() as unknown as Parameters<typeof getInnerRipples>[0],
      [session.data![0].id],
    );
    expect(runningBreak(inner)).toBeNull();
  });
});

describe.skip('stopping during a break', () => {
  it('closes the break first, so the child stays inside the parent', async () => {
    const session = await insert({ time: '09:00' });
    const open = await insert({
      time: '09:20',
      parent: session.data![0].id,
    });

    const admin = asAdmin();
    // The order under test: child, then parent.
    await admin
      .from('ripples')
      .update({ ended_at: utc('09:50') })
      .eq('id', open.data![0].id);
    await admin
      .from('ripples')
      .update({ ended_at: utc('10:00') })
      .eq('id', session.data![0].id);

    const { data } = await admin
      .from('ripples')
      .select('id, ended_at')
      .in('id', [session.data![0].id, open.data![0].id]);

    const parent = data!.find((r) => r.id === session.data![0].id)!;
    const child = data!.find((r) => r.id === open.data![0].id)!;

    expect(child.ended_at).not.toBeNull();
    expect(Date.parse(child.ended_at!)).toBeLessThanOrEqual(Date.parse(parent.ended_at!));
  });
});

describe.skip('the parent keeps gross time', () => {
  it('is untouched by the break inside it', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('10:00') });
    await insert({
      time: '09:20',
      endedAt: utc('09:40'),
      parent: session.data![0].id,
    });

    const { data } = await asAdmin()
      .from('ripples')
      .select('started_at, ended_at')
      .eq('id', session.data![0].id)
      .single();

    // One hour of wall clock, not forty minutes of "real" work. The moment the
    // app subtracts, it has started keeping score (H15a2).
    const minutes = (Date.parse(data!.ended_at!) - Date.parse(data!.started_at!)) / 60_000;
    expect(minutes).toBe(60);
  });
});
