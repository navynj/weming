import { notFound, redirect } from 'next/navigation';

import { PoolSettings } from '@/features/pool/settings';
import { getMyCategories, getMyProfile } from '@/lib/queries/profile';
import { getPoolView } from '@/lib/queries/pools';
import { getPoolNotificationPrefs } from '@/lib/queries/notifications';
import { signPoolPhotos } from '@/lib/avatars';
import { createClient } from '@/lib/supabase/server';

/** Pool settings (H23): the invite link, notifications (H32) and my lane links. Members only. */
export default async function PoolSettingsPage({ params }: PageProps<'/pool/[id]/settings'>) {
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect('/sign-in');
  const { id } = await params;
  const [view, categories, notifications] = await Promise.all([
    getPoolView(supabase, id, profile.id),
    getMyCategories(supabase),
    getPoolNotificationPrefs(supabase, id, profile.id),
  ]);
  if (!view) notFound();
  // The pool's photo, for the creator's photo field (0024).
  const photo =
    (
      await signPoolPhotos(supabase, [
        { id: view.pool.id, version: view.pool.photoVersion ?? null },
      ])
    )[view.pool.id] ?? null;
  return (
    <PoolSettings
      view={{ ...view, pool: { ...view.pool, photo } }}
      categories={categories}
      me={profile.id}
      notifications={notifications}
    />
  );
}
