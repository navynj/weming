import { redirect } from 'next/navigation';

import { initialsOf } from '@/features/home/grid';
import { audienceFor } from '@/features/pool/audience-for';
import { originTag } from '@/features/pool/origin-tag';
import { SplashGone } from '@/features/splash/splash-gone';
import { SplashPage } from '@/features/splash/splash-page';
import { orderBlocks } from '@/features/splash/block-day';
import { summarizeSplash } from '@/features/splash/summary';
import { signRippleMedia } from '@/lib/media';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import {
  getMyLinks,
  getMyPlacements,
  getMyPoolNames,
  getPlacementPicks,
  getPoolView,
} from '@/lib/queries/pools';
import { WITH_SPLASH, type RippleWithSplash } from '@/lib/queries/ripples';
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
      .select(WITH_SPLASH)
      .eq('splash_id', sid)
      .is('parent_ripple_id', null)
      .returns<RippleWithSplash[]>(),
  ]);
  const board = view?.splashes.find((s) => s.id === sid);
  // Gone, or a pool I am not in: said in the sheet, never a 404 (review).
  if (!view || !board) return <SplashGone />;
  if (ripples.error) throw ripples.error;

  const joint = board.owner_id === null;
  const author = board.owner_id ?? board.created_by;
  const zone = view.members.find((m) => m.userId === author)?.timeZone ?? profile.timezone;
  // By day inside a range, else as written (0031): a frozen date places nothing.
  const blocks = orderBlocks(
    ripples.data,
    board.declared_start
      ? { start: board.declared_start, end: board.declared_end ?? board.declared_start }
      : null,
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
    // This pool's thread only (0053), with the owner's from no pool.
    getRippleResponses(
      supabase,
      blocks.map((r) => r.id),
      id,
    ),
  ]);
  const photos = Object.fromEntries(blocks.map((r, at) => [r.id, photoLists[at]]));

  const placement = view.placements.find((p) => p.splashId === sid);
  const laneId = board.pool_lane_id ?? placement?.poolLaneId ?? null;
  const lane = view.lanes.find((l) => l.id === laneId) ?? null;
  const initials = Object.fromEntries(view.members.map((m) => [m.userId, m.initials]));
  // Someone's record I am invited on in this pool (0035): my side goes here.
  const invited =
    !joint &&
    board.owner_id !== profile.id &&
    (view.placementTogether?.[sid] ?? []).includes(profile.id);

  return (
    <PoolEditScope scope={poolScopeOf(view)}>
      <SplashPage
        writing={writing}
        sidePool={invited ? id : null}
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
        audience={audienceFor({
          board,
          summary,
          me: profile.id,
          links,
          pools,
          placements,
          picks: board.owner_id === profile.id ? await getPlacementPicks(supabase, sid) : {},
        })}
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
