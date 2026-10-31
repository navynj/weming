'use client';

import Link from 'next/link';

import { LinkedText } from '@/components/ui/linked-text';
import type { RippleResponsesValue } from '@/features/responses/model';
import type { SignedMedia } from '@/lib/media';

import type { Card } from './grid';

/**
 * The phone's top card, under its title (H42f): the first lines of the
 * post — every block's words, oldest first — then the first photo's
 * thumbnail where there is room, in its own ratio, never cropped. The card
 * keeps its height; what does not fit runs under the card's fade.
 */
export function CardPreview({ card, signed }: { card: Card; signed: SignedMedia }) {
  const words = (card.ripples.length > 0 ? card.ripples.map((r) => r.note) : [card.body])
    .map((note) => note?.trim() ?? '')
    .filter((note) => note.length > 0);
  const first = card.photos?.[0];
  const url = first ? signed[first.path] : undefined;
  return (
    <span data-card-preview className="flex flex-col gap-1.5">
      {words.map((note, at) => (
        <span
          key={at}
          data-card-preview-text
          className="text-ink/80 text-[13px]/relaxed whitespace-pre-wrap"
        >
          <LinkedText text={note} />
        </span>
      ))}
      {first ? (
        <span
          data-card-preview-photo={first.path}
          className={`block h-16 self-start overflow-hidden rounded-md ${url ? '' : 'bg-pool-100 aspect-[4/3]'}`}
        >
          {url ? (
            // A signed URL kept by path (lib/media-url-cache), or YouTube's own thumbnail: next/image would cache it past its life.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" draggable={false} className="block h-full w-auto" />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The phone's top card's one line of responses (H42f), pinned under the
 * fade: the reaction most left, with every reaction's count, and "n replies"
 * when there are any. A tap opens the sheet at the first block anyone
 * reacted or replied to (`#responded`, H25). Nothing at all when there are none.
 */
export function CardResponseLine({ value, href }: { value: RippleResponsesValue; href: string }) {
  const total = value.reactions.length;
  // The replies I can read: a hidden one I may not is not counted.
  const replies = value.replies.filter((r) => r.body !== null).length;
  if (total === 0 && replies === 0) return null;
  const counts = new Map<string, number>();
  // Most left first; a tie goes to the one left first.
  for (const r of [...value.reactions].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  )) {
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  }
  const top = [...counts].reduce<[string, number] | null>(
    (best, entry) => (best === null || entry[1] > best[1] ? entry : best),
    null,
  );
  return (
    <Link
      href={`${href}#responded`}
      data-card-response-line
      className="text-pool-500 pointer-events-auto flex shrink-0 items-center gap-2 pt-1.5 text-xs/none"
    >
      {top ? (
        <span data-card-reactions className="flex items-center gap-1 tabular-nums">
          <span aria-hidden>{top[0]}</span>
          <span>{total}</span>
        </span>
      ) : null}
      {top && replies > 0 ? <span aria-hidden>·</span> : null}
      {replies > 0 ? (
        <span data-card-reply-count className="tabular-nums">
          {replies === 1 ? '1 reply' : `${replies} replies`}
        </span>
      ) : null}
    </Link>
  );
}
