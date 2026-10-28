import type { ReactNode } from 'react';

import { Avatar } from '@/features/people/avatar';

/** The avatar column's width, and the avatar's diameter in it. */
const AVATAR_PX = 20;

/**
 * A post's ripples as a thread (round 3): each ripple an entry of its own,
 * the author's initials avatar at the left, its body indented beside it, and
 * a thin line running down from one avatar to the next, so the sequence
 * reads avatar, line, avatar, line — stopping at the last avatar. One ripple
 * is an avatar and no line. A timestamp, when given, sits beside the avatar
 * in small text. Shared by the top card on Home and the post's page.
 */
export function RippleThread({
  entries,
  initials,
  authorId,
  className = '',
}: {
  /** `initials` per entry in a pool, where each ripple keeps its author (H23). */
  entries: {
    id: string;
    body: ReactNode;
    meta?: ReactNode;
    initials?: string;
    authorId?: string;
    /** New reactions or replies from someone else on my ripple since I last opened it (H25). */
    dot?: boolean;
    /** A part removed by a hand-over (0061): nobody's, so no face — only the thread's place. */
    removed?: boolean;
  }[];
  initials: string;
  /** Whose face the entries without their own author show (0018): mine, on my own pages. */
  authorId?: string | null;
  className?: string;
}) {
  return (
    <ol data-ripple-thread className={`flex flex-col ${className}`}>
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        return (
          <li
            key={entry.id}
            data-thread-entry={entry.id}
            className="relative grid gap-x-2.5"
            style={{ gridTemplateColumns: `${AVATAR_PX}px minmax(0, 1fr)` }}
          >
            <span className="relative flex flex-col items-center">
              <span data-thread-avatar className="relative flex shrink-0">
                {entry.removed ? (
                  <span
                    aria-hidden
                    data-thread-removed
                    className="flex shrink-0 items-center justify-center"
                    style={{ width: AVATAR_PX, height: AVATAR_PX }}
                  >
                    <span className="bg-pool-200 h-1.5 w-1.5 rounded-full" />
                  </span>
                ) : (
                  <Avatar
                    id={entry.authorId ?? (entry.initials === undefined ? authorId : undefined)}
                    initials={entry.initials ?? initials}
                    className="bg-pool-100 text-pool-500 flex shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                    style={{ width: AVATAR_PX, height: AVATAR_PX }}
                  />
                )}
                {entry.dot ? (
                  <span
                    aria-label="New reactions or replies"
                    data-responses-unseen
                    className="bg-main-900 absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white"
                  />
                ) : null}
              </span>
              {last ? null : (
                // The thread: from under this avatar down to the next one.
                <span aria-hidden data-thread-line className="bg-pool-200 mt-1 w-px flex-1" />
              )}
            </span>
            <span className={`flex min-w-0 flex-col gap-0.5 ${last ? '' : 'pb-4'}`}>
              {entry.meta ? (
                <span className="text-pool-500 flex min-h-5 items-center text-[11px] tabular-nums">
                  {entry.meta}
                </span>
              ) : null}
              {entry.body}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
