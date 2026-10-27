'use client';

import Link from 'next/link';

import { Avatar } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';

import { chipsOf, repliesShown, type RippleResponsesValue } from './model';
import { ReactionChips } from './reaction-chips';

/** A reply's face on the card: small, beside its words. */
const FACE_PX = 16;

/**
 * What readers left under one ripple, on the top card (H25, review): its
 * reaction chips — reacting works here, in place — then its first two
 * replies, each its author's face and words, then "+n more replies". A reply
 * or "+n" opens the post's sheet scrolled to that reply; the card reads, the
 * sheet writes. Nothing where nothing was left and nothing can be.
 */
export function CardResponses({
  rippleId,
  value,
  canReact,
  href,
  onReact,
}: {
  rippleId: string;
  value: RippleResponsesValue;
  canReact: boolean;
  /** The post's sheet: a reply opens it at `#reply-<id>`. */
  href: string;
  onReact: (emoji: string) => void;
}) {
  const { me } = usePeople();
  const chips = chipsOf(value.reactions, rippleId, me ?? '');
  const { shown, more } = repliesShown(value.replies, rippleId, false);
  if (chips.length === 0 && shown.length === 0 && !canReact) return null;
  // Where "+n" opens: the first reply the card does not show.
  const next = more > 0 ? repliesShown(value.replies, rippleId, true).shown[shown.length] : null;
  return (
    <div
      data-card-responses={rippleId}
      className="pointer-events-auto flex flex-col gap-1.5 pt-1.5"
      // Taps here are the card's own: they neither open the post nor start a flip.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <ReactionChips chips={chips} canReact={canReact} onToggle={onReact} floating />
      {shown.length > 0 ? (
        <ol data-card-replies className="flex flex-col gap-1">
          {shown.map((reply) => (
            <li key={reply.id}>
              <Link
                href={`${href}#reply-${reply.id}`}
                data-card-reply={reply.id}
                className="flex min-w-0 items-center gap-1.5 text-xs"
              >
                <Avatar
                  id={reply.author_id}
                  initials=""
                  className="bg-pool-100 text-pool-500 flex shrink-0 items-center justify-center rounded-full text-[10px]"
                  style={{ width: FACE_PX, height: FACE_PX }}
                />
                <span className={`truncate ${reply.body === null ? 'text-pool-500' : 'text-ink'}`}>
                  {reply.body ?? 'Hidden by the author'}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      {next ? (
        <Link
          href={`${href}#reply-${next.id}`}
          data-card-replies-more
          className="text-pool-500 text-xs"
        >
          +{more} more {more === 1 ? 'reply' : 'replies'}
        </Link>
      ) : null}
    </div>
  );
}
