import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin } from './as-user';

/**
 * Uploads a draft will not use, removed (2026-10-30): only my own, only
 * what no ripple names, each with its display copy and thumbnail.
 *
 * Needs the local stack; the db project runs it.
 */
const as = vi.hoisted(() => ({ user: '' }));
vi.mock('next/cache', () => ({ refresh: () => {}, revalidatePath: () => {} }));
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

import { discardMediaUploads } from '@/features/input-sheet/upload-actions';

const BUCKET = 'ripple-media';
let ana: string;
let ben: string;
let splash: string;

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `discard-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'Asia/Seoul' });
  return data.user.id;
}

/** A photo with both copies beside it, stored in `owner`'s folder. */
async function stored(owner: string): Promise<string> {
  const path = `${owner}/${crypto.randomUUID()}.webp`;
  for (const name of [path, path.replace('.webp', '.d.webp'), path.replace('.webp', '.t.webp')]) {
    const { error } = await asAdmin() // storage-boundary: allow
      .storage.from(BUCKET)
      .upload(name, new Blob(['x'], { type: 'image/webp' }), { contentType: 'image/webp' });
    if (error) throw error;
  }
  return path;
}

async function names(owner: string): Promise<string[]> {
  const { data } = await asAdmin().storage.from(BUCKET).list(owner); // storage-boundary: allow
  return (data ?? []).map((o) => `${owner}/${o.name}`).sort();
}

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  const lane = await asAdmin()
    .from('my_categories')
    .insert({ user_id: ana, name: 'Walks', icon: '🚶' })
    .select('id')
    .single();
  if (lane.error) throw lane.error;
  const made = await asAdmin()
    .from('splashes')
    .insert({ owner_id: ana, created_by: ana, title: 'Keep', declared_lane_id: lane.data.id })
    .select('id')
    .single();
  if (made.error) throw made.error;
  splash = made.data.id;
});

afterAll(async () => {
  const admin = asAdmin();
  for (const who of [ana, ben]) {
    const left = await names(who);
    if (left.length) await admin.storage.from(BUCKET).remove(left); // storage-boundary: allow
  }
  await admin.from('splashes').delete().eq('id', splash);
  for (const id of [ana, ben]) await admin.auth.admin.deleteUser(id);
});

describe('discarding a draft’s uploads', () => {
  it('removes my unused photo with its copies, and keeps one a ripple names', async () => {
    const unused = await stored(ana);
    const named = await stored(ana);
    const { error } = await asAdmin()
      .from('ripples')
      .insert({ author_id: ana, splash_id: splash, media: [named] });
    if (error) throw error;

    as.user = ana;
    expect(await discardMediaUploads([unused, named])).toEqual({ ok: true });
    const left = await names(ana);
    expect(left.filter((p) => p.startsWith(unused.slice(0, -5)))).toEqual([]);
    expect(left.filter((p) => p.startsWith(named.slice(0, -5)))).toHaveLength(3);
  });

  it('never touches someone else’s folder', async () => {
    const bens = await stored(ben);
    as.user = ana;
    expect(await discardMediaUploads([bens, `${ana}/../${bens}`])).toEqual({ ok: true });
    expect(await names(ben)).toHaveLength(3);
  });

  it('does nothing signed out', async () => {
    const mine = await stored(ana);
    as.user = '';
    expect(await discardMediaUploads([mine])).toEqual({ ok: false });
    expect((await names(ana)).filter((p) => p.startsWith(mine.slice(0, -5)))).toHaveLength(3);
  });
});
