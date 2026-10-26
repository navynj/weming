import { redirect } from 'next/navigation';

import {
  byNewest,
  initialsOf,
  placeCard,
  type Card,
  type CardFace,
  type CardPhoto,
  type CardRipple,
  ownPoolColumn,
  type GridColumn,
} from '@/features/home/grid';
import { HomeGround } from '@/features/home/home-ground';
import { scopedMonth } from '@/features/home/scope';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { withPoolBadge } from '@/features/pool/home-badge';
import {
  getJointSplashes,
  getMyJointShells,
  getMyOriginTags,
  getMyPlacements,
  getMyPoolNames,
} from '@/lib/queries/pools';
import { getMySplashes, summarizeSplashes } from '@/lib/queries/splashes';
import { getMyTrail } from '@/lib/queries/trail';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/time';
import { signPoolPhotos } from '@/lib/avatars';

/**
 * Home (SPEC 5, H22): the water ground — the lane grid or the date list
 * above, the diving board below. Placed by day; not a feed — nothing anyone
 * else wrote arrives on it. The whole archive comes down at once (one
 * person's few months); the grid renders days as they are scrolled to.
 *
 * `?m=YYYY-MM` opens on that month's newest post; `?top=<id>` opens with
 * that post on top — where a post's page sends Home back to (review);
 * `?manage=lanes` opens lane management, from a lane page.
 */
export async function HomeScreen({
  m,
  top,
  manage,
}: {
  m?: string;
  top?: string;
  manage?: string;
}) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);

  // The proxy guarantees a session; a missing profile means the bootstrap did
  // not complete, so send the visitor back through it.
  if (!profile) redirect('/sign-in');

  const now = new Date();
  const today = todayIn(profile.timezone);
  const month = m ? scopedMonth(m, today) : null;

  const [ripples, categories, mine, pools, originTags] = await Promise.all([
    getMyTrail(supabase, profile.id, profile.timezone),
    getMyCategories(supabase),
    getMySplashes(supabase, profile.id),
    getMyPoolNames(supabase, profile.id),
    getMyOriginTags(supabase, profile.id),
  ]);
  // My ripples on joint splashes show here too (H23): the splash, with only
  // my ripples on it, at my ripple's lane. One I can no longer read (a pool
  // I left) still shows its ripples, as posts of one.
  const mineIds = new Set(mine.map((s) => s.id));
  const [written, made] = await Promise.all([
    getJointSplashes(supabase, [
      ...new Set(
        ripples.flatMap((r) => (r.splash_id && !mineIds.has(r.splash_id) ? [r.splash_id] : [])),
      ),
    ]),
    // One I made with no ripple of mine yet sits in its pool's column (review).
    getMyJointShells(supabase, profile.id),
  ]);
  const joints = [...written, ...made.filter((shell) => !written.some((j) => j.id === shell.id))];
  const boards = [...mine, ...joints];
  const summaries = summarizeSplashes(boards, ripples, profile.timezone, now);
  const poolName = new Map(pools.map((p) => [p.id, p.name]));
  const jointPool = new Map(joints.map((j) => [j.id, j.pool_id!]));
  const latestAt = new Map<string, string>();
  // A joint entry sits where my most recent ripple on it is filed: its lane,
  // or its pool's column when that ripple has none (0016).
  const latestLane = new Map<string, string | null>();
  for (const r of ripples) {
    if (!r.splash_id || !jointPool.has(r.splash_id)) continue;
    const seen = latestLane.get(r.splash_id);
    if (seen === undefined || r.created_at > (latestAt.get(r.splash_id) ?? '')) {
      latestLane.set(r.splash_id, r.category_id);
      latestAt.set(r.splash_id, r.created_at);
    }
  }
  // Who has written on each joint splash and which current members have not,
  // for its faces and its open slot on the Board. A pool I left shows neither
  // anyone else's ripples nor its members: only my own face, no slot.
  const jointFaces = new Map<string, { writers: CardFace[]; awaiting: CardFace[] }>();
  if (joints.length > 0) {
    const [{ data: wrote }, { data: members }] = await Promise.all([
      supabase
        .from('ripples')
        .select('splash_id, author_id, created_at')
        .in(
          'splash_id',
          joints.map((j) => j.id),
        )
        .is('parent_ripple_id', null)
        .order('created_at'),
      supabase
        .from('pool_members')
        .select('pool_id, user_id')
        .in('pool_id', [...new Set(joints.map((j) => j.pool_id!))])
        .is('left_at', null),
    ]);
    const face = (id: string): CardFace => ({
      authorId: id,
      initials: id === profile.id ? initialsOf(profile.display_name) : '',
    });
    for (const j of joints) {
      const writers = [
        ...new Set((wrote ?? []).filter((r) => r.splash_id === j.id).map((r) => r.author_id)),
      ];
      const current = (members ?? []).filter((m) => m.pool_id === j.pool_id).map((m) => m.user_id);
      jointFaces.set(j.id, {
        writers: writers.map(face),
        awaiting: current.filter((id) => !writers.includes(id)).map(face),
      });
    }
  }

  // The joint splash's pool lane, for its tag "<Pool> · <emoji> <pool lane>".
  const jointLane = new Map<string, { name: string; icon: string | null }>();
  if (joints.length > 0) {
    const { data: lanes } = await supabase
      .from('pool_lanes')
      .select('id, name, icon')
      .in('id', [...new Set(joints.map((j) => j.pool_lane_id!))]);
    const laneById = new Map((lanes ?? []).map((l) => [l.id, l]));
    for (const j of joints) {
      const lane = laneById.get(j.pool_lane_id!);
      if (lane) jointLane.set(j.id, { name: lane.name, icon: lane.icon });
    }
  }

  // Just mine (0014): a column per pool after my lanes, headed by the pool's
  // monogram and name — "A pool you left" with a neutral tile once I cannot
  // read it — and each mark showing its pool lane's emoji while I can.
  const ownPools = [
    ...new Set([
      ...mine.flatMap((s) => (s.own_pool_id ? [s.own_pool_id] : [])),
      // A joint entry whose latest ripple of mine has no lane lives there too
      // (0016), as does one with no ripple of mine at all (review).
      ...joints.flatMap((j) => ((latestLane.get(j.id) ?? null) === null ? [j.pool_id!] : [])),
    ]),
  ];
  const ownLaneIcon = new Map<string, string | null>();
  if (ownPools.length > 0) {
    const placed = await getMyPlacements(supabase, profile.id);
    const laneOf = new Map(placed.map((p) => [p.splashId, p.poolLaneId]));
    const { data: lanes } = await supabase
      .from('pool_lanes')
      .select('id, icon')
      .in('id', [...new Set(placed.map((p) => p.poolLaneId))]);
    const iconOf = new Map((lanes ?? []).map((l) => [l.id, l.icon]));
    for (const s of mine) {
      const lane = laneOf.get(s.id);
      if (s.own_pool_id && lane) ownLaneIcon.set(s.id, iconOf.get(lane) ?? null);
    }
  }
  // A pool I am in shows its photo (0024); one I left keeps the neutral tile.
  const columnPhotos = await signPoolPhotos(
    supabase,
    pools
      .filter((p) => ownPools.includes(p.id))
      .map((p) => ({ id: p.id, version: p.photoVersion })),
  );
  const poolColumns: GridColumn[] = ownPools.map((id) => {
    const name = poolName.get(id);
    return {
      id: ownPoolColumn(id),
      name: name ?? 'A pool you left',
      icon: null,
      monogram: name ?? '',
      photo: name ? (columnPhotos[id] ?? null) : null,
      href: null,
    };
  });

  // A card's ripples: its blocks with words, oldest first. A lone block's is its own.
  const threads = new Map<string, CardRipple[]>();
  for (const ripple of [...ripples].reverse()) {
    if (!ripple.note) continue;
    const key = ripple.splash_id ?? ripple.id;
    const entry = { id: ripple.id, note: ripple.note, createdAt: ripple.created_at };
    const list = threads.get(key);
    if (list) list.push(entry);
    else threads.set(key, [entry]);
  }
  // A card's photos, for the Board view: every image across its ripples, oldest first.
  const photos = new Map<string, CardPhoto[]>();
  for (const ripple of [...ripples].reverse()) {
    if (ripple.media.length === 0) continue;
    const key = ripple.splash_id ?? ripple.id;
    const list = photos.get(key) ?? [];
    list.push(...ripple.media.map((path) => ({ rippleId: ripple.id, path })));
    photos.set(key, list);
  }
  const cards: Card[] = summaries
    .map((summary) => {
      const thread = threads.get(summary.id) ?? [];
      const placed = placeCard(
        summary,
        thread.map((r) => r.note).join('\n\n'),
        profile.timezone,
        thread,
      );
      const pictured = photos.get(summary.id);
      const card = {
        ...placed,
        ...(pictured ? { photos: pictured } : {}),
        ...jointFaces.get(summary.id),
      };
      if (summary.ownPoolId) {
        // No badge: the column header says where it lives.
        return {
          ...card,
          lane: {
            icon: ownLaneIcon.get(summary.id) ?? null,
            name: poolName.get(summary.ownPoolId) ?? 'A pool you left',
          },
        };
      }
      const pool = jointPool.get(summary.id);
      return withPoolBadge(
        card,
        pool
          ? {
              poolId: pool,
              poolName: poolName.get(pool) ?? null,
              latestLane: latestLane.get(summary.id) ?? null,
              poolLane: jointLane.get(summary.id) ?? null,
            }
          : undefined,
      );
    })
    // My own splashes carry the pencil; a post of one has no row to edit yet.
    .map((card) => (mineIds.has(card.splash.id) ? { ...card, editable: true } : card))
    // Where each is or was in a pool, on its card (0015).
    .map((card) => {
      const tags = originTags.get(card.splash.id);
      return tags ? { ...card, origins: tags } : card;
    })
    .sort(byNewest);
  const pinned = summaries
    .filter((s) => s.pinnedAt !== null && !jointPool.has(s.id))
    .sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!));

  return (
    // Exactly the dynamic viewport: the grid scrolls inside it, the stack
    // stays put above the safe area.
    <main className="water-ground flex h-dvh min-h-0 flex-col">
      <HomeGround
        cards={cards}
        pinned={pinned}
        categories={categories}
        today={today}
        timeZone={profile.timezone}
        initials={initialsOf(profile.display_name)}
        scrollToMonth={month}
        topParam={top ?? null}
        manageLanes={manage === 'lanes'}
        poolColumns={poolColumns}
      />
    </main>
  );
}
