import Link from 'next/link';
import { redirect } from 'next/navigation';

import { JoinFlow } from '@/features/pool/join-flow';
import { getMyProfile } from '@/lib/queries/profile';
import { signInvitePhoto } from '@/lib/avatars';
import { createClient } from '@/lib/supabase/server';

/**
 * `/join/[token]` (H23). Signed out, the proxy sends the visitor to sign in
 * and back here. A current member goes straight to the pool. An expired or
 * revoked link opens nothing and says so. Joining asks my name and nothing
 * else (hotfix 2026-10-26): connecting lanes lives in the pool's settings.
 */
export default async function JoinPage({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params;
  const supabase = await createClient();
  const profile = await getMyProfile(supabase);
  if (!profile) redirect(`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`);

  // Invites are readable only by current members (RLS): a row here means
  // I am already in, whether or not the link is still live.
  const { data: mine } = await supabase
    .from('pool_invites')
    .select('pool_id')
    .eq('token', token)
    .maybeSingle();
  if (mine) redirect(`/pool/${mine.pool_id}`);

  // The preview, and the pool's photo signed for ten minutes when the token
  // is valid, unexpired and unrevoked (0024, invite_photo; server only).
  const [{ data: preview }, photo] = await Promise.all([
    supabase.rpc('invite_preview', { p_token: token }),
    signInvitePhoto(token),
  ]);
  const pool = preview?.[0];
  if (!pool) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 bg-white px-6 text-center">
        <p data-invite-invalid className="text-ink text-lg font-medium">
          This invite link no longer works. Ask for a new one.
        </p>
        <Link href="/" className="text-main-900 text-sm font-semibold">
          Go to Home
        </Link>
      </main>
    );
  }

  return (
    <JoinFlow
      token={token}
      poolName={pool.pool_name}
      photo={photo}
      initials={pool.member_initials}
      myName={profile.display_name}
    />
  );
}
