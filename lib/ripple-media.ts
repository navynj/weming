import { videosIn, type YouTubeVideo } from '@/lib/youtube';

/** A video's place among a ripple's media: never a storage path. */
export const VIDEO_PREFIX = 'yt:';

export function isVideoPath(path: string): boolean {
  return path.startsWith(VIDEO_PREFIX);
}

export function videoIdOf(path: string): string {
  return path.slice(VIDEO_PREFIX.length);
}

/**
 * A photo the app ships rather than one the author uploaded (H58): `app:` and
 * a file under `public/`, one copy for every account. Never a storage path,
 * so it is never signed and never removed.
 */
export const APP_ASSET_PREFIX = 'app:';

export function isAppAsset(path: string): boolean {
  return path.startsWith(APP_ASSET_PREFIX);
}

/** Where the browser loads an app asset from: same origin, no signing. */
export function appAssetUrl(path: string): string {
  return `/${path.slice(APP_ASSET_PREFIX.length)}`;
}

/** A path that names an object in the media bucket. */
export function isStoragePath(path: string): boolean {
  return !isVideoPath(path) && !isAppAsset(path);
}

/** One media item of a ripple: a photo by its storage path, or a video its words link to. */
export type RippleMediaItem = { rippleId: string; path: string; video?: YouTubeVideo };

/**
 * A ripple's media, as a card and the board read it (part 5): its photos in
 * the order they were added, then each YouTube video its words link to,
 * unless its author turned video previews off.
 */
export function rippleMedia(ripple: {
  id: string;
  media: string[];
  note: string | null;
  video_previews?: boolean;
}): RippleMediaItem[] {
  const photos = ripple.media.map((path) => ({ rippleId: ripple.id, path }));
  if (ripple.video_previews === false) return photos;
  return [
    ...photos,
    ...videosIn(ripple.note).map((video) => ({
      rippleId: ripple.id,
      path: `${VIDEO_PREFIX}${video.id}`,
      video,
    })),
  ];
}
