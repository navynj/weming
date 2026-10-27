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
import { homeViewParam, scopedMonth } from '@/features/home/scope';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { homeLaneFor } from '@/features/pool/links';
import { withPoolBadge } from '@/features/pool/home-badge';
import {
  getJointSplashes,
  getMyJointShells,
  getMyLinks,
  getMyOriginTags,
  getJointTogether,
  getMyPlacements,
  getMyPoolNames,
  getMyThreadRipples,
  getPlacementTogether,
  type MyThreadRipple,
} from '@/lib/queries/pools';
import { effectiveLayout } from '@/features/month-board/board-layout';
import { getHomeLayouts } from '@/lib/queries/layouts';
import { getMySplashes, summarizeSplashes } from '@/lib/queries/splashes';
import { getResponsesOnMine } from '@/lib/queries/responses';
import { sharedSplashIds, withResponded } from '@/features/home/responded';
import { WITH_CATEGORY, type RippleWithCategory } from '@/lib/queries/ripples';
import { getMyTrail } from '@/lib/queries/trail';
import { originTag } from '@/features/pool/origin-tag';
import { poolSplashHref } from '@/features/pool/pool-cards';
import type { Splash } from '@/features/splash/summary';
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
  view,
}: {
  m?: string;
  top?: string;
  manage?: string;
  /** `?view=`: the view to open on, from a lane page's tabs (review); else the Calendar. */
  view?: string;
}) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);

  // The proxy guarantees a session; a missing profile means the bootstrap did
  // not complete, so send the visitor back through it.
  if (!profile) redirect('/sign-in');

  const now = new Date();
  const today = todayIn(profile.timezone);
  const month = m ? scopedMonth(m, today) : null;

  const [ripples, categories, mine, pools, originTags, links] = await Promise.all([
    getMyTrail(supabase, profile.id),
    getMyCategories(supabase),
    getMySplashes(supabase, profile.id),
    getMyPoolNames(supabase, profile.id),
    getMyOriginTags(supabase, profile.id),
    getMyLinks(supabase, profile.id),
  ]);
  // My ripples on joint splashes show here too (H23): the splash, with only
  // my ripples on it, in my lane its pool lane is brought into (H24). One I
  // can no longer read (a pool I left) still shows its ripples, as posts of
  // one.
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
  // Friends' records I added my side to (0035): each in the pool I wrote it
  // in, as that pool sees it; the record row read while it is shared there,
  // else kept from my side's own reading, "no longer shared".
  const myThreads = await getMyThreadRipples(supabase);
  const threadOf = new Map(myThreads.map((t) => [t.splashId, t]));
  const friendIds = [...threadOf.keys()];
  const { data: friendRows } = friendIds.length
    ? await supabase.from('splashes').select('*').in('id', friendIds)
    : { data: [] as Splash[] };
  const friends: Splash[] = friendIds.map(
    (id) => (friendRows ?? []).find((row) => row.id === id) ?? fromThread(threadOf.get(id)!),
  );
  const friendIdSet = new Set(friendIds);
  // Every ripple I can read on my records and theirs (0035): Home shows a
  // record with exactly those. On a friend's, only the pool I wrote in.
  const { data: theirRows } =
    mine.length + friendIds.length > 0
      ? await supabase
          .from('ripples')
          .select(WITH_CATEGORY)
          .in('splash_id', [...mine.map((s) => s.id), ...friendIds])
          .neq('author_id', profile.id)
          .is('parent_ripple_id', null)
          .returns<RippleWithCategory[]>()
      : { data: [] as RippleWithCategory[] };
  const theirs = (theirRows ?? []).filter((r) => {
    const friend = r.splash_id ? threadOf.get(r.splash_id) : undefined;
    return !friend || !r.thread_pool_id || r.thread_pool_id === friend.poolId;
  });
  const { data: theirNames } = theirs.length
    ? await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', [...new Set(theirs.map((r) => r.author_id))])
    : { data: [] as { id: string; display_name: string }[] };
  const initialsBy = new Map((theirNames ?? []).map((n) => [n.id, initialsOf(n.display_name)]));
  const boards = [...mine, ...joints, ...friends];
  const summaries = summarizeSplashes(boards, [...ripples, ...theirs], profile.timezone, now);
  const poolName = new Map(pools.map((p) => [p.id, p.name]));
  const jointPool = new Map(joints.map((j) => [j.id, j.pool_id!]));
  // A joint entry sits in my home lane for its pool lane, else in its pool's
  // column (H24, 0033): derived from my marker, never a ripple.
  const linkedLane = new Map(joints.map((j) => [j.id, homeLaneFor(j.pool_lane_id, links)]));
  // My pool records too (0033): the home lane for the pool lane they are on.
  const myPlacements = mine.length > 0 ? await getMyPlacements(supabase, profile.id) : [];
  // With, per pool, on my records (0035): filled on Home once any pool has
  // someone with it.
  const withByPool = await getPlacementTogether(
    supabase,
    mine.map((s) => s.id),
  );
  const filledMine = new Set(
    mine
      .filter(
        (s) =>
          myPlacements.some((p) => p.splashId === s.id && p.inviteAll) ||
          Object.values(withByPool[s.id] ?? {}).some((ids) => ids.length > 0),
      )
      .map((s) => s.id),
  );
  const ownLane = new Map(
    mine.flatMap((s) => {
      const at = myPlacements.find((p) => p.splashId === s.id && p.poolId === s.own_pool_id);
      return s.own_pool_id && at ? [[s.id, at.poolLaneId] as const] : [];
    }),
  );
  const ownHome = new Map(
    [...ownLane].map(([id, poolLaneId]) => [id, homeLaneFor(poolLaneId, links)] as const),
  );
  // Who has written on each joint splash and which invitees have not (0033),
  // for its faces and its open slot on the Board. A pool I left shows neither
  // anyone else's ripples nor its members: only my own face, no slot.
  const jointFaces = new Map<
    string,
    { together: boolean; writers: CardFace[]; awaiting: CardFace[] }
  >();
  if (joints.length > 0) {
    const [{ data: wrote }, { data: members }, together] = await Promise.all([
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
      getJointTogether(
        supabase,
        joints.map((j) => j.id),
      ),
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
        // Filled with Everyone on, or once anyone besides its maker is picked (0033).
        together: j.joint_invite_all || (together[j.id] ?? []).some((id) => id !== j.created_by),
        writers: writers.map(face),
        // Together's slots (0033): who it is with now, less those who wrote.
        awaiting: (together[j.id] ?? [])
          .filter((id) => current.includes(id) && !writers.includes(id))
          .map(face),
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

  // My pool records and joint records (0014, 0033): a column per pool after
  // my lanes, headed by the pool's monogram and name — "A pool you left" with
  // a neutral tile once I cannot read it — each mark showing its pool lane's
  // emoji while I can; one whose pool lane has a home lane of mine sits there.
  const ownPools = [
    ...new Set([
      ...mine.flatMap((s) =>
        s.own_pool_id && (ownHome.get(s.id) ?? null) === null ? [s.own_pool_id] : [],
      ),
      ...joints.flatMap((j) => ((linkedLane.get(j.id) ?? null) === null ? [j.pool_id!] : [])),
      // A friend's record sits in the pool's column, or my home lane (0035).
      ...myThreads.flatMap((t) => (homeLaneFor(t.poolLaneId, links) === null ? [t.poolId] : [])),
    ]),
  ];
  const ownLaneIcon = new Map<string, string | null>();
  if (ownLane.size > 0) {
    const { data: lanes } = await supabase
      .from('pool_lanes')
      .select('id, icon')
      .in('id', [...new Set(ownLane.values())]);
    const iconOf = new Map((lanes ?? []).map((l) => [l.id, l.icon]));
    for (const [id, lane] of ownLane) ownLaneIcon.set(id, iconOf.get(lane) ?? null);
  }
  // A pool I am in shows its photo (0024); one I left keeps the neutral tile.
  // A joint splash's pool shows its photo on Home too, where its mark is (review).
  const jointPools = new Set(jointPool.values());
  const columnPhotos = await signPoolPhotos(
    supabase,
    pools
      .filter((p) => ownPools.includes(p.id) || jointPools.has(p.id))
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

  // A card's ripples: its blocks with words or photos, oldest first — the
  // top card shows each one's photos under its words. A lone block's is its own.
  // Mine first, then others' (0035), each oldest first.
  const threads = new Map<string, CardRipple[]>();
  const othersOldest = [...theirs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const ripple of [...[...ripples].reverse(), ...othersOldest]) {
    if (!ripple.note && ripple.media.length === 0) continue;
    const key = ripple.splash_id ?? ripple.id;
    const theirsToo = ripple.author_id !== profile.id;
    const entry = {
      id: ripple.id,
      note: ripple.note ?? '',
      createdAt: ripple.created_at,
      ...(theirsToo
        ? { authorId: ripple.author_id, initials: initialsBy.get(ripple.author_id) ?? '' }
        : {}),
    };
    const list = threads.get(key);
    if (list) list.push(entry);
    else threads.set(key, [entry]);
  }
  // My record's sides, a line per pool: its members' ripples there (0035).
  const sidesOf = new Map<string, { label: string; count: number }[]>();
  for (const r of theirs) {
    if (!r.splash_id || !r.thread_pool_id || !mineIds.has(r.splash_id)) continue;
    const list = sidesOf.get(r.splash_id) ?? [];
    const label = poolName.get(r.thread_pool_id) ?? 'A pool';
    const at = list.find((x) => x.label === label);
    if (at) at.count += 1;
    else list.push({ label, count: 1 });
    sidesOf.set(r.splash_id, list);
  }
  // A card's photos, for the Board view: every image across its ripples, oldest first.
  const photos = new Map<string, CardPhoto[]>();
  for (const ripple of [...[...ripples].reverse(), ...othersOldest]) {
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
        thread.flatMap((r) => (r.note ? [r.note] : [])).join('\n\n'),
        profile.timezone,
        thread,
      );
      const pictured = photos.get(summary.id);
      const card = {
        ...placed,
        ...(pictured ? { photos: pictured } : {}),
        ...jointFaces.get(summary.id),
        ...(filledMine.has(summary.id) ? { together: true } : {}),
        ...(sidesOf.has(summary.id) ? { sides: sidesOf.get(summary.id) } : {}),
      };
      const friend = friendIdSet.has(summary.id) ? threadOf.get(summary.id) : undefined;
      if (friend) {
        // Someone's record I wrote on in one pool (0035): that pool's, read as
        // it reads it, opening there while shared; never mine to pin or edit.
        const home = homeLaneFor(friend.poolLaneId, links);
        const name = friend.poolName ?? 'A pool you left';
        return {
          ...card,
          column: home ?? ownPoolColumn(friend.poolId),
          pools: friend.poolName ? [friend.poolName] : [],
          poolPhoto: columnPhotos[friend.poolId] ?? null,
          href: friend.shared ? poolSplashHref(friend.poolId, friend.splashId) : undefined,
          menu: { pin: false, delete: false },
          editable: false,
          ...(home || !friend.poolLane ? {} : { lane: { icon: friend.poolLane.icon, name } }),
          origins: [
            ...(friend.poolLane
              ? [originTag(name, friend.poolLane.icon, friend.poolLane.name)]
              : []),
            ...(friend.shared ? [] : ['No longer shared']),
          ],
        };
      }
      if (summary.ownPoolId) {
        // No badge: the column header says where it lives.
        const home = ownHome.get(summary.id) ?? null;
        return {
          ...card,
          ...(home ? { column: home } : {}),
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
              poolPhoto: columnPhotos[pool] ?? null,
              linkedLane: linkedLane.get(summary.id) ?? null,
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
  // The calendar's layouts (0025): mine on Home; else, for a joint splash,
  // its pool's — wholly one or the other, never a mix.
  const layouts = await getHomeLayouts(
    supabase,
    profile.id,
    joints.map((j) => ({ splashId: j.id, poolId: j.pool_id! })),
  );
  // What readers left (H25), only where someone besides me can see the post.
  const sharedIds = await sharedSplashIds(supabase, profile.id, mine, joints);
  const [answered, respondedAt] = await Promise.all([
    withResponded(supabase, cards, sharedIds),
    getResponsesOnMine(
      supabase,
      profile.id,
      ripples.flatMap((r) =>
        r.splash_id && sharedIds.has(r.splash_id) ? [{ id: r.id, splashKey: r.splash_id }] : [],
      ),
    ),
  ]);
  const laid = answered.map((read) => {
    const card: Card = { ...read, respondedAt: respondedAt[read.splash.id] };
    const pooled = layouts.pool[card.splash.id] ?? null;
    const { layout, source } = effectiveLayout(layouts.home[card.splash.id], pooled);
    return source
      ? { ...card, layout, layoutSource: source, poolLayout: pooled }
      : { ...card, poolLayout: pooled };
  });
  const pinned = summaries
    .filter((s) => s.pinnedAt !== null && !jointPool.has(s.id))
    .sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!));

  return (
    // Exactly the dynamic viewport: the grid scrolls inside it, the stack
    // stays put above the safe area.
    <main className="water-ground flex h-dvh min-h-0 flex-col">
      <HomeGround
        cards={laid}
        pinned={pinned}
        categories={categories}
        today={today}
        timeZone={profile.timezone}
        initials={initialsOf(profile.display_name)}
        scrollToMonth={month}
        topParam={top ?? null}
        manageLanes={manage === 'lanes'}
        initialView={homeViewParam(view)}
        poolColumns={poolColumns}
      />
    </main>
  );
}

/** A friend's record I can no longer read, from my side's own reading of it (0035). */
function fromThread(t: MyThreadRipple): Splash {
  return {
    id: t.splashId,
    owner_id: t.ownerId,
    title: t.title,
    icon: t.icon,
    declared_start: t.declaredStart,
    declared_end: t.declaredEnd,
    declared_lane_id: null,
    session_id: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    description: null,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: new Date(0).toISOString(),
    written_on: t.declaredStart ?? new Date(0).toISOString().slice(0, 10),
  };
}
