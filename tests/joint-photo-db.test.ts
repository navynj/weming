import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A joint record's first ripple keeps its photos (2026-10-30): the compose
 * sheet uploaded them, and `createJointSplash` once took only the words, so
 * a photo dropped on a joint record was lost and its object left behind.
 *
 * Needs the local stack; the db project runs it.
 */
const as = vi.hoisted(() => ({ user: '' }));
vi.mock('next/cache', () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock('@/lib/notifications/after', () => ({ pushAfter: () => undefined }));
vi.mock('@/lib/supabase/server', async () => {
  const { asUser: client } = await import('./as-user');
  return {
    createClient: async () => {
      const supabase = client(as.user);
      supabase.auth.getClaims = (async () => ({
        data: { claims: { sub: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getClaims;
      return supabase;
    },
  };
});

import { createJointSplash } from '@/features/pool/actions';

let ana: string;
let pool: string;
let lane: string;

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `joint-photo-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  ana = data.user.id;
  await admin.from('profiles').insert({ id: ana, display_name: 'Ana', timezone: 'Asia/Seoul' });
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Photos',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool)).data![0].id;
  as.user = ana;
});

afterAll(async () => {
  const admin = asAdmin();
  await admin.from('pools').delete().eq('id', pool);
  await admin.auth.admin.deleteUser(ana);
});

describe('a joint record dropped with a photo', () => {
  it('keeps the photo and its size, even with no words', async () => {
    const id = crypto.randomUUID();
    const path = `${ana}/${crypto.randomUUID()}.webp`;
    const made = await createJointSplash({
      id,
      poolId: pool,
      poolLaneId: lane,
      title: 'Tofino',
      icon: null,
      body: '',
      media: [path],
      mediaMeta: { [path]: { w: 1600, h: 1200, t: { w: 400, h: 300 } } },
      declaredStart: '2026-10-30',
      declaredEnd: null,
    });
    expect(made).toEqual({ ok: true, id });
    const { data } = await asAdmin()
      .from('ripples')
      .select('note, media, media_meta')
      .eq('splash_id', id)
      .single();
    expect(data).toEqual({
      note: null,
      media: [path],
      media_meta: { [path]: { w: 1600, h: 1200, t: { w: 400, h: 300 } } },
    });
  });
});
