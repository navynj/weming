import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

// Signing runs as the viewer (lib/media.ts): the server client is whoever `as.user` names.
const as = vi.hoisted(() => ({ user: '' }));
vi.mock('@/lib/supabase/server', async () => {
  const { asUser: client } = await import('./as-user');
  return {
    createClient: async () => {
      const supabase = client(as.user);
      // A minted token has no session behind it; the action only needs its subject.
      supabase.auth.getClaims = (async () => ({
        data: { claims: { sub: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getClaims;
      return supabase;
    },
  };
});

import { signBoardPhotos, signExportMedia } from '@/lib/media';
import { MEDIA_BUCKET } from '@/lib/media-bucket';

/**
 * A shared image signs my photos alone (H63). Ana's record is shared to
 * Crew, and Ben writes a side on it there with a photo: Ana may see Ben's
 * photo on her board, but an export asked for it gets nothing — the check is
 * who wrote the ripple, on the server, whatever the browser asks.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

const people: string[] = [];
const pools: string[] = [];
const objects: string[] = [];

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `share-${name}-${crypto.randomUUID()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: id, name: 'Day' });
  people.push(id);
  return id;
}

async function photo(owner: string): Promise<string> {
  const path = `${owner}/${crypto.randomUUID()}.png`;
  const stored = await asAdmin()
    .storage.from(MEDIA_BUCKET)
    .upload(path, PNG, { contentType: 'image/png' });
  if (stored.error) throw stored.error;
  objects.push(path);
  return path;
}

afterAll(async () => {
  const admin = asAdmin();
  if (objects.length > 0) await admin.storage.from(MEDIA_BUCKET).remove(objects);
  await admin.from('ripples').delete().in('author_id', people);
  for (const id of pools) await admin.from('pools').delete().eq('id', id);
  for (const id of people) {
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

/** Ana's record "Tofino" shared to Crew: her photo and video on it, and Ben's side with his. */
async function world() {
  const [ana, ben] = [await person('Ana'), await person('Ben')];
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Crew',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🧭', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  const crew = made.data!;
  pools.push(crew);
  const token = (await asUser(ana).rpc('create_invite', { p_pool: crew })).data![0].token;
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;
  const poolLane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', crew).single())
    .data!.id;
  const lane = (await asAdmin().from('my_categories').select('id').eq('user_id', ana).single())
    .data!.id;

  const record = crypto.randomUUID();
  const splash = await asUser(ana).from('splashes').insert({
    id: record,
    owner_id: ana,
    title: 'Tofino',
    declared_start: '2026-10-03',
    declared_lane_id: lane,
  });
  if (splash.error) throw splash.error;
  const placed = await asUser(ana)
    .from('splash_placements')
    .insert({ splash_id: record, pool_id: crew, pool_lane_id: poolLane });
  if (placed.error) throw placed.error;
  // With Ben (0035): his side can be written.
  const together = await asUser(ana).rpc('set_placement_together', {
    p_splash: record,
    p_pool: crew,
    p_users: [ben],
    p_everyone: false,
  });
  if (together.error) throw together.error;

  const anaPath = await photo(ana);
  const benPath = await photo(ben);
  const anaRipple = await asUser(ana)
    .from('ripples')
    .insert({
      author_id: ana,
      media: [anaPath],
      note: `Watch https://youtu.be/${ANA_VIDEO}`,
      splash_id: record,
    })
    .select('id')
    .single();
  if (anaRipple.error) throw anaRipple.error;
  const benRipple = await asUser(ben)
    .from('ripples')
    .insert({
      author_id: ben,
      media: [benPath],
      note: `Mine: https://youtu.be/${BEN_VIDEO}`,
      splash_id: record,
      thread_pool_id: crew,
    })
    .select('id')
    .single();
  if (benRipple.error) throw benRipple.error;

  return {
    ana,
    ben,
    anaPath,
    benPath,
    anaRipple: anaRipple.data.id,
    benRipple: benRipple.data.id,
  };
}

/**
 * YouTube, stood in for: a thumbnail fetch never leaves the machine. Every
 * other request (the local stack) goes through.
 */
const real = globalThis.fetch;
const thumbs = vi.hoisted(() => ({
  asked: [] as string[],
  answer: 'ok' as 'ok' | '404' | 'throw' | 'html',
}));
beforeEach(() => {
  thumbs.asked.length = 0;
  thumbs.answer = 'ok';
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://i.ytimg.com/')) return real(input, init);
    thumbs.asked.push(url);
    if (thumbs.answer === 'throw') throw new DOMException('timed out', 'TimeoutError');
    if (thumbs.answer === '404') return new Response('', { status: 404 });
    if (thumbs.answer === 'html') {
      return new Response('<html>', { headers: { 'content-type': 'text/html' } });
    }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      headers: { 'content-type': 'image/jpeg' },
    });
  });
});
afterEach(() => vi.unstubAllGlobals());

const ANA_VIDEO = 'AnaVideo123';
const BEN_VIDEO = 'BenVideo123';
const yt = (id: string): string => `yt:${id}`;

describe('signExportMedia (H63)', () => {
  it('signs my photo and refuses a member’s on my own record, though my board may show it', async () => {
    const { ana, ben, anaPath, benPath, anaRipple, benRipple } = await world();
    const both = [
      { rippleId: anaRipple, path: anaPath },
      { rippleId: benRipple, path: benPath },
    ];
    as.user = ana;
    // Ana's board sees both: Ben's side is on her record.
    const board = await signBoardPhotos(both);
    expect(board[anaPath]).toBeTruthy();
    expect(board[benPath]).toBeTruthy();
    // Her shared image gets hers alone.
    const exported = await signExportMedia(both);
    expect(exported[anaPath]).toBeTruthy();
    expect(exported[benPath]).toBeNull();
    // A path claimed on her own ripple that the ripple does not carry is refused too.
    const claimed = await signExportMedia([{ rippleId: anaRipple, path: benPath }]);
    expect(claimed[benPath]).toBeNull();

    // And Ben's export of the same record: his photo, never Ana's.
    as.user = ben;
    const his = await signExportMedia(both);
    expect(his[benPath]).toBeTruthy();
    expect(his[anaPath]).toBeNull();
  });

  it('fetches my video’s thumbnail on the server, from the URL its id makes, as a data URL', async () => {
    const { ana, anaRipple } = await world();
    as.user = ana;
    const out = await signExportMedia([{ rippleId: anaRipple, path: yt(ANA_VIDEO) }]);
    expect(out[yt(ANA_VIDEO)]).toBe('data:image/jpeg;base64,/9j/');
    expect(thumbs.asked).toEqual([`https://i.ytimg.com/vi/${ANA_VIDEO}/hqdefault.jpg`]);
  });

  it('refuses a video on someone else’s ripple, and one my words do not link to, fetching nothing', async () => {
    const { ana, anaRipple, benRipple } = await world();
    as.user = ana;
    const out = await signExportMedia([
      // Ben's video, on his side of her record: hers to see, not hers to share.
      { rippleId: benRipple, path: yt(BEN_VIDEO) },
      // Ben's video claimed on her own ripple, whose words never link to it.
      { rippleId: anaRipple, path: yt(BEN_VIDEO) },
    ]);
    expect(out[yt(BEN_VIDEO)]).toBeNull();
    expect(thumbs.asked).toEqual([]);
  });

  it('refuses a malformed id, whatever it names, fetching nothing', async () => {
    const { ana, anaRipple } = await world();
    as.user = ana;
    const bad = ['yt:short', 'yt:AnaVideo1234', 'yt:../../x/y.jpg', 'yt:a@evil.com/xx', 'yt:'];
    const out = await signExportMedia(bad.map((path) => ({ rippleId: anaRipple, path })));
    for (const path of bad) expect(out[path]).toBeNull();
    expect(thumbs.asked).toEqual([]);
  });

  it.each(['404', 'throw', 'html'] as const)(
    'draws the plain tile when the thumbnail cannot be had (%s)',
    async (answer) => {
      const { ana, anaRipple, anaPath } = await world();
      thumbs.answer = answer;
      as.user = ana;
      const out = await signExportMedia([
        { rippleId: anaRipple, path: yt(ANA_VIDEO) },
        { rippleId: anaRipple, path: anaPath },
      ]);
      expect(out[yt(ANA_VIDEO)]).toBeNull();
      // The photo beside it is signed regardless.
      expect(out[anaPath]).toBeTruthy();
    },
  );
});
