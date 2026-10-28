'use client';

import { LinkedText } from '@/components/ui/linked-text';
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
            // A signed URL for a few minutes, or YouTube's own thumbnail: next/image would cache it past its life.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" draggable={false} className="block h-full w-auto" />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
