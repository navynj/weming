import Link from 'next/link';
import { redirect } from 'next/navigation';

import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import { JoinFlow } from '@/features/pool/join-flow';
import { getMyProfile } from '@/lib/queries/profile';
import { signAvatars, signInviteMembers, signInvitePhoto } from '@/lib/avatars';
import { createClient } from '@/lib/supabase/server';

/**
 * `/join/[token]` (H23). Signed out, the proxy sends the visitor to sign in
 * and back here. A current member goes straight to the pool. An expired or
 * revoked link opens nothing and says so. Joining asks nothing (hotfix
 * 2026-10-26; H60): it shows the name and face I join as, which are my
 * profile's in every pool, and asks a name only of a profile with none.
 * Connecting lanes lives in the pool's settings.
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
  const [{ data: preview }, photo, members, myFace] = await Promise.all([
    supabase.rpc('invite_preview', { p_token: token }),
    signInvitePhoto(token),
    signInviteMembers(token),
    // My own face, as the members will see it.
    signAvatars(supabase, [{ id: profile.id, version: profile.avatar_version }]),
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

  // The profile sheet opens over this screen ("Change in Settings"), so it
  // gets the two providers it reads, with my face alone.
  const me = { name: profile.display_name, photo: myFace[profile.id] ?? null };
  return (
    <PeopleProvider me={profile.id} people={{ [profile.id]: me }}>
      <InputSheetProvider>
        <JoinFlow
          token={token}
          poolName={pool.pool_name}
          photo={photo}
          members={members}
          myName={profile.display_name}
        />
      </InputSheetProvider>
    </PeopleProvider>
  );
}
