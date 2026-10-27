'use client';

import type { SignedMedia } from '@/lib/media';

import type { CardPhoto } from './grid';

/** Thumbnails shown in a row under one ripple, before "+n". */
export const PHOTOS_SHOWN = 3;

/**
 * One ripple's photos on the top card (review), as its detail shows them:
 * thumbnails across the card's width, up to three in a row, the third
 * carrying "+n" when there are more. A photo not signed yet is its
 * placeholder; nothing waits on a photo.
 */
export function CardPhotos({ photos, signed }: { photos: CardPhoto[]; signed: SignedMedia }) {
  if (photos.length === 0) return null;
  const shown = photos.slice(0, PHOTOS_SHOWN);
  const more = photos.length - shown.length;
  return (
    <span data-card-photos className="grid grid-cols-3 gap-1 pt-1.5">
      {shown.map((photo, index) => {
        const url = signed[photo.path];
        return (
          <span
            key={photo.path}
            data-card-photo={photo.path}
            className="bg-pool-100 relative aspect-square overflow-hidden rounded-md"
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : null}
            {more > 0 && index === shown.length - 1 ? (
              <span
                data-card-photos-more
                className="bg-ink/50 absolute inset-0 flex items-center justify-center text-sm font-semibold text-white"
              >
                +{more}
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
