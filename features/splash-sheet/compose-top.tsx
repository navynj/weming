'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/**
 * The composer's `…` (review), at the end of the title's row — no face of
 * mine, the writer always being me (Yoonji, in the session) — whose one item asks for the
 * splash's description, or takes the asked-for field away again. The field
 * is never shown unasked, so it is not taken for the body.
 */
export function ComposeTop({
  describing,
  onDescribing,
}: {
  describing: boolean;
  onDescribing: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    // Centred on the title's first line (text-3xl/snug), not its whole box.
    <div data-compose-top className="flex shrink-0 items-center pt-1">
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="More"
          aria-expanded={open}
          data-compose-more
          onClick={() => setOpen((was) => !was)}
          className="text-pool-500 flex h-8 w-8 items-center justify-center"
        >
          <MoreHorizontal aria-hidden size={18} />
        </button>
        {open ? (
          <ul
            role="menu"
            data-compose-menu
            className="border-pool-100 absolute top-full right-0 z-10 flex w-56 flex-col rounded-xl border bg-white py-1 text-sm shadow-lg"
          >
            <li>
              <button
                type="button"
                role="menuitem"
                data-compose-description={describing ? 'hide' : 'add'}
                onClick={() => {
                  setOpen(false);
                  onDescribing(!describing);
                }}
                className="text-ink hover:bg-pool-100 flex w-full items-center px-3 py-2 text-left"
              >
                {describing ? 'Hide splash description' : 'Add splash description'}
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </div>
  );
}
