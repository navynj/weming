import { redirect } from 'next/navigation';

import { initialsOf } from '@/features/home/grid';
import { audienceFor } from '@/features/pool/audience-for';
import { originTag } from '@/features/pool/origin-tag';
import { SplashGone } from '@/features/splash/splash-gone';
import { SplashPage } from '@/features/splash/splash-page';
import { summarizeSplash } from '@/features/splash/summary';
import { signRippleMedia } from '@/lib/media';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { getMyLinks, getMyPlacements, getMyPoolNames, getPoolView } from '@/lib/queries/pools';
import { WITH_CATEGORY, type RippleWithCategory } from '@/lib/queries/ripples';
import { getRippleResponses } from '@/lib/queries/responses';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/time';
import { poolScopeOf } from '@/features/pool/compose-scope';
import { PoolEditScope } from '@/features/pool/edit-scope';

/**
 * A splash in a pool (H23, review): the same page as Home's — the same
 * detail, the same in-place writing, the same split on a wide screen — read
 * with the pool as context: its origin tag, every ripple's author, the way
 * back to the pool. My own splash is mine to edit; a joint splash's title
 * and icon are any member's, its ripples their authors'; someone else's
 * splash is read only. RLS decides whether it exists for me at all.
 */
export async function PoolSplash({
  id,
  sid,
  writing = false,
}: {
  id: string;
  sid: string;
  /** Open with the next block's editor up: adding my side to a joint splash. */
  writing?: boolean;
}) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const [view, categories, links, pools, placements, ripples] = await Promise.all([
    getPoolView(supabase, id, profile.id),
    getMyCategories(supabase),
    getMyLinks(supabase, profile.id),
    getMyPoolNames(supabase, profile.id),
    getMyPlacements(supabase, profile.id),
    // Every ripple on it I may read, with my own lanes where they are mine.
    supabase
      .from('ripples')
      .select(WITH_CATEGORY)
      .eq('splash_id', sid)
      .is('parent_ripple_id', null)
      .returns<RippleWithCategory[]>(),
  ]);
  const board = view?.splashes.find((s) => s.id === sid);
  // Gone, or a pool I am not in: said in the sheet, never a 404 (review).
  if (!view || !board) return <SplashGone />;
  if (ripples.error) throw ripples.error;

  const joint = board.owner_id === null;
  const author = board.owner_id ?? board.created_by;
  const zone = view.members.find((m) => m.userId === author)?.timeZone ?? profile.timezone;
  // In the order they were written (H24): a ripple's own date places nothing.
  const blocks = [...ripples.data].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const summary = summarizeSplash(board, blocks, zone, new Date());

  const [photoLists, { data: lockRows }, responses] = await Promise.all([
    Promise.all(blocks.map((r) => (r.media.length > 0 ? signRippleMedia(r.id) : []))),
    supabase
      .from('ripple_audience')
      .select('ripple_id')
      .eq('target_type', 'lock')
      .in(
        'ripple_id',
        blocks.length ? blocks.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000'],
      ),
    getRippleResponses(
      supabase,
      blocks.map((r) => r.id),
    ),
  ]);
  const photos = Object.fromEntries(blocks.map((r, at) => [r.id, photoLists[at]]));

  const placement = view.placements.find((p) => p.splashId === sid);
  const laneId = board.pool_lane_id ?? placement?.poolLaneId ?? null;
  const lane = view.lanes.find((l) => l.id === laneId) ?? null;
  const initials = Object.fromEntries(view.members.map((m) => [m.userId, m.initials]));

  return (
    <PoolEditScope scope={poolScopeOf(view)}>
      <SplashPage
        writing={writing}
        // Every member reads it here, so its blocks take reactions and replies (H25).
        responses={responses}
        respondable
        splash={summary}
        blocks={blocks}
        photos={photos}
        lockedIds={(lockRows ?? []).map((row) => row.ripple_id)}
        categories={categories}
        timeZone={profile.timezone}
        today={todayIn(profile.timezone)}
        initials={initialsOf(profile.display_name)}
        poolTags={lane ? [originTag(view.pool.name, lane.icon, lane.name)] : []}
        audience={audienceFor({ board, summary, me: profile.id, links, pools, placements })}
        pool={{
          poolId: id,
          me: profile.id,
          scope: joint ? 'joint' : board.owner_id === profile.id ? 'mine' : 'theirs',
          initialsOf: initials,
          laneChip: lane ? { icon: lane.icon, name: lane.name } : null,
          canDeleteJoint: joint && blocks.every((r) => r.author_id === profile.id),
          zoneOf: Object.fromEntries(view.members.map((m) => [m.userId, m.timeZone])),
        }}
      />
    </PoolEditScope>
  );
}
