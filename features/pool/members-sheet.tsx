'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { PoolMember } from '@/lib/queries/pools';
import { Avatar, PersonName } from '@/features/people/avatar';

import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { leavePool, removePoolMember } from './actions';
import { PoolSheet, SheetTitle } from './sheet';

/**
 * The member list (H23): current members, me first then join order (D7),
 * then former members who kept their records, marked so. At the foot,
 * *Leave Pool*, which asks one question before it does anything — for a
 * member: the owner cannot leave (0063), and removes others from here.
 */
export function MembersSheet({
  poolId,
  poolName,
  ownerId,
  members,
  me,
  onClose,
}: {
  poolId: string;
  poolName: string;
  ownerId: string | null;
  members: PoolMember[];
  me: string;
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<PoolMember | null>(null);
  // Gone from the list the moment the owner confirms (CLAUDE.md, optimistic).
  const list = useOptimisticAction(members);
  const owner = ownerId === me;
  if (leaving) return <LeaveSheet poolId={poolId} onClose={() => setLeaving(false)} />;
  if (removing) {
    return (
      <RemoveSheet
        name={removing.name}
        poolName={poolName}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          const who = removing.userId;
          setRemoving(null);
          list.run(
            (current) => current.filter((m) => m.userId !== who),
            () => removePoolMember(poolId, who),
          );
        }}
      />
    );
  }
  return (
    <PoolSheet label="Members" onClose={onClose}>
      <SheetTitle>Members</SheetTitle>
      {list.message ? (
        <p role="alert" className="text-pool-500 mb-3 text-sm">
          {list.message}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {list.value.map((member) => (
          <li
            key={member.userId}
            data-member={member.userId}
            className="border-pool-100 flex items-center gap-3 border-b py-3"
          >
            <Avatar
              id={member.userId}
              initials={member.initials}
              className="bg-pool-100 text-pool-500 flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium"
            />
            <span className="text-ink min-w-0 flex-1 truncate">
              <PersonName id={member.userId} name={member.name} />
              {member.userId === me ? <span className="text-pool-500"> (you)</span> : null}
            </span>
            {member.former ? (
              <span data-former-member className="text-pool-500 text-xs">
                Former member
              </span>
            ) : member.userId === ownerId ? (
              <span data-pool-owner className="text-pool-500 text-xs">
                Owner
              </span>
            ) : owner ? (
              <button
                type="button"
                data-remove-member={member.userId}
                onClick={() => setRemoving(member)}
                className="text-pool-500 py-1 text-xs"
              >
                Remove from Pool
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {owner ? null : (
        <button
          type="button"
          data-leave-pool
          onClick={() => setLeaving(true)}
          className="text-pool-500 mt-6 self-start py-2 text-sm"
        >
          Leave Pool
        </button>
      )}
    </PoolSheet>
  );
}

/**
 * Removing (0063): exactly leaving with Remove, for them — what they wrote
 * here is hidden, never deleted, and comes back if they are let back in and
 * join again. They are not told.
 */
function RemoveSheet({
  name,
  poolName,
  onClose,
  onConfirm,
}: {
  name: string;
  poolName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <PoolSheet label="Remove from Pool" onClose={onClose}>
      <SheetTitle>
        Remove {name} from {poolName}?
      </SheetTitle>
      <p className="text-pool-500 -mt-2 mb-6 text-sm/relaxed">
        They lose access at once. What they wrote here is hidden from the Pool, never deleted, and
        comes back if they join again. They can’t join with any link until you allow them back in
        Advanced.
      </p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          data-remove-confirm
          onClick={onConfirm}
          className="bg-ink h-14 rounded-full font-semibold text-white"
        >
          Remove from Pool
        </button>
        <button type="button" onClick={onClose} className="text-pool-500 py-2 text-sm">
          Cancel
        </button>
      </div>
    </PoolSheet>
  );
}

/**
 * Leaving (H23): keep my records here, marked *Former member*, or remove
 * them — hidden from the pool, never deleted. My posts stay on my Home
 * either way, which the sheet says, so neither answer reads as a loss.
 */
export function LeaveSheet({ poolId, onClose }: { poolId: string; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const leave = async (keep: boolean): Promise<void> => {
    setBusy(true);
    const done = await leavePool(poolId, keep);
    if (!done.ok) {
      setMessage(done.message);
      setBusy(false);
      return;
    }
    router.replace('/pool');
  };
  return (
    <PoolSheet label="Leave Pool" onClose={onClose}>
      <SheetTitle>Keep your records in this Pool?</SheetTitle>
      <p className="text-pool-500 -mt-2 mb-6 text-sm/relaxed">
        Your splashes always stay on your own Home. Members of this Pool keep seeing them only if
        you keep them here.
      </p>
      {message ? (
        <p role="alert" className="text-pool-500 mb-3 text-sm">
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          data-leave-keep
          disabled={busy}
          onClick={() => void leave(true)}
          className="bg-main-900 h-14 rounded-full font-semibold text-white disabled:opacity-40"
        >
          Keep them
        </button>
        <button
          type="button"
          data-leave-remove
          disabled={busy}
          onClick={() => void leave(false)}
          className="border-pool-200 text-ink h-14 rounded-full border font-semibold disabled:opacity-40"
        >
          Remove them
        </button>
        <button type="button" onClick={onClose} className="text-pool-500 py-2 text-sm">
          Stay in the Pool
        </button>
      </div>
    </PoolSheet>
  );
}
