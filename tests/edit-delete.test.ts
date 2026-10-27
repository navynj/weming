import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Skipped (H24, H20b): Every describe here but the media one: they write a ripple's own date, time, span or
// parent — fields 0029 freezes: a ripple takes its lane and date from its
// splash, and nothing writes them again. The machinery they test is the
// dormant Timer's (inner ripples, timed spans), kept for P3's Swim (H20b);
// the tests stay, skipped rather than rewritten, until Swim decides what a
// live record's time belongs to.

import { asAdmin, asUser } from './as-user';

/**
 * Editing and deleting, at the level the rules live: the containment trigger
 * (dormant with inner ripples, H20b), the cascade, and the storage policy.
 * The exclusion constraint is gone (H20c): where a move used to be refused
 * for landing on another record, it now lands.
 */

const DAY = '2027-07-08';
const FOCUS = '0d000000-0000-0000-0000-0000000000d1';
const BUCKET = 'ripple-media';

let author: string;
let other: string;

/** Vancouver is UTC-7 in July, so 09:00 local is 16:00Z. */
function utc(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2027, 6, 8, h + 7, m)).toISOString();
}

beforeAll(async () => {
  const admin = asAdmin();

  const mine = await admin.auth.admin.createUser({
    email: `edit-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (mine.error) throw mine.error;
  author = mine.data.user.id;

  const theirs = await admin.auth.admin.createUser({
    email: `other-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (theirs.error) throw theirs.error;
  other = theirs.data.user.id;

  await admin.from('profiles').insert([
    { id: author, display_name: 'Editor', timezone: 'America/Vancouver' },
    { id: other, display_name: 'Other', timezone: 'America/Vancouver' },
  ]);
  await admin
    .from('my_categories')
    .insert({ id: FOCUS, user_id: author, name: 'Focus', default_mode: 'timed', position: 0 });
});

afterAll(async () => {
  const admin = asAdmin();
  if (author) await admin.auth.admin.deleteUser(author);
  if (other) await admin.auth.admin.deleteUser(other);
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
  media?: string[];
  planned?: boolean;
}) {
  const id = crypto.randomUUID();
  written.push(id);

  return asAdmin()
    .from('ripples')
    .insert({
      id,
      author_id: author,
      category_id: FOCUS,
      note: 'fixture',
      occurred_on: DAY,
      occurred_time: row.time,
      ended_at: row.endedAt ?? null,
      planned: row.planned ?? false,
      parent_ripple_id: row.parent ?? null,
      media: row.media ?? [],
    })
    .select('id, created_at, started_at, ended_at');
}

describe.skip('editing revalidates the rules it moves through', () => {
  it('allows a move onto another record: overlap is two true statements (H20c)', async () => {
    await insert({ time: '09:00', endedAt: utc('10:00') });
    const movable = await insert({ time: '11:00', endedAt: utc('11:00') });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ occurred_time: '09:30' })
      .eq('id', movable.data![0].id);

    expect(error).toBeNull();
  });

  it('moves a fragment back to where it was posted when the annotation is removed', async () => {
    const row = await insert({ time: '09:00', endedAt: utc('09:00') });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ occurred_on: null, occurred_time: null, ended_at: null })
      .eq('id', row.data![0].id);
    expect(error).toBeNull();

    const { data } = await asAdmin()
      .from('ripples')
      .select('occurred_on, started_at')
      .eq('id', row.data![0].id)
      .single();
    expect(data!.occurred_on).toBeNull();
    expect(data!.started_at).toBeNull();
  });

  it('refuses a move that takes a child outside its parent', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('11:00') });
    const child = await insert({
      time: '09:30',
      endedAt: utc('09:45'),
      parent: session.data![0].id,
    });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ occurred_time: '12:00', ended_at: utc('12:15') })
      .eq('id', child.data![0].id);

    expect(error?.message).toMatch(/within its parent/i);
  });

  it('allows a move into free time', async () => {
    const movable = await insert({ time: '09:00', endedAt: utc('09:00') });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ occurred_time: '14:00', ended_at: utc('14:00') })
      .eq('id', movable.data![0].id);

    expect(error).toBeNull();
  });

  it('leaves created_at alone: the diary remembers when you wrote', async () => {
    const row = await insert({ time: '09:00', endedAt: utc('09:00') });
    const before = row.data![0].created_at;

    await asAdmin()
      .from('ripples')
      .update({ note: 'corrected', occurred_time: '15:00', ended_at: utc('15:00') })
      .eq('id', row.data![0].id);

    const { data } = await asAdmin()
      .from('ripples')
      .select('created_at, note')
      .eq('id', row.data![0].id)
      .single();

    expect(data!.created_at).toBe(before);
    expect(data!.note).toBe('corrected');
  });

  it('round-trips a drop to all-day and back', async () => {
    const row = await insert({ time: '09:00', endedAt: utc('09:00') });
    const admin = asAdmin();

    await admin
      .from('ripples')
      .update({ occurred_time: null, ended_at: null })
      .eq('id', row.data![0].id);
    const asNote = await admin
      .from('ripples')
      .select('occurred_time, started_at')
      .eq('id', row.data![0].id)
      .single();
    expect(asNote.data!.occurred_time).toBeNull();
    // Without a wall clock there is no instant, so it leaves the axis entirely.
    expect(asNote.data!.started_at).toBeNull();

    await admin
      .from('ripples')
      .update({ occurred_time: '16:00', ended_at: utc('16:00') })
      .eq('id', row.data![0].id);
    const back = await admin
      .from('ripples')
      .select('occurred_time, started_at')
      .eq('id', row.data![0].id)
      .single();
    expect(back.data!.occurred_time).toBe('16:00:00');
    expect(back.data!.started_at).not.toBeNull();
  });
});

describe.skip('deleting', () => {
  it('takes the records inside a session with it', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('11:00') });
    const child = await insert({
      time: '09:30',
      endedAt: utc('09:45'),
      parent: session.data![0].id,
    });

    await asAdmin().from('ripples').delete().eq('id', session.data![0].id);

    const { data } = await asAdmin()
      .from('ripples')
      .select('id')
      .in('id', [session.data![0].id, child.data![0].id]);

    expect(data).toEqual([]);
  });
});

describe('media belongs to its owner', () => {
  const path = () => `${author}/${crypto.randomUUID()}.jpg`;

  it('refuses another account the object, even knowing the path', async () => {
    const objectPath = path();
    const mine = asUser(author);
    const theirs = asUser(other);

    const uploaded = await mine.storage
      .from(BUCKET)
      .upload(objectPath, new Blob(['x'], { type: 'image/jpeg' }));
    expect(uploaded.error).toBeNull();

    // The path is a guess away; the policy is what refuses, not the name.
    const download = await theirs.storage.from(BUCKET).download(objectPath);
    expect(download.error).not.toBeNull();

    const signed = await theirs.storage.from(BUCKET).createSignedUrl(objectPath, 60);
    expect(signed.error).not.toBeNull();

    await asAdmin().storage.from(BUCKET).remove([objectPath]);
  });

  it('refuses another account a write into that folder', async () => {
    const theirs = asUser(other);

    const { error } = await theirs.storage
      .from(BUCKET)
      .upload(`${author}/intruder.jpg`, new Blob(['x'], { type: 'image/jpeg' }));

    expect(error).not.toBeNull();
  });

  it('lets the owner read their own', async () => {
    const objectPath = path();
    const mine = asUser(author);

    await mine.storage.from(BUCKET).upload(objectPath, new Blob(['x'], { type: 'image/jpeg' }));
    const { error } = await mine.storage.from(BUCKET).createSignedUrl(objectPath, 60);

    expect(error).toBeNull();
    await asAdmin().storage.from(BUCKET).remove([objectPath]);
  });
});

describe.skip('correcting a finished end (H17)', () => {
  it('refuses a shrink that would strand a record inside it', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('11:00') });
    await insert({ time: '10:00', endedAt: utc('10:20'), parent: session.data![0].id });

    // The child trigger cannot see this: the parent is what moved.
    const { error } = await asAdmin()
      .from('ripples')
      .update({ ended_at: utc('09:30') })
      .eq('id', session.data![0].id);

    expect(error?.message).toMatch(/falls outside the session span/i);
  });

  it('allows an extension over the next record (H20c)', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('10:00') });
    await insert({ time: '10:30', endedAt: utc('10:30') });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ ended_at: utc('11:00') })
      .eq('id', session.data![0].id);

    expect(error).toBeNull();
  });

  it('allows a shrink that still contains everything inside it', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('11:00') });
    await insert({ time: '09:10', endedAt: utc('09:20'), parent: session.data![0].id });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ ended_at: utc('09:40') })
      .eq('id', session.data![0].id);

    expect(error).toBeNull();
  });

  it('allows an extension into free time', async () => {
    const session = await insert({ time: '09:00', endedAt: utc('10:00') });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ ended_at: utc('12:00') })
      .eq('id', session.data![0].id);

    expect(error).toBeNull();

    const { data } = await asAdmin()
      .from('ripples')
      .select('ended_at')
      .eq('id', session.data![0].id)
      .single();
    expect(Date.parse(data!.ended_at!)).toBe(Date.parse(utc('12:00')));
  });
});

describe.skip('inner ripples are records like any other', () => {
  it('is clamped by the parent when its own time moves', async () => {
    const parent = await insert({ time: '09:00', endedAt: utc('11:00') });
    const inside = await insert({
      time: '09:30',
      endedAt: utc('09:45'),
      parent: parent.data![0].id,
    });

    const { error } = await asAdmin()
      .from('ripples')
      .update({ occurred_time: '13:00', ended_at: utc('13:15') })
      .eq('id', inside.data![0].id);

    expect(error?.message).toMatch(/within its parent/i);
  });

  it('accepts a retroactive addition to a finished session', async () => {
    const parent = await insert({ time: '09:00', endedAt: utc('11:00') });

    const { error } = await insert({
      time: '10:15',
      endedAt: utc('10:15'),
      parent: parent.data![0].id,
    });

    // Remembering something that happened during it is the same act as
    // recording it at the time.
    expect(error).toBeNull();
  });

  it('refuses a record inside a record', async () => {
    const parent = await insert({ time: '09:00', endedAt: utc('11:00') });
    const inside = await insert({
      time: '09:30',
      endedAt: utc('10:00'),
      parent: parent.data![0].id,
    });

    const { error } = await insert({
      time: '09:40',
      endedAt: utc('09:40'),
      parent: inside.data![0].id,
    });

    expect(error?.message).toMatch(/cannot carry inner ripples/i);
  });

  it('takes its own media when deleted, leaving the session alone', async () => {
    const parent = await insert({ time: '09:00', endedAt: utc('11:00'), media: ['keep.jpg'] });
    const inside = await insert({
      time: '09:30',
      endedAt: utc('09:45'),
      parent: parent.data![0].id,
      media: ['gone.jpg'],
    });

    await asAdmin().from('ripples').delete().eq('id', inside.data![0].id);

    const { data } = await asAdmin()
      .from('ripples')
      .select('id, media')
      .in('id', [parent.data![0].id, inside.data![0].id]);

    expect(data).toHaveLength(1);
    expect(data![0].media).toEqual(['keep.jpg']);
  });
});

describe.skip('a span typed in is a span (H18)', () => {
  it('lands as timed, with the duration its times imply', async () => {
    const { data, error } = await insert({ time: '09:00', endedAt: utc('10:30') });

    expect(error).toBeNull();
    expect(Date.parse(data![0].ended_at!) - Date.parse(data![0].started_at!)).toBe(90 * 60 * 1000);
  });

  it('takes a drop inside it: a call during dinner is two things that happened (H20c)', async () => {
    await insert({ time: '09:00', endedAt: utc('10:30') });

    const { error } = await insert({ time: '09:45', endedAt: utc('09:45') });

    expect(error).toBeNull();
  });

  it('may cover a record that starts after it does (H20c)', async () => {
    await insert({ time: '10:00', endedAt: utc('10:00') });

    const { error } = await insert({ time: '09:00', endedAt: utc('11:00') });

    expect(error).toBeNull();
  });

  it('still commits while planned (the column is dormant, H20c)', async () => {
    await insert({ time: '09:00', endedAt: utc('11:00') });

    const { error } = await insert({ time: '09:30', endedAt: utc('10:00'), planned: true });

    expect(error).toBeNull();
  });
});

describe.skip('a span typed inside a session', () => {
  it('is accepted when it lies within its parent', async () => {
    const parent = await insert({ time: '09:00', endedAt: utc('11:00') });

    const { error } = await insert({
      time: '09:30',
      endedAt: utc('10:15'),
      parent: parent.data![0].id,
    });

    expect(error).toBeNull();
  });

  it('is refused when its end runs past the session', async () => {
    const parent = await insert({ time: '09:00', endedAt: utc('11:00') });

    const { error } = await insert({
      time: '10:30',
      endedAt: utc('11:30'),
      parent: parent.data![0].id,
    });

    expect(error?.message).toMatch(/within its parent/i);
  });

  it('may end exactly where its parent does: half-open, so that is inside', async () => {
    const parent = await insert({ time: '09:00', endedAt: utc('11:00') });

    const { error } = await insert({
      time: '10:30',
      endedAt: utc('11:00'),
      parent: parent.data![0].id,
    });

    expect(error).toBeNull();
  });
});
