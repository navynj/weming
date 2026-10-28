'use client';

import { MAX_TALL, PLACEHOLDER_ASPECT } from '@/features/month-board/layout';
import { learnsAspect, usePhotoAspects } from '@/features/month-board/photo-aspects';
import type { SignedMedia } from '@/lib/media';
import { VideoPlayer } from '@/components/ui/video-media';

import type { CardPhoto } from './grid';

/** Thumbnails shown in a row under one ripple, before "+n". */
export const PHOTOS_SHOWN = 3;

/**
 * One ripple's photos on the top card (review), as its detail shows them:
 * thumbnails across the card's width, up to three in a row, the third
 * carrying "+n" when there are more. Never cropped (review, 2026-10-27):
 * each keeps its own ratio, a third of the width wide, at most twice as
 * tall, the whole image scaled down beyond that. Until it loads it holds a
 * 4:3 placeholder; once drawn nothing is behind it, so a cutout floats.
 */
export function CardPhotos({
  photos: media,
  signed,
}: {
  photos: CardPhoto[];
  signed: SignedMedia;
}) {
  const aspects = usePhotoAspects();
  // Its videos (part 5) play in place under the photos, each the card's width.
  const photos = media.filter((m) => !m.video);
  const videos = media.flatMap((m) => (m.video ? [m.video] : []));
  if (media.length === 0) return null;
  const shown = photos.slice(0, PHOTOS_SHOWN);
  const more = photos.length - shown.length;
  const grid = (
    <span data-card-photos className="grid grid-cols-3 items-start gap-1 pt-1.5">
      {shown.map((photo, index) => {
        const url = signed[photo.path];
        const known = aspects[photo.path];
        return (
          <span
            key={photo.path}
            data-card-photo={photo.path}
            className={`relative overflow-hidden rounded-md ${known ? '' : 'bg-pool-100'}`}
            style={{ aspectRatio: Math.max(known ?? PLACEHOLDER_ASPECT, 1 / MAX_TALL) }}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
                {...learnsAspect(photo.path)}
              />
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
  return (
    <>
      {photos.length > 0 ? grid : null}
      {videos.map((video) => (
        <span key={video.id} data-card-video={video.id} className="block pt-1.5">
          <VideoPlayer video={video} />
        </span>
      ))}
    </>
  );
}
