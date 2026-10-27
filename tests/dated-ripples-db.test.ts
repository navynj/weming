import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A ripple's own day inside its splash's range (0031), through the real
 * actions against the real schema, as a throwaway user. The lane stays the
 * splash's, always (H24); a day is allowed only on a splash with an end
 * date, inside it; a range may not shrink past a dated ripple.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
const as = vi.hoisted(() => ({ user: '' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/supabase/server', async () => {
  const { asUser: client } = await import('./as-user');
  return {
    createClient: async () => {
      const supabase = client(as.user);
      supabase.auth.getUser = (async () => ({
        data: { user: { id: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getUser;
      return supabase;
    },
  };
});

import { updateSplashHeader } from '@/features/splash/actions';
import { addBlock, editBlock } from '@/features/splash/block-actions';

const LANE = crypto.randomUUID();
const RANGE = crypto.randomUUID();
const ONE_DAY = crypto.randomUUID();
let me: string;

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `dated-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  me = data.user.id;
  as.user = me;
  await admin
    .from('profiles')
    .insert({ id: me, display_name: 'Dee', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ id: LANE, user_id: me, name: 'Trips' });
  const client = asUser(me);
  await client.from('splashes').insert([
    {
      id: RANGE,
      owner_id: me,
      title: 'Tofino',
      declared_start: '2026-10-08',
      declared_end: '2026-10-12',
      declared_lane_id: LANE,
    },
    {
      id: ONE_DAY,
      owner_id: me,
      title: 'Lunch',
      declared_start: '2026-10-08',
      declared_lane_id: LANE,
    },
  ]);
});

afterAll(async () => {
  const admin = asAdmin();
  if (me) {
    await admin.from('ripples').delete().eq('author_id', me);
    await admin.from('splashes').delete().eq('owner_id', me);
    await admin.auth.admin.deleteUser(me);
  }
});

const header = {
  title: 'Tofino',
  icon: null,
  declaredLaneId: LANE,
};

describe('a ripple’s own day inside a range (0031)', () => {
  it('saves on a range splash with a day inside the range, and no lane of its own', async () => {
    const id = crypto.randomUUID();
    const done = await addBlock({
      id,
      note: 'surf',
      media: [],
      splashId: RANGE,
      occurredOn: '2026-10-10',
    });
    expect(done).toMatchObject({ ok: true });
    const row = (await asUser(me).from('ripples').select('*').eq('id', id).single()).data!;
    expect(row).toMatchObject({
      occurred_on: '2026-10-10',
      occurred_time: null,
    });
  });

  it('refuses a day outside the range', async () => {
    const done = await addBlock({
      id: crypto.randomUUID(),
      note: 'too late',
      media: [],
      splashId: RANGE,
      occurredOn: '2026-10-13',
    });
    expect(done).toEqual({
      ok: false,
      reason: 'error',
      message: 'That day is outside this splash’s range.',
    });
  });

  it('refuses a day on a one-day splash', async () => {
    const done = await addBlock({
      id: crypto.randomUUID(),
      note: 'dated',
      media: [],
      splashId: ONE_DAY,
      occurredOn: '2026-10-08',
    });
    expect(done).toMatchObject({ ok: false });
    // Undated, it lands: it takes the splash's day.
    const plain = await addBlock({
      id: crypto.randomUUID(),
      note: 'plain',
      media: [],
      splashId: ONE_DAY,
    });
    expect(plain).toMatchObject({ ok: true });
  });

  it('moves a ripple’s day within the range, and refuses one past it', async () => {
    const id = crypto.randomUUID();
    await addBlock({ id, note: 'walk', media: [], splashId: RANGE, occurredOn: '2026-10-09' });
    expect(
      await editBlock({ id, note: 'walk', media: [], occurredOn: '2026-10-11' }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await editBlock({ id, note: 'walk', media: [], occurredOn: '2026-10-20' }),
    ).toMatchObject({
      ok: false,
    });
  });

  it('refuses shrinking a range past a dated ripple, and always allows widening', async () => {
    const shrunk = await updateSplashHeader(RANGE, {
      ...header,
      declaredStart: '2026-10-08',
      declaredEnd: '2026-10-10',
    });
    expect(shrunk).toEqual({ ok: false, message: 'Some entries are dated outside this range.' });
    const widened = await updateSplashHeader(RANGE, {
      ...header,
      declaredStart: '2026-10-05',
      declaredEnd: '2026-10-15',
    });
    expect(widened).toMatchObject({ ok: true });
  });
});
