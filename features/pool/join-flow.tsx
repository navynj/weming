'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Monogram } from '@/components/ui/monogram';
import { initialsOf } from '@/features/home/grid';
import { saveProfile } from '@/features/people/actions';
import { NAME_MAX } from '@/features/people/name';
import { welcomePool } from '@/features/notifications/welcome';

import type { InviteMember } from '@/lib/avatars';

import { joinPool } from './actions';
import { PrimaryButton, StepPage } from './step-page';

/**
 * Joining from an invite link (H23; hotfix 2026-10-26): one screen — the
 * pool's name and its members, each a face and a name (0067 `invite_members`), my name as
 * they will see it, and Join. Nothing about how my records connect: every
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
  /** My name as it stands (from signing in); the members see it. */
  myName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(myName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = name.trim().length > 0;

  async function join(): Promise<void> {
    setBusy(true);
    setMessage(null);
    if (name.trim() !== myName.trim()) {
      const saved = await saveProfile({ name: name.trim(), photo: 'keep' });
      if (!saved.ok) {
        setMessage(saved.message);
        setBusy(false);
        return;
      }
    }
    // No links (hotfix, 0033): every pool lane starts unconnected for me.
    const joined = await joinPool({ token });
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
            {member.photo ? (
              // Signed for ten minutes (0067): this screen's life, no longer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.photo}
                alt=""
                data-invite-member-photo
                draggable={false}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="bg-pool-100 text-pool-500 flex h-12 w-12 items-center justify-center rounded-full text-xs font-medium"
              >
                {initialsOf(member.name)}
              </span>
            )}
            <span data-invite-member-name className="text-ink w-full truncate text-center text-xs">
              {member.name}
            </span>
          </li>
        ))}
      </ul>
      <label className="mt-10 flex flex-col gap-2">
        <span className="text-pool-500 text-sm">Your name, as the members see it</span>
        <input
          data-join-name
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          autoComplete="name"
          className="bg-pool-100 text-ink h-12 rounded-xl px-4 text-base outline-none"
        />
      </label>
      <p className="text-pool-500 mt-6 text-sm/relaxed">
        What you write here is shared with {poolName}. Everything else stays yours.
      </p>
      {message ? (
        <p role="alert" className="text-pool-500 mt-4 text-sm">
          {message}
        </p>
      ) : null}
      <div className="mt-auto pt-10">
        <PrimaryButton disabled={busy || !ready} onClick={() => void join()}>
          {busy ? 'Joining…' : 'Join'}
        </PrimaryButton>
      </div>
    </StepPage>
  );
}
