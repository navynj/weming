'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Monogram } from '@/components/ui/monogram';
import { initialsOf } from '@/features/home/grid';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { displayName, NAME_MAX } from '@/features/people/name';
import { usePeople } from '@/features/people/people-provider';
import { ProfileSheet } from '@/features/people/profile-sheet';
import { welcomePool } from '@/features/notifications/welcome';

import type { InviteMember } from '@/lib/avatars';

import { joinPool } from './actions';
import { PrimaryButton, StepPage } from './step-page';

/**
 * Joining from an invite link (H23; hotfix 2026-10-26): one screen — the
 * pool's name and its members, each a face and a name (0067 `invite_members`),
 * the name and face I join as, and Join. A name is global (H60): it is
 * shown, not edited here, with "Change in Settings" opening my profile; only
 * a profile with no name is asked for one. Nothing about how my records connect: every
 * pool lane starts unconnected, writing from the pool works as for any
 * unconnected one, and connecting stays in the pool's settings. The token is
 * checked again when joining.
 */
export function JoinFlow({
  token,
  poolName,
  photo = null,
  members,
  myName,
}: {
  token: string;
  poolName: string;
  /** The pool's photo, signed briefly for this invite (0024); the letters without one. */
  photo?: string | null;
  /** Who is in it now, in the order they joined: a name, and a photo signed briefly. */
  members: InviteMember[];
  /** My profile's name as the server has it; blank only when sign-in gave none. */
  myName: string;
}) {
  const router = useRouter();
  const { me, people } = usePeople();
  const { dropMessage } = useInputSheet();
  const face = me ? people[me] : undefined;
  // Asked only when the profile has no usable name (H60).
  const nameMissing = myName.trim().length === 0;
  const [name, setName] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = !nameMissing || displayName.safeParse(name).success;

  async function join(): Promise<void> {
    setBusy(true);
    setMessage(null);
    // No links (hotfix, 0033): every pool lane starts unconnected for me.
    // The name goes only with a profile that has none; the server writes it then alone.
    const joined = await joinPool(nameMissing ? { token, name: name.trim() } : { token });
    if (!joined.ok) {
      setMessage(joined.message);
      setBusy(false);
      return;
    }
    // The pool's first screen greets me with its notifications (review).
    router.replace(welcomePool(joined.id));
  }

  return (
    // "Join Pool" names the place before anything else: the word a Pool is learnt by (review).
    <StepPage step={null} title="Join Pool" onBack={() => router.replace('/')}>
      <p className="text-pool-500 text-sm">You are invited to</p>
      <div className="mt-4 flex items-center gap-4">
        <Monogram name={poolName} size="tile" photo={photo} />
        <h2
          data-invite-pool
          className="text-main-900 min-w-0 text-3xl/tight font-semibold break-words"
        >
          {poolName}
        </h2>
      </div>
      <ul aria-label="Members" className="mt-8 flex flex-wrap gap-x-3 gap-y-4">
        {members.map((member, index) => (
          <li
            key={`${member.name}-${index}`}
            data-invite-member
            className="flex w-14 flex-col items-center gap-1.5"
          >
            <Face name={member.name} photo={member.photo} />
            <span data-invite-member-name className="text-ink w-full truncate text-center text-xs">
              {member.name}
            </span>
          </li>
        ))}
      </ul>
      {nameMissing ? (
        <label className="mt-10 flex flex-col gap-2">
          <span className="text-pool-500 text-sm">Your name (shown in all your pools)</span>
          <input
            data-join-name
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={NAME_MAX}
            required
            autoComplete="name"
            className="bg-pool-100 text-ink h-12 rounded-xl px-4 text-base outline-none"
          />
        </label>
      ) : (
        <div data-join-as className="mt-10 flex flex-col gap-2">
          <span className="text-pool-500 text-sm">You join as</span>
          <div className="flex items-center gap-3">
            <Face name={face?.name ?? myName} photo={face?.photo ?? null} />
            <span data-join-as-name className="text-ink min-w-0 flex-1 truncate text-base">
              {face?.name ?? myName}
            </span>
            <button
              type="button"
              data-join-change-name
              onClick={() => setProfileOpen(true)}
              className="text-main-900 shrink-0 text-xs font-medium"
            >
              Change in Settings
            </button>
          </div>
        </div>
      )}
      <p className="text-pool-500 mt-6 text-sm/relaxed">
        Your name and photo are shared with {poolName}. Everything else stays yours.
      </p>
      {message || dropMessage ? (
        <p role="alert" className="text-pool-500 mt-4 text-sm">
          {message ?? dropMessage}
        </p>
      ) : null}
      <div className="mt-auto pt-10">
        <PrimaryButton disabled={busy || !ready} onClick={() => void join()}>
          {busy ? 'Joining…' : 'Join'}
        </PrimaryButton>
      </div>
      {profileOpen ? <ProfileSheet onClose={() => setProfileOpen(false)} /> : null}
    </StepPage>
  );
}

/** A face: the photo, signed briefly, or the initials in its place. */
function Face({ name, photo }: { name: string; photo: string | null }) {
  return photo ? (
    // Signed for ten minutes (0067): this screen's life, no longer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      data-invite-member-photo
      draggable={false}
      className="h-12 w-12 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="bg-pool-100 text-pool-500 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xs font-medium"
    >
      {initialsOf(name)}
    </span>
  );
}
