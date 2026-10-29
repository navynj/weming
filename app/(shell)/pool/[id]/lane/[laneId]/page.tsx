import { notFound, redirect } from 'next/navigation';

import { LanePage } from '@/features/lanes/lane-page';
import { poolScopeOf } from '@/features/pool/compose-scope';
import { poolCards } from '@/features/pool/pool-cards';
import { getMyProfile } from '@/lib/queries/profile';
import { getPoolView } from '@/lib/queries/pools';
import { idFromUrl } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { PoolEditScope } from '@/features/pool/edit-scope';

/**
 * A pool lane's page (review): opened from its header on the pool's grid,
 * as a lane's is on Home. Its posts are the ones whose mark sits in its
 * column in the Lane view — placed posts and joint splashes alike, each with
 * its author. RLS decides whether the pool exists for this viewer.
 */
export default async function PoolLaneRoute({
  params,
  searchParams,
}: PageProps<'/pool/[id]/lane/[laneId]'>) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const { id: poolParam, laneId: laneParam } = await params;
  const id = idFromUrl(poolParam);
  const laneId = idFromUrl(laneParam);
  const top = (await searchParams).top;
  const view = await getPoolView(supabase, id, profile.id);
  const lane = view?.lanes.find((l) => l.id === laneId);
  if (!view || !lane) notFound();

  const cards = poolCards(view, 'lane', profile.id, profile.timezone).filter(
    (card) => card.column === laneId,
  );

  return (
    <main className="water-ground flex h-dvh min-h-0 flex-col">
      <PoolEditScope scope={poolScopeOf(view)}>
        <LanePage
          lane={{ id: lane.id, name: lane.name, icon: lane.icon, description: lane.description }}
          cards={cards}
          categories={view.lanes.map((l) => ({ id: l.id, name: l.name, icon: l.icon }))}
          topParam={typeof top === 'string' ? top : null}
          pool={poolScopeOf(view)}
        />
      </PoolEditScope>
    </main>
  );
}
