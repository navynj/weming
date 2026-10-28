import { notFound, redirect } from 'next/navigation';

import { FreshOnArrival } from '@/features/home/fresh-on-arrival';
import { PoolGround } from '@/features/pool/pool-ground';
import { poolViewParam } from '@/features/pool/pool-views';
import { getMyProfile } from '@/lib/queries/profile';
import { getPoolView } from '@/lib/queries/pools';
import { createClient } from '@/lib/supabase/server';
import { todayIn } from '@/lib/time';
import { poolScopeOf } from '@/features/pool/compose-scope';
import { PoolEditScope } from '@/features/pool/edit-scope';
import { signPoolPhotos } from '@/lib/avatars';
import { PhotoRetryToast } from '@/features/pool/photo-retry';
import { NotifyCard } from '@/features/notifications/notify-card';

/**
 * A pool's home (H23). RLS decides whether it exists for this viewer at all:
 * a pool I am not in now — never joined, or left — is not found.
 * `?top=<id>` opens with that post on top, where its page sends it back to.
 */
export async function PoolScreen({
  id,
  top,
  view: opensOn,
  welcome = false,
}: {
  id: string;
  top?: string;
  /** `?view=`: the view to open on, from a pool lane page's tabs (review); else the Calendar. */
  view?: string;
  /** `?welcome`: just joined or opened, so the notifications card (review). */
  welcome?: boolean;
}) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');

  const found = await getPoolView(supabase, id, profile.id);
  // The pool's photo for its header (0024).
  const view = found
    ? {
        ...found,
        pool: {
          ...found.pool,
          photo:
            (
              await signPoolPhotos(supabase, [
                { id: found.pool.id, version: found.pool.photoVersion ?? null },
              ])
            )[found.pool.id] ?? null,
        },
      }
    : null;
  if (!view) notFound();

  return (
    <main className="water-ground flex h-dvh min-h-0 flex-col">
      {/* Editing from here edits with this pool's lanes (0022). */}
      <PoolEditScope scope={poolScopeOf(view)}>
        <PoolGround
          // Another pool is another visit: it opens on the Calendar again.
          key={view.pool.id}
          view={view}
          me={profile.id}
          today={todayIn(profile.timezone)}
          timeZone={profile.timezone}
          topParam={top ?? null}
          initialView={poolViewParam(opensOn)}
        />
      </PoolEditScope>
      {/* A new pool's photo that did not upload, offered again (review). */}
      <PhotoRetryToast poolId={view.pool.id} />
      {welcome ? <NotifyCard /> : null}
      {/* A server render runs once per request: the stamp is when this copy was read. */}
      {/* eslint-disable-next-line react-hooks/purity */}
      <FreshOnArrival renderedAt={Date.now()} />
    </main>
  );
}
