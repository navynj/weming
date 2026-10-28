'use client';

import { useState } from 'react';

import { Avatar, PersonName } from '@/features/people/avatar';
import type { PoolView } from '@/lib/queries/pools';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { allowBackPoolMember, transferPoolOwner } from './actions';
import { DeletePool } from './delete-pool';
import { PoolSheet, SheetTitle } from './sheet';

/**
 * The owner's foot of Advanced (0063, H50): hand the pool on, let a removed
 * person back, and Delete only as the one member left. The owner cannot
 * leave; in Leave's place, the way to.
 */
export function OwnerSection({ view, me }: { view: PoolView; me: string }) {
  const poolId = view.pool.id;
  const [choosing, setChoosing] = useState(false);
  const owner = useOptimisticAction(view.pool.ownerId);
  const removed = useOptimisticAction(view.removed ?? []);
  const others = view.members.filter((m) => !m.former && m.userId !== me);

  // Handed on: this sheet is a member's now, as soon as the hand commits it.
  if (owner.value !== me) {
    return (
      <p className="text-pool-500 py-2 text-sm" data-owner-handed>
        {others.find((m) => m.userId === owner.value)?.name ?? 'Someone'} is the owner now.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {others.length > 0 ? (
        <>
          <button
            type="button"
            data-transfer-owner
            onClick={() => setChoosing(true)}
            className="text-ink py-2 text-sm font-medium"
          >
            Make someone else the owner
          </button>
          <button
            type="button"
            data-transfer-to-leave
            onClick={() => setChoosing(true)}
            className="text-pool-500 py-2 text-sm"
          >
            Transfer ownership to leave
          </button>
          <p data-delete-pool-blocked className="text-pool-500 py-2 text-sm">
            Remove everyone else or transfer ownership first to delete this Pool.
          </p>
        </>
      ) : (
        <DeletePool poolId={poolId} poolName={view.pool.name} />
      )}
      {owner.message ? (
        <p role="alert" className="text-pool-500 text-xs">
          {owner.message}
        </p>
      ) : null}

      {removed.value.length > 0 ? (
        <section data-removed-members className="mt-6 w-full">
          <h3 className="text-ink mb-1 text-sm font-medium">Removed</h3>
          <p className="text-pool-500 mb-2 text-xs">
            They can’t join this Pool with any link until you allow them back.
          </p>
          <ul className="flex flex-col">
            {removed.value.map((person) => (
              <li
                key={person.userId}
                data-removed={person.userId}
                className="border-pool-100 flex items-center gap-3 border-b py-2 last:border-b-0"
              >
                <span className="text-ink min-w-0 flex-1 truncate text-sm">{person.name}</span>
                <button
                  type="button"
                  data-allow-back
                  onClick={() =>
                    removed.run(
                      (list) => list.filter((p) => p.userId !== person.userId),
                      () => allowBackPoolMember(poolId, person.userId),
                      'Allowed back',
                    )
                  }
                  className="text-main-900 py-1 text-sm font-medium"
                >
                  Allow back
                </button>
              </li>
            ))}
          </ul>
          {removed.message ? (
            <p role="alert" className="text-pool-500 mt-2 text-xs">
              {removed.message}
            </p>
          ) : null}
        </section>
      ) : null}

      {choosing ? (
        <TransferSheet
          poolName={view.pool.name}
          candidates={others}
          onClose={() => setChoosing(false)}
          onPick={(userId) => {
            setChoosing(false);
            owner.run(
              () => userId,
              () => transferPoolOwner(poolId, userId),
              'Owner changed',
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** Pick a current member, then confirm: it takes effect at once. */
function TransferSheet({
  poolName,
  candidates,
  onClose,
  onPick,
}: {
  poolName: string;
  candidates: PoolView['members'];
  onClose: () => void;
  onPick: (userId: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const name = candidates.find((m) => m.userId === picked)?.name;
  return (
    <PoolSheet label="Make someone else the owner" onClose={onClose}>
      <SheetTitle>Who owns {poolName} next?</SheetTitle>
      <p className="text-pool-500 -mt-2 mb-4 text-sm/relaxed">
        The owner can remove members and delete the Pool, and sets the members’ notification
        defaults. You stay in the Pool as a member.
      </p>
      <ul className="flex flex-col" data-transfer-candidates>
        {candidates.map((member) => (
          <li key={member.userId}>
            <button
              type="button"
              data-transfer-candidate={member.userId}
              aria-pressed={picked === member.userId}
              onClick={() => setPicked(member.userId)}
              className="border-pool-100 flex w-full items-center gap-3 border-b py-3 text-left"
            >
              <Avatar
                id={member.userId}
                initials={member.initials}
                className="bg-pool-100 text-pool-500 flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium"
              />
              <span className="text-ink min-w-0 flex-1 truncate">
                <PersonName id={member.userId} name={member.name} />
              </span>
              {picked === member.userId ? (
                <span className="bg-ink h-2.5 w-2.5 rounded-full" aria-hidden />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-transfer-confirm
        disabled={!picked}
        onClick={() => picked && onPick(picked)}
        className="bg-ink mt-5 h-14 w-full rounded-full font-semibold text-white disabled:opacity-30"
      >
        {name ? `Make ${name} the owner` : 'Make them the owner'}
      </button>
    </PoolSheet>
  );
}
