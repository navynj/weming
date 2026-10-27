'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MoreHorizontal, Pencil } from 'lucide-react';

import { useInputSheet } from '@/features/input-sheet/sheet-provider';

import { splashHref } from '@/features/home/scope';
import { usePoolEditScope } from '@/features/pool/edit-scope';
import {
  makeJointRecord,
  previewMakeJoint,
  type MakeJointPreview,
} from '@/features/splash-sheet/edit-actions';

import type { Card } from './grid';

/** How long a conversion stays applied over the server's rows before the re-read has surely landed. */
const SETTLE_MS = 2500;

/**
 * The top card's quiet menu (review): the `…` at its top right, the same
 * three things the post's page offers from its header — open the page,
 * pin or unpin, delete behind a small confirm — and, for my record in a
 * pool, "Make it a joint record of <Pool>…" behind its confirm: the only way
 * my record becomes joint (Yoonji, in the session). In ink, the selection
 * channel. A sibling of the card's link, never inside it.
 */
export function CardMenu({
  card,
  pinned,
  onPin,
  onDelete,
}: {
  card: Card;
  pinned: boolean;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<'closed' | 'open' | 'delete' | 'joint'>('closed');
  const [joint, setJoint] = useState<MakeJointPreview | null>(null);
  const { count } = card.splash;
  const { openEdit, markEdited, clearEdited, dropFailed } = useInputSheet();
  const router = useRouter();
  const pool = usePoolEditScope();
  // My record, in a pool: the one this screen is, or on Home my pool record's own.
  const jointTarget =
    card.editable && !card.joint && !card.splash.orphan
      ? pool
        ? { id: pool.poolId, name: pool.poolName }
        : card.splash.ownPoolId
          ? { id: card.splash.ownPoolId, name: card.lane?.name ?? 'its Pool' }
          : null
      : null;

  function askJoint(): void {
    if (!jointTarget) return;
    setMenu('joint');
    setJoint(null);
    previewMakeJoint(card.splash.id, jointTarget.id)
      .then(setJoint)
      .catch(() => setJoint({ ok: false, message: 'That did not open. Try again.' }));
  }

  function makeJoint(): void {
    if (!jointTarget) return;
    setMenu('closed');
    const id = card.splash.id;
    // Shown at once (CLAUDE.md, the principle); a refusal takes it back.
    markEdited(id, { title: card.splash.title, icon: card.splash.icon, kind: 'joint' });
    makeJointRecord(id, jointTarget.id)
      .then((done) => {
        if (!done.ok) {
          clearEdited(id);
          dropFailed(done.message);
          return;
        }
        router.refresh();
        window.setTimeout(() => clearEdited(id), SETTLE_MS);
      })
      .catch(() => {
        clearEdited(id);
        dropFailed('That did not go through. Try again.');
      });
  }

  return (
    <div
      className="absolute top-3 right-3 z-20 flex items-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {card.editable ? (
        // Edit, beside the menu (review): the compose sheet in edit mode.
        <button
          type="button"
          aria-label="Edit"
          data-card-edit
          onClick={() => openEdit(card.splash.id, pool)}
          className="text-pool-500 flex h-8 w-8 items-center justify-center rounded-full"
        >
          <Pencil aria-hidden size={16} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="More"
        aria-expanded={menu !== 'closed'}
        data-card-menu-button
        onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}
        className="text-pool-500 flex h-8 w-8 items-center justify-center rounded-full"
      >
        <MoreHorizontal aria-hidden size={18} />
      </button>

      {menu === 'open' ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenu('closed')}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul
            role="menu"
            data-card-menu
            className="surface bg-ink absolute top-full right-0 z-20 flex w-40 flex-col rounded-xl py-1 text-sm text-white shadow-lg"
          >
            <li>
              <Link
                role="menuitem"
                href={card.href ?? splashHref(card.splash.id)}
                className="block px-4 py-2.5"
              >
                Open
              </Link>
            </li>
            {card.menu?.pin === false ? null : (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu('closed');
                    onPin(!pinned);
                  }}
                  className="w-full px-4 py-2.5 text-left"
                >
                  {pinned ? 'Unpin' : 'Pin'}
                </button>
              </li>
            )}
            {jointTarget ? (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  data-card-make-joint
                  onClick={askJoint}
                  className="w-full px-4 py-2.5 text-left"
                >
                  Make it a joint record of {jointTarget.name}…
                </button>
              </li>
            ) : null}
            {card.menu?.delete === false ? null : (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMenu('delete')}
                  className="w-full px-4 py-2.5 text-left text-white/70"
                >
                  Delete
                </button>
              </li>
            )}
          </ul>
        </>
      ) : null}

      {menu === 'joint' && jointTarget ? (
        <div
          role="alertdialog"
          data-joint-confirm
          className="bg-ink absolute top-full right-0 z-20 flex w-64 flex-col gap-2 rounded-xl px-3 py-2 text-sm text-white shadow-lg"
        >
          {joint === null ? (
            <p className="text-white/70">Opening…</p>
          ) : joint.ok ? (
            <>
              <p className="text-white/70">
                Make this a joint splash in {joint.poolName}? Everyone in {joint.poolName} can add
                to it and edit its title. You keep your ripples.
              </p>
              {joint.removed.length > 0 ? (
                <p data-joint-removed className="text-white/70">
                  It will be removed from {joint.removed.join(', ')}.
                </p>
              ) : null}
              <span className="flex gap-3">
                <button
                  type="button"
                  data-joint-confirm-go
                  onClick={makeJoint}
                  className="font-medium"
                >
                  Make it joint
                </button>
                <button type="button" onClick={() => setMenu('closed')} className="text-white/70">
                  Keep
                </button>
              </span>
            </>
          ) : (
            <p role="alert" className="text-white/70">
              {joint.message}
            </p>
          )}
        </div>
      ) : null}

      {menu === 'delete' ? (
        <div
          role="alertdialog"
          data-card-delete-confirm
          className="bg-ink absolute top-full right-0 z-20 flex w-56 flex-col gap-2 rounded-xl px-3 py-2 text-sm text-white shadow-lg"
        >
          <p className="text-white/70">
            Deletes the post and its {count} block{count === 1 ? '' : 's'}.
          </p>
          <span className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setMenu('closed');
                onDelete();
              }}
              className="font-medium"
            >
              Delete
            </button>
            <button type="button" onClick={() => setMenu('closed')} className="text-white/70">
              Keep
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
