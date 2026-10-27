'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Monogram } from '@/components/ui/monogram';
import { saveProfile } from '@/features/people/actions';
import { NAME_MAX } from '@/features/people/name';

import { joinPool } from './actions';
import { PrimaryButton, StepPage } from './step-page';

/**
 * Joining from an invite link (H23; hotfix 2026-10-26): one screen — the
 * pool's name and its members' initials (0011 `invite_preview`), my name as
 * they will see it, and Join. Nothing about how my records connect: every
 * pool lane starts unconnected, writing from the pool works as for any
 * unconnected one, and connecting stays in the pool's settings. The token is
 * checked again when joining.
 */
export function JoinFlow({
  token,
  poolName,
  photo = null,
  initials,
  myName,
}: {
  token: string;
  poolName: string;
  /** The pool's photo, signed briefly for this invite (0024); the letters without one. */
  photo?: string | null;
  initials: string[];
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
    // No links (hotfix): every pool lane starts unconnected for me.
    const joined = await joinPool({ token, links: [], includeHistory: false });
    if (!joined.ok) {
      setMessage(joined.message);
      setBusy(false);
      return;
    }
    router.replace(`/pool/${joined.id}`);
  }

  return (
    <StepPage step={null} onBack={() => router.replace('/')}>
      <p className="text-pool-500 text-sm">You are invited to</p>
      <div className="mt-4 flex items-center gap-4">
        <Monogram name={poolName} size="tile" photo={photo} />
        <h1
          data-invite-pool
          className="text-main-900 min-w-0 text-3xl/tight font-semibold break-words"
        >
          {poolName}
        </h1>
      </div>
      <ul aria-label="Members" className="mt-8 flex flex-wrap gap-2">
        {initials.map((letters, index) => (
          <li
            key={`${letters}-${index}`}
            data-invite-member
            className="bg-pool-100 text-pool-500 flex h-10 w-10 items-center justify-center rounded-full text-xs font-medium"
          >
            {letters}
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
