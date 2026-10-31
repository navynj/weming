import { redirect } from 'next/navigation';

import {
  byNewest,
  initialsOf,
  placeCard,
  type Card,
  type CardFace,
  type CardPhoto,
  type CardRipple,
  inLeftPool,
  ownPoolColumn,
  type GridColumn,
} from '@/features/home/grid';
import { FreshOnArrival } from '@/features/home/fresh-on-arrival';
import { NotifyCard } from '@/features/notifications/notify-card';
import { HomeGround } from '@/features/home/home-ground';
import { homeViewParam, scopedMonth } from '@/features/home/scope';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { withPoolBadge } from '@/features/pool/home-badge';
import {
  getJointSplashes,
  getMyJointShells,
  getMyFilings,
  getHandedRipples,
  getMyHandedThreads,
  getMyLeftPoolRipples,
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
import { WITH_SPLASH, type RippleWithSplash } from '@/lib/queries/ripples';
import { getMyTrail } from '@/lib/queries/trail';
import { originTag } from '@/features/pool/origin-tag';
import { poolSplashHref } from '@/features/pool/pool-cards';
import { declaredRange, orderBlocks } from '@/features/splash/block-day';
import type { Splash } from '@/features/splash/summary';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/time';
import { signPoolPhotos } from '@/lib/avatars';
import { rippleMedia } from '@/lib/ripple-media';

/**
 * Home (SPEC 5, H22): the water ground — the lane grid or the date list
 * above, the diving board below. Placed by day; not a feed — nothing anyone
 * else wrote arrives on it. The whole archive comes down at once (one
 * person's few months); the grid renders days as they are scrolled to.
 *
 * `?m=YYYY-MM` opens on that month's newest post; `?top=<id>` opens with
 * that post on top — where a post's page sends Home back to (review);
 */
export async function HomeScreen({
  m,
  top,
  view,
  welcome = false,
}: {
  m?: string;
  top?: string;
  /** `?view=`: the view to open on, from a lane page's tabs (review); else the Calendar. */
  view?: string;
  /** `?welcome`: a first sign-in, so the notifications card while I am in no pool (review). */
  welcome?: boolean;
}) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);

  // The proxy guarantees a session; a missing profile means the bootstrap did
  // not complete, so send the visitor back through it.
  if (!profile) redirect('/sign-in');

  const now = new Date();
  const today = todayIn(profile.timezone);
  const month = m ? scopedMonth(m, today) : null;

  // Every read below that needs only who I am, in one wave (review: a
  // place switch was ~16 sequential round trips); each later one starts as
  // soon as what it needs is known and is awaited only where it is used.
  const [ripples, categories, mine, pools, originTags, filings, made, myThreads, leftPool, placed] =
    await Promise.all([
      getMyTrail(supabase, profile.id),
      getMyCategories(supabase),
      getMySplashes(supabase, profile.id),
      getMyPoolNames(supabase, profile.id),
      getMyOriginTags(supabase, profile.id),
      // Where I filed records not in my lanes (H45).
      getMyFilings(supabase),
      // One I made with no ripple of mine yet sits in its pool's column (review).
      getMyJointShells(supabase, profile.id),
      // Friends' records I added my side to (0035).
      getMyThreadRipples(supabase),
      // Ones on a joint splash of a pool I left (0041): that pool's column.
      getMyLeftPoolRipples(supabase),
      getMyPlacements(supabase, profile.id),
    ]);
  // My ripples on joint splashes show here too (H23): the splash, with only
  // my ripples on it, in my lane its pool lane is brought into (H24). One I
  // can no longer read (a pool I left) still shows its ripples, as posts of
  // one.
  const mineIds = new Set(mine.map((s) => s.id));
  // Friends' records I added my side to (0035): each in the pool I wrote it
  // in, as that pool sees it; the record row read while it is shared there,
  // else kept from my side's own reading, "no longer shared".
  const threadOf = new Map(myThreads.map((t) => [t.splashId, t]));
  const friendIds = [...threadOf.keys()];
  // The second wave: what the first named.
  const [written, { data: friendRows }, { data: theirRows }, withByPool, handed] =
    await Promise.all([
      getJointSplashes(supabase, [
        ...new Set(
          ripples.flatMap((r) => (r.splash_id && !mineIds.has(r.splash_id) ? [r.splash_id] : [])),
        ),
      ]),
      friendIds.length
        ? supabase.from('splashes').select('*').in('id', friendIds)
        : Promise.resolve({ data: [] as Splash[] }),
      // Every ripple I can read on my records and theirs (0035): Home shows a
      // record with exactly those. On a friend's, only the pool I wrote in.
      mine.length + friendIds.length > 0
        ? supabase
            .from('ripples')
            .select(WITH_SPLASH)
            .in('splash_id', [...mine.map((s) => s.id), ...friendIds])
            .neq('author_id', profile.id)
            .is('parent_ripple_id', null)
            .returns<RippleWithSplash[]>()
        : Promise.resolve({ data: [] as RippleWithSplash[] }),
      // With, per pool, on my records (0035): filled on Home once any pool has
      // someone with it.
      getPlacementTogether(
        supabase,
        mine.map((s) => s.id),
      ),
      // Threads my records handed to a pool I left with remove (0061).
      getMyHandedThreads(
        supabase,
        mine.map((s) => s.id),
      ),
    ]);
  // A handed thread reads as it stood when I left, on my record, under the
  // pool I left (0061).
  const handedRows = await getHandedRipples(supabase, handed);
  const joints = [...written, ...made.filter((shell) => !written.some((j) => j.id === shell.id))];
  const friends: Splash[] = friendIds.map(
    (id) => (friendRows ?? []).find((row) => row.id === id) ?? fromThread(threadOf.get(id)!),
  );
  const friendIdSet = new Set(friendIds);
  const theirs = [...(theirRows ?? []), ...handedRows].filter((r) => {
    const friend = r.splash_id ? threadOf.get(r.splash_id) : undefined;
    return !friend || !r.thread_pool_id || r.thread_pool_id === friend.poolId;
  });
  // The third wave, started together: what the joints and the others' ripples name.
  const namesRead = theirs.length
    ? supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', [...new Set(theirs.flatMap((r) => (r.author_id ? [r.author_id] : [])))])
    : Promise.resolve({ data: [] as { id: string; display_name: string }[] });
  const jointReads =
    joints.length > 0
      ? Promise.all([
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
        ])
      : null;
  const jointLanesRead =
    joints.length > 0
      ? supabase
          .from('pool_lanes')
          .select('id, name, icon')
          .in('id', [...new Set(joints.map((j) => j.pool_lane_id!))])
      : null;
  // The calendar's layouts (0025): mine on Home; else, for a joint splash,
  // its pool's — wholly one or the other, never a mix. And the Lane view's,
  // kept apart (0045).
  const jointPlaces = joints.map((j) => ({ splashId: j.id, poolId: j.pool_id! }));
  const layoutsRead = Promise.all([
    getHomeLayouts(supabase, profile.id, jointPlaces),
    getHomeLayouts(supabase, profile.id, jointPlaces, 'lane'),
  ]);
  const sharedRead = sharedSplashIds(supabase, profile.id, mine, joints, placed);
  const { data: theirNames } = await namesRead;
  const initialsBy = new Map((theirNames ?? []).map((n) => [n.id, initialsOf(n.display_name)]));
  const boards = [...mine, ...joints, ...friends];
  const summaries = summarizeSplashes(boards, [...ripples, ...theirs], profile.timezone, now);
  const poolName = new Map(pools.map((p) => [p.id, p.name]));
  const jointPool = new Map(joints.map((j) => [j.id, j.pool_id!]));
  // Who started each joint splash: its title is theirs (H63).
  const jointMaker = new Map(joints.map((j) => [j.id, j.created_by]));
  // A joint entry sits in the lane of mine I filed it in, else in its pool's
  // column (H45): my filing, never the record.
  const linkedLane = new Map(joints.map((j) => [j.id, filings[j.id] ?? null]));
  // My pool records too: filed, else their pool's column (H45).
  const myPlacements = mine.length > 0 ? placed : [];
  const filledMine = new Set(
    mine
      .filter(
        (s) =>
          myPlacements.some((p) => p.splashId === s.id && p.inviteAll) ||
          Object.values(withByPool[s.id] ?? {}).some((ids) => ids.length > 0),
      )
      .map((s) => s.id),
  );
  const ownAt = new Map(
    mine.flatMap((s) => {
      if (!s.own_pool_id) return [];
      const at = myPlacements.find((p) => p.splashId === s.id && p.poolId === s.own_pool_id);
      return at ? [[s.id, at] as const] : [];
    }),
  );
  const ownLane = new Map([...ownAt].map(([id, at]) => [id, at.poolLaneId] as const));
  const ownShownIn = (s: { id: string; own_pool_id: string | null }): string | null =>
    ownAt.get(s.id)?.poolId ?? s.own_pool_id;
  const ownHome = new Map(
    mine.flatMap((s) => (s.own_pool_id ? [[s.id, filings[s.id] ?? null] as const] : [])),
  );
  // Who has written on each joint splash and which invitees have not (0033),
  // for its faces and its open slot on the Board. A pool I left shows neither
  // anyone else's ripples nor its members: only my own face, no slot.
  const jointFaces = new Map<
    string,
    { together: boolean; writers: CardFace[]; waitsForMe: boolean }
  >();
  if (joints.length > 0) {
    const [{ data: wrote }, { data: members }, together] = await jointReads!;
    const face = (id: string): CardFace => ({
      authorId: id,
      initials: id === profile.id ? initialsOf(profile.display_name) : '',
    });
    for (const j of joints) {
      const writers = [
        ...new Set(
          (wrote ?? []).flatMap((r) => (r.splash_id === j.id && r.author_id ? [r.author_id] : [])),
        ),
      ];
      const current = (members ?? []).filter((m) => m.pool_id === j.pool_id).map((m) => m.user_id);
      jointFaces.set(j.id, {
        // Filled with Everyone on, or once anyone besides its maker is picked (0033).
        together: j.joint_invite_all || (together[j.id] ?? []).some((id) => id !== j.created_by),
        writers: writers.map(face),
        // Together's slot (0033, H42e): mine alone, while I am with it and have not written.
        waitsForMe:
          (together[j.id] ?? []).includes(profile.id) &&
          current.includes(profile.id) &&
          !writers.includes(profile.id),
      });
    }
  }

  // The joint splash's pool lane, for its tag "<Pool> · <emoji> <pool lane>".
  const jointLane = new Map<string, { name: string; icon: string | null }>();
  if (joints.length > 0) {
    const { data: lanes } = await jointLanesRead!;
    const laneById = new Map((lanes ?? []).map((l) => [l.id, l]));
    for (const j of joints) {
      const lane = laneById.get(j.pool_lane_id!);
      if (lane) jointLane.set(j.id, { name: lane.name, icon: lane.icon });
    }
  }

  // My pool records and joint records (0014, 0033): a column per pool after
  // my lanes, headed by the pool's monogram and name — "A pool you left" with
  // a neutral tile once I cannot read it — each mark showing its pool lane's
  // emoji while I can; one I filed in a lane of mine sits there (H45).
  const ownPools = [
    ...new Set([
      ...mine.flatMap((s) =>
        s.own_pool_id && (ownHome.get(s.id) ?? null) === null ? [ownShownIn(s)!] : [],
      ),
      ...joints.flatMap((j) => ((linkedLane.get(j.id) ?? null) === null ? [j.pool_id!] : [])),
      // A friend's record sits in the pool's column, or where I filed it (0035, H45).
      ...myThreads.flatMap((t) => (filings[t.splashId] ? [] : [t.poolId])),
      ...leftPool.values(),
    ]),
  ];
  const ownLaneIcon = new Map<string, string | null>();
  // Read beside the pools' photos below.
  const ownLanesRead =
    ownLane.size > 0
      ? supabase
          .from('pool_lanes')
          .select('id, icon')
          .in('id', [...new Set(ownLane.values())])
      : null;
  if (ownLanesRead) {
    const { data: lanes } = await ownLanesRead;
    const iconOf = new Map((lanes ?? []).map((l) => [l.id, l.icon]));
    for (const [id, lane] of ownLane) ownLaneIcon.set(id, iconOf.get(lane) ?? null);
  }
  // A pool I am in shows its photo (0024); one I left keeps the neutral tile.
  // A joint splash's pool shows its photo on Home too, where its mark is (review).
  const jointPools = new Set(jointPool.values());
  // Every pool a record of mine is shared to now (review): its faces' place
  // on the Calendar shows them all, not me.
  const sharedTo = new Map<string, string[]>();
  for (const p of myPlacements) {
    if (!p.shared || !poolName.has(p.poolId)) continue;
    sharedTo.set(p.splashId, [...(sharedTo.get(p.splashId) ?? []), p.poolId]);
  }
  const sharedPoolIds = new Set([...sharedTo.values()].flat());
  const columnPhotos = await signPoolPhotos(
    supabase,
    pools
      .filter((p) => ownPools.includes(p.id) || jointPools.has(p.id) || sharedPoolIds.has(p.id))
      .map((p) => ({ id: p.id, version: p.photoVersion })),
  );
  const poolColumns: GridColumn[] = ownPools
    .filter((id) => pools.find((p) => p.id === id)?.onHome !== false)
    .map((id) => {
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

  // A card's ripples: its blocks with words or photos, in the detail sheet's
  // order (H42g: by day on a range, else as written; mine and others' read
  // together) — the top card shows each one's photos under its words. A lone
  // block's is its own.
  const threads = new Map<string, CardRipple[]>();
  const rangeOf = new Map(boards.map((b) => [b.id, declaredRange(b)]));
  const byKey = new Map<string, typeof ripples>();
  for (const ripple of [...ripples, ...theirs]) {
    const key = ripple.splash_id ?? ripple.id;
    byKey.set(key, [...(byKey.get(key) ?? []), ripple]);
  }
  const inOrder = [...byKey].flatMap(([key, rows]) => orderBlocks(rows, rangeOf.get(key) ?? null));
  for (const ripple of inOrder) {
    // A part removed by a hand-over (0061) has no words, so no line here.
    if ((!ripple.note && ripple.media.length === 0) || !ripple.author_id) continue;
    const key = ripple.splash_id ?? ripple.id;
    const author = ripple.author_id;
    const entry = {
      id: ripple.id,
      note: ripple.note ?? '',
      createdAt: ripple.created_at,
      byMe: author === profile.id,
      ...(author !== profile.id
        ? { authorId: author, initials: initialsBy.get(author) ?? '' }
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
    const label = poolName.get(r.thread_pool_id) ?? 'A pool you left';
    const at = list.find((x) => x.label === label);
    if (at) at.count += 1;
    else list.push({ label, count: 1 });
    sidesOf.set(r.splash_id, list);
  }
  // A card's photos, for the Board view: every image across its ripples, in their order.
  const photos = new Map<string, CardPhoto[]>();
  for (const ripple of inOrder) {
    const key = ripple.splash_id ?? ripple.id;
    const list = photos.get(key) ?? [];
    const media = rippleMedia(ripple);
    if (media.length === 0) continue;
    list.push(...media);
    photos.set(key, list);
  }
  // A pool switched off my Home (0039): what I wrote there stays off it —
  // my pool records, its joint records, my side on someone's record there.
  const offHome = new Set(pools.filter((p) => !p.onHome).map((p) => p.id));
  const writtenIn = (summary: { id: string; ownPoolId: string | null }): string | null =>
    summary.ownPoolId ??
    jointPool.get(summary.id) ??
    (friendIdSet.has(summary.id) ? (threadOf.get(summary.id)?.poolId ?? null) : null);
  const cards: Card[] = summaries
    .filter((summary) => {
      const pool = writtenIn(summary);
      return !pool || !offHome.has(pool);
    })
    .map((summary) => {
      const thread = threads.get(summary.id) ?? [];
      const placed = placeCard(
        summary,
        thread.flatMap((r) => (r.note ? [r.note] : [])).join('\n\n'),
        profile.timezone,
        thread,
      );
      const pictured = photos.get(summary.id);
      // Mine to draw in full on a shared image (H63): my record, a joint one I
      // started, or a lone block of mine; someone's record I wrote on is not.
      const madeByMe = jointMaker.has(summary.id)
        ? jointMaker.get(summary.id) === profile.id
        : !friendIdSet.has(summary.id) &&
          (mineIds.has(summary.id) ||
            (summary.orphan && thread.length > 0 && thread.every((r) => r.byMe)));
      const card = {
        ...placed,
        madeByMe,
        ...(pictured ? { photos: pictured } : {}),
        ...jointFaces.get(summary.id),
        ...(filledMine.has(summary.id) ? { together: true } : {}),
        ...(sidesOf.has(summary.id) ? { sides: sidesOf.get(summary.id) } : {}),
      };
      const left = summary.orphan ? leftPool.get(summary.id) : undefined;
      if (left) return inLeftPool(card, left);
      const friend = friendIdSet.has(summary.id) ? threadOf.get(summary.id) : undefined;
      if (friend) {
        // Someone's record I wrote on in one pool (0035): that pool's, read as
        // it reads it, opening there while shared; never mine to pin or edit.
        const home = filings[friend.splashId] ?? null;
        const name = friend.poolName ?? 'A pool you left';
        return {
          ...card,
          side: true,
          column: home ?? ownPoolColumn(friend.poolId),
          pools: friend.poolName ? [friend.poolName] : [],
          poolPhoto: columnPhotos[friend.poolId] ?? null,
          href: friend.shared ? poolSplashHref(friend.poolId, friend.splashId) : undefined,
          menu: { pin: false, delete: false },
          editable: false,
          // Filed on my Home from its pencil, while I can read its pool (H45).
          fileable: friend.poolName !== null,
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
        const shownIn = ownAt.get(summary.id)?.poolId ?? summary.ownPoolId;
        return {
          ...card,
          column: home ?? ownPoolColumn(shownIn),
          lane: {
            icon: ownLaneIcon.get(summary.id) ?? null,
            name: poolName.get(shownIn) ?? 'A pool you left',
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
    .map((card) => {
      const shared = mineIds.has(card.splash.id) ? sharedTo.get(card.splash.id) : undefined;
      return shared
        ? {
            ...card,
            sharedPools: shared.map((id) => ({
              name: poolName.get(id)!,
              photo: columnPhotos[id] ?? null,
            })),
          }
        : card;
    })
    .sort(byNewest);
  // The layouts and which posts others read (H25), read in the third wave.
  const [[layouts, laneLayouts], sharedIds] = await Promise.all([layoutsRead, sharedRead]);
  const [answered, respondedAt] = await Promise.all([
    withResponded(supabase, cards, sharedIds, {
      me: profile.id,
      ids: mineIds,
      poolNames: poolName,
    }),
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
    const lanePooled = laneLayouts.pool[card.splash.id] ?? null;
    const lane = effectiveLayout(laneLayouts.home[card.splash.id], lanePooled);
    const laneLayout = {
      ...(lane.source ? { layout: lane.layout, layoutSource: lane.source } : {}),
      poolLayout: lanePooled,
    };
    return source
      ? { ...card, layout, layoutSource: source, poolLayout: pooled, laneLayout }
      : { ...card, poolLayout: pooled, laneLayout };
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
        initialView={homeViewParam(view)}
        poolColumns={poolColumns}
      />
      {/* A server render runs once per request: the stamp is when this copy was read. */}
      {/* eslint-disable-next-line react-hooks/purity */}
      <FreshOnArrival renderedAt={Date.now()} />
      {welcome && pools.length === 0 ? <NotifyCard /> : null}
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
    is_welcome: false,
    description: null,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: new Date(0).toISOString(),
    written_on: t.declaredStart ?? new Date(0).toISOString().slice(0, 10),
  };
}
