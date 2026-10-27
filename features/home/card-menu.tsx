'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MoreHorizontal, Pencil } from 'lucide-react';

import { useInputSheet } from '@/features/input-sheet/sheet-provider';

import { splashHref } from '@/features/home/scope';
import { usePoolEditScope } from '@/features/pool/edit-scope';

import type { Card } from './grid';

/**
 * The top card's quiet menu (review): the `…` at its top right, the same
 * three things the post's page offers from its header — open the page,
 * pin or unpin, delete behind a small confirm. In ink, the selection
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
  const [menu, setMenu] = useState<'closed' | 'open' | 'delete'>('closed');
  const { count } = card.splash;
  const { openEdit } = useInputSheet();
  const pool = usePoolEditScope();

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
