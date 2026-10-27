import { redirect } from 'next/navigation';

import { initialsOf } from '@/features/home/grid';
import { SplashGone } from '@/features/splash/splash-gone';
import { SplashPage } from '@/features/splash/splash-page';
import { summarizeOrphan, summarizeSplash } from '@/features/splash/summary';
import { signOwnMedia } from '@/lib/media';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { audienceFor } from '@/features/pool/audience-for';
import { getMyLinks, getMyOriginTags, getMyPlacements, getMyPoolNames } from '@/lib/queries/pools';
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

  // In the order they were written (H24): a block's own date places nothing.
  const blocks = (board ? ripples.filter((r) => r.splash_id === id) : [lone!]).sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const summary = board
    ? summarizeSplash(board, blocks, profile.timezone, now)
    : summarizeOrphan(lone!, profile.timezone, now);

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
