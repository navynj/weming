import { notFound, redirect } from 'next/navigation';

import {
  byNewest,
  cardLane,
  initialsOf,
  placeCard,
  type CardPhoto,
  type CardRipple,
} from '@/features/home/grid';
import { LanePage } from '@/features/lanes/lane-page';
import { jointLaneFor } from '@/features/pool/direction';
import { withPoolBadge } from '@/features/pool/home-badge';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { getJointSplashes, getMyLinks, getMyPoolNames } from '@/lib/queries/pools';
import { getMySplashes, summarizeSplashes } from '@/lib/queries/splashes';
import { getMyTrail } from '@/lib/queries/trail';
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

  const { id } = await params;
  const top = (await searchParams).top;
  const [ripples, categories, mine, links, pools] = await Promise.all([
    getMyTrail(supabase, profile.id),
    getMyCategories(supabase),
    getMySplashes(supabase, profile.id),
    getMyLinks(supabase, profile.id),
    getMyPoolNames(supabase, profile.id),
  ]);
  const lane = categories.find((c) => c.id === id);
  if (!lane) notFound();
  // Joint splashes I wrote on are posts here too, in the lane their pool lane
  // is brought into (H24) — as on Home, never by a ripple's own lane.
  const mineIds = new Set(mine.map((s) => s.id));
  const joints = await getJointSplashes(supabase, [
    ...new Set(
      ripples.flatMap((r) => (r.splash_id && !mineIds.has(r.splash_id) ? [r.splash_id] : [])),
    ),
  ]);
  const jointOf = new Map(joints.map((j) => [j.id, j]));
  const poolName = new Map(pools.map((p) => [p.id, p.name]));

  // Each card's ripples with words or photos, oldest first, for the stack's
  // thread; and its photos, shown under each ripple's words on the top card.
  const threads = new Map<string, CardRipple[]>();
  const photos = new Map<string, CardPhoto[]>();
  for (const ripple of [...ripples].reverse()) {
    if (!ripple.note && ripple.media.length === 0) continue;
    const key = ripple.splash_id ?? ripple.id;
    const entry = { id: ripple.id, note: ripple.note ?? '', createdAt: ripple.created_at };
    const list = threads.get(key);
    if (list) list.push(entry);
    else threads.set(key, [entry]);
    if (ripple.media.length > 0) {
      photos.set(key, [
        ...(photos.get(key) ?? []),
        ...ripple.media.map((path) => ({ rippleId: ripple.id, path })),
      ]);
    }
  }
  const cards = summarizeSplashes([...mine, ...joints], ripples, profile.timezone, new Date())
    .filter((summary) => {
      const joint = jointOf.get(summary.id);
      return joint ? jointLaneFor(joint.pool_lane_id, links) === id : cardLane(summary) === id;
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
        return withPoolBadge(card, {
          poolId: joint.pool_id!,
          poolName: poolName.get(joint.pool_id!) ?? null,
          linkedLane: id,
          poolLane: null,
        });
      }
      // My own splash carries the pencil; a block read alone has none.
      return summary.orphan ? card : { ...card, editable: true };
    })
    .sort(byNewest);

  return (
    <main className="water-ground flex h-dvh min-h-0 flex-col">
      <LanePage
        lane={lane}
        cards={cards}
        categories={categories}
        initials={initialsOf(profile.display_name)}
        topParam={typeof top === 'string' ? top : null}
      />
    </main>
  );
}
