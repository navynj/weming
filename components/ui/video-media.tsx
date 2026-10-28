'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

import { playerUrl, thumbnailUrl, videoAspect, type YouTubeVideo } from '@/lib/youtube';

/**
 * A YouTube video's thumbnail (part 5): YouTube's own image, cropped to the
 * video's shape (its 4:3 file carries bars), with a play mark where it plays.
 * Nothing is asked of YouTube until this is drawn; no player, no tracking.
 */
export function VideoThumb({
  url,
  play = true,
  className = '',
}: {
  url: string | null | undefined;
  /** The play mark; off on the board, where a video is a sticker (H42c). */
  play?: boolean;
  className?: string;
}) {
  return (
    <span
      data-video-thumb
      className={`relative block h-full w-full overflow-hidden bg-black ${className}`}
    >
      {url ? (
        // YouTube's thumbnail, loaded only where it is drawn: no next/image proxy in between.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} className="block h-full w-full object-cover" />
      ) : null}
      {play ? (
        <span
          aria-hidden
          className="text-main-900 absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white"
        >
          <Play size={14} className="translate-x-px" fill="currentColor" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Play in place (part 5): the thumbnail until play is pressed, then the
 * player from youtube-nocookie.com in the same box — the only moment
 * YouTube's player, and anything it tracks, is loaded.
 */
export function VideoPlayer({ video }: { video: YouTubeVideo }) {
  const [playing, setPlaying] = useState(false);
  return (
    <span
      data-video-player={video.id}
      className="relative block w-full overflow-hidden rounded-lg"
      style={{ aspectRatio: videoAspect(video) }}
    >
      {playing ? (
        <iframe
          src={playerUrl(video)}
          title="YouTube video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          aria-label="Play video"
          data-video-play
          onClick={(event) => {
            // The card around it opens the post; play stays here.
            event.stopPropagation();
            setPlaying(true);
          }}
          className="absolute inset-0 block"
        >
          <VideoThumb url={thumbnailUrl(video.id)} />
        </button>
      )}
    </span>
  );
}
