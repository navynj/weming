import { redirect } from 'next/navigation';

import { initialsOf } from '@/features/home/grid';
import { SplashGone } from '@/features/splash/splash-gone';
import { SplashPage } from '@/features/splash/splash-page';
import { orderBlocks } from '@/features/splash/block-day';
import { summarizeOrphan, summarizeSplash } from '@/features/splash/summary';
import { signOwnMedia } from '@/lib/media';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { audienceFor } from '@/features/pool/audience-for';
import { getMyLinks, getMyOriginTags, getMyPlacements, getMyPoolNames } from '@/lib/queries/pools';
import { getRippleResponses } from '@/lib/queries/responses';
import { getMySplashes } from '@/lib/queries/splashes';
import { getMyTrail } from '@/lib/queries/trail';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/time';

/**
 * A post's detail, read for the splash sheet (SPEC 5, H21c; review): RLS
 * decides whether the post exists for this viewer at all. A splashless block
 * opens here too, as an untitled post of one.
 */
export async function HomeSplash({ id }: { id: string }) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const now = new Date();
  const today = todayIn(profile.timezone);

  const [ripples, categories, boards, links, pools, placements, tags] = await Promise.all([
    getMyTrail(supabase, profile.id),
    getMyCategories(supabase),
    getMySplashes(supabase, profile.id),
    getMyLinks(supabase, profile.id),
    getMyPoolNames(supabase, profile.id),
    getMyPlacements(supabase, profile.id),
    getMyOriginTags(supabase, profile.id),
  ]);

  const board = boards.find((b) => b.id === id) ?? null;
  // A block whose post I cannot read (a joint splash of a pool I left) reads
  // alone, by its own id, as Home shows it (summarizeAll).
  const lone = board
    ? null
    : (ripples.find((r) => r.id === id && !boards.some((b) => b.id === r.splash_id)) ?? null);
  // Gone (a delete from this very sheet re-reads here as it closes): said,
  // never a 404 (review).
  if (!board && !lone) return <SplashGone />;

  // By day inside a range, else as written (0031): a frozen date places nothing.
  const blocks = orderBlocks(
    board ? ripples.filter((r) => r.splash_id === id) : [lone!],
    board?.declared_start
      ? { start: board.declared_start, end: board.declared_end ?? board.declared_start }
      : null,
  );
  const summary = board
    ? summarizeSplash(board, blocks, profile.timezone, now)
    : summarizeOrphan(lone!, profile.timezone, now);

  // Someone besides me sees it: shared to a pool, or a pool's own (H25).
  const respondable =
    !!board &&
    (board.own_pool_id !== null || placements.some((p) => p.splashId === board.id && p.shared));
  const responses = await getRippleResponses(
    supabase,
    blocks.map((r) => r.id),
  );

  const { data: lockRows } = await supabase
    .from('ripple_audience')
    .select('ripple_id')
    .eq('target_type', 'lock')
    .in(
      'ripple_id',
      blocks.length ? blocks.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000'],
    );

  // A photo that could not be signed is a placeholder, never a failed page.
  const signed = await signOwnMedia(blocks.flatMap((r) => r.media));
  const photos = Object.fromEntries(
    blocks
      .filter((r) => r.media.length > 0)
      .map((r) => [r.id, r.media.map((path) => signed[path] ?? null)]),
  );

  return (
    <SplashPage
      splash={summary}
      blocks={blocks}
      photos={photos}
      lockedIds={(lockRows ?? []).map((row) => row.ripple_id)}
      categories={categories}
      timeZone={profile.timezone}
      today={today}
      initials={initialsOf(profile.display_name)}
      responses={responses}
      respondable={respondable}
      poolTags={board ? (tags.get(board.id) ?? []) : []}
      audience={audienceFor({
        board,
        summary,
        me: profile.id,
        links,
        pools,
        placements,
      })}
    />
  );
}
