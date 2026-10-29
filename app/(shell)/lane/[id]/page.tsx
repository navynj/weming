import { notFound, redirect } from 'next/navigation';

import { rippleMedia } from '@/lib/ripple-media';
import {
  byNewest,
  cardLane,
  initialsOf,
  placeCard,
  type CardPhoto,
  type CardRipple,
} from '@/features/home/grid';
import { LanePage } from '@/features/lanes/lane-page';
import { declaredRange, orderBlocks } from '@/features/splash/block-day';
import { withPoolBadge } from '@/features/pool/home-badge';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { sharedSplashIds, withResponded } from '@/features/home/responded';
import {
  getJointSplashes,
  getJointTogether,
  getMyFilings,
  getMyPlacements,
  getMyPoolNames,
  getPlacementTogether,
} from '@/lib/queries/pools';
import { getResponsesOnMine } from '@/lib/queries/responses';
import { getMySplashes, summarizeSplashes } from '@/lib/queries/splashes';
import { getMyTrail } from '@/lib/queries/trail';
import { idFromUrl } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

/**
 * A lane's page (round 3): opened from its header on Home's grid. RLS
 * decides whether the lane exists for this viewer; its posts are the ones
 * whose mark sits in its column.
 */
export default async function LaneRoute({ params, searchParams }: PageProps<'/lane/[id]'>) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const id = idFromUrl((await params).id);
  const top = (await searchParams).top;
  const [ripples, categories, mine, filings, pools] = await Promise.all([
    getMyTrail(supabase, profile.id),
    getMyCategories(supabase),
    getMySplashes(supabase, profile.id),
    getMyFilings(supabase),
    getMyPoolNames(supabase, profile.id),
  ]);
  const lane = categories.find((c) => c.id === id);
  if (!lane) notFound();
  // Joint splashes I wrote on are posts here too, when I filed them in this
  // lane (H45) — as on Home, never by a ripple's own lane.
  const mineIds = new Set(mine.map((s) => s.id));
  const joints = await getJointSplashes(supabase, [
    ...new Set(
      ripples.flatMap((r) => (r.splash_id && !mineIds.has(r.splash_id) ? [r.splash_id] : [])),
    ),
  ]);
  const jointOf = new Map(joints.map((j) => [j.id, j]));
  const together = await getJointTogether(
    supabase,
    joints.map((j) => j.id),
  );
  // My pool records I filed in this lane (H45).
  const placements = mine.length > 0 ? await getMyPlacements(supabase, profile.id) : [];
  // Filled once any pool has someone with it (0035), as on Home.
  const withByPool = await getPlacementTogether(
    supabase,
    mine.map((s) => s.id),
  );
  const filled = new Set(
    mine
      .filter(
        (s) =>
          placements.some((p) => p.splashId === s.id && p.inviteAll) ||
          Object.values(withByPool[s.id] ?? {}).some((ids) => ids.length > 0),
      )
      .map((s) => s.id),
  );
  const poolName = new Map(pools.map((p) => [p.id, p.name]));

  // Each card's ripples with words or photos, in the detail sheet's order
  // (H42g), for the stack's thread; and its photos, shown under each
  // ripple's words on the top card.
  const threads = new Map<string, CardRipple[]>();
  const photos = new Map<string, CardPhoto[]>();
  const rangeOf = new Map([...mine, ...joints].map((s) => [s.id, declaredRange(s)]));
  const byKey = new Map<string, typeof ripples>();
  for (const ripple of ripples) {
    const key = ripple.splash_id ?? ripple.id;
    byKey.set(key, [...(byKey.get(key) ?? []), ripple]);
  }
  const inOrder = [...byKey].flatMap(([key, rows]) => orderBlocks(rows, rangeOf.get(key) ?? null));
  for (const ripple of inOrder) {
    if (!ripple.note && ripple.media.length === 0) continue;
    const key = ripple.splash_id ?? ripple.id;
    const entry = { id: ripple.id, note: ripple.note ?? '', createdAt: ripple.created_at };
    const list = threads.get(key);
    if (list) list.push(entry);
    else threads.set(key, [entry]);
    if (ripple.media.length > 0) {
      photos.set(key, [...(photos.get(key) ?? []), ...rippleMedia(ripple)]);
    }
  }
  const cards = summarizeSplashes([...mine, ...joints], ripples, profile.timezone, new Date())
    .filter((summary) => {
      const joint = jointOf.get(summary.id);
      // A pool switched off my Home (0039) stays off its lanes too.
      const off = new Set(pools.filter((p) => !p.onHome).map((p) => p.id));
      if (joint) return !off.has(joint.pool_id!) && filings[joint.id] === id;
      if (summary.ownPoolId) return !off.has(summary.ownPoolId) && filings[summary.id] === id;
      return cardLane(summary) === id;
    })
    .map((summary) => {
      const thread = threads.get(summary.id) ?? [];
      const pictured = photos.get(summary.id);
      const card = {
        ...placeCard(
          summary,
          thread.flatMap((r) => (r.note ? [r.note] : [])).join('\n\n'),
          profile.timezone,
          thread,
        ),
        ...(pictured ? { photos: pictured } : {}),
      };
      const joint = jointOf.get(summary.id);
      if (joint) {
        // Filled with Everyone on, or once anyone besides its maker is picked (0033).
        const filled =
          joint.joint_invite_all ||
          (together[joint.id] ?? []).some((uid) => uid !== joint.created_by);
        return withPoolBadge(
          { ...card, together: filled },
          {
            poolId: joint.pool_id!,
            poolName: poolName.get(joint.pool_id!) ?? null,
            linkedLane: id,
            poolLane: null,
          },
        );
      }
      // My own splash carries the pencil; a block read alone has none.
      return summary.orphan
        ? card
        : { ...card, editable: true, ...(filled.has(summary.id) ? { together: true } : {}) };
    })
    .sort(byNewest);
  // What readers left (H25), on the posts others can read, as on Home: the
  // top card's chips and first replies, and the unseen dots.
  const shared = await sharedSplashIds(supabase, profile.id, mine, joints);
  const [answered, respondedAt] = await Promise.all([
    withResponded(supabase, cards, shared),
    getResponsesOnMine(
      supabase,
      profile.id,
      ripples.flatMap((r) =>
        r.splash_id && shared.has(r.splash_id) ? [{ id: r.id, splashKey: r.splash_id }] : [],
      ),
    ),
  ]);
  const read = answered.map((card) => ({ ...card, respondedAt: respondedAt[card.splash.id] }));

  return (
    <main className="water-ground flex h-dvh min-h-0 flex-col">
      <LanePage
        lane={lane}
        cards={read}
        categories={categories}
        initials={initialsOf(profile.display_name)}
        topParam={typeof top === 'string' ? top : null}
      />
    </main>
  );
}
