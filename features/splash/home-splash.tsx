import { redirect } from 'next/navigation';

import { initialsOf } from '@/features/home/grid';
import { FreshOnArrival } from '@/features/home/fresh-on-arrival';
import { SplashGone } from '@/features/splash/splash-gone';
import { SplashPage } from '@/features/splash/splash-page';
import { declaredRange, orderBlocks } from '@/features/splash/block-day';
import { summarizeOrphan, summarizeSplash } from '@/features/splash/summary';
import { signOwnMedia, signRippleMedia } from '@/lib/media';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { audienceFor } from '@/features/pool/audience-for';
import {
  getHandedRipples,
  getMyHandedThreads,
  getMyOriginTags,
  getMyFilings,
  getMyPlacements,
  getPlacementPicks,
  getMyPoolNames,
} from '@/lib/queries/pools';
import { getRippleResponses } from '@/lib/queries/responses';
import { getMySplashes } from '@/lib/queries/splashes';
import { WITH_SPLASH, type RippleWithSplash } from '@/lib/queries/ripples';
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

  const [ripples, categories, boards, pools, placements, filings, tags] = await Promise.all([
    getMyTrail(supabase, profile.id),
    getMyCategories(supabase),
    getMySplashes(supabase, profile.id),
    getMyPoolNames(supabase, profile.id),
    getMyPlacements(supabase, profile.id),
    getMyFilings(supabase),
    getMyOriginTags(supabase, profile.id),
  ]);

  const board = boards.find((b) => b.id === id) ?? null;
  const picks = board ? await getPlacementPicks(supabase, board.id) : {};
  // A block whose post I cannot read (a joint splash of a pool I left) reads
  // alone, by its own id, as Home shows it (summarizeAll).
  const lone = board
    ? null
    : (ripples.find((r) => r.id === id && !boards.some((b) => b.id === r.splash_id)) ?? null);
  // Gone (a delete from this very sheet re-reads here as it closes): said,
  // never a 404 (review).
  if (!board && !lone) return <SplashGone />;

  // Members' sides on my record, as RLS lets me read them (0035): Home shows
  // a record with exactly the ripples I can read.
  const { data: theirs } = board
    ? await supabase
        .from('ripples')
        .select(WITH_SPLASH)
        .eq('splash_id', id)
        .neq('author_id', profile.id)
        .is('parent_ripple_id', null)
        .returns<RippleWithSplash[]>()
    : { data: [] as RippleWithSplash[] };
  // A thread handed to a pool I left with remove (0061): still on my
  // record, under that pool, as it stood when I left.
  const handedThreads = board ? await getMyHandedThreads(supabase, [board.id]) : [];
  const handed = await getHandedRipples(supabase, handedThreads);
  const others = [...(theirs ?? []), ...handed];
  const { data: names } = others.length
    ? await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', [...new Set(others.flatMap((r) => (r.author_id ? [r.author_id] : [])))])
    : { data: [] as { id: string; display_name: string }[] };

  // The one order (H42g): by day inside a range, else as written; a frozen date places nothing.
  const blocks = orderBlocks(
    board ? [...ripples.filter((r) => r.splash_id === id), ...others] : [lone!],
    board ? declaredRange(board) : null,
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
  // Mine by path; someone else's through the ripple, where the check lives.
  const signed = await signOwnMedia(blocks.flatMap((r) => r.media));
  const theirPhotos = await Promise.all(
    others.filter((r) => r.media.length > 0).map(async (r) => [r.id, await signRippleMedia(r.id)]),
  );
  const photos = {
    ...Object.fromEntries(
      blocks
        .filter((r) => r.media.length > 0 && r.author_id === profile.id)
        .map((r) => [r.id, r.media.map((path) => signed[path] ?? null)]),
    ),
    ...Object.fromEntries(theirPhotos),
  };

  // A tab per pool once anyone has written a side (0035): the pools it is
  // shared to, and one switched off that still holds a side, muted.
  const placed = [
    ...(board ? placements.filter((p) => p.splashId === board.id) : []),
    // A pool I left with remove, its thread handed over (0061).
    ...handedThreads
      .filter((h) => !placements.some((p) => p.splashId === h.splashId && p.poolId === h.poolId))
      .map((h) => ({ splashId: h.splashId, poolId: h.poolId, poolLaneId: '', shared: false })),
  ];
  // Or once anyone has responded in a pool (0053): another pool's replies
  // and reactions read only in that pool's tab.
  const responded = (pid: string): boolean =>
    responses.replies.some((r) => r.thread_pool_id === pid) ||
    responses.reactions.some((r) => r.thread_pool_id === pid);
  const threads =
    others.length === 0 && !placed.some((p) => responded(p.poolId))
      ? []
      : placed
          .filter(
            (p) =>
              p.shared || others.some((r) => r.thread_pool_id === p.poolId) || responded(p.poolId),
          )
          .map((p) => ({
            poolId: p.poolId,
            label: pools.find((x) => x.id === p.poolId)?.name ?? 'A pool you left',
            count: others.filter((r) => r.thread_pool_id === p.poolId).length,
            off: !p.shared,
          }));

  return (
    <>
      {/* A server render runs once per request: the stamp is when this copy was read. */}
      {/* eslint-disable-next-line react-hooks/purity */}
      <FreshOnArrival renderedAt={Date.now()} />
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
        threads={threads}
        initialsOf={Object.fromEntries(
          (names ?? []).map((n) => [n.id, initialsOf(n.display_name)]),
        )}
        poolTags={board ? (tags.get(board.id) ?? []) : []}
        audience={audienceFor({
          board,
          summary,
          me: profile.id,
          categories,
          filed: filings[id] ?? null,
          pools,
          placements,
          picks,
        })}
      />
    </>
  );
}
