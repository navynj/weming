import { z } from 'zod';

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

/** A photo's size in pixels. */
export type MediaSize = { w: number; h: number };

/**
 * What 0070 keeps per path: the photo's size, its display copy's when it has
 * one, and its thumbnail's (2026-10-30) when it has one.
 */
export type MediaMetaEntry = MediaSize & { d?: MediaSize; t?: MediaSize };

/** `ripples.media_meta`, keyed by path. A path missing here is a photo from before 0070. */
export type MediaMeta = Record<string, MediaMetaEntry>;

const Size = z.object({
  w: z.number().int().positive().max(20000),
  h: z.number().int().positive().max(20000),
});

/** `media_meta` as an action takes it from the browser: sizes only, for layout, nothing trusted beyond that. */
export const MediaMetaInput = z
  .record(z.string(), Size.extend({ d: Size.optional(), t: Size.optional() }))
  .optional();

/**
 * What a row stores beside `media`: only the paths it names, the later entry
 * winning. An edit passes the row's own entries first, so a photo kept keeps
 * its size and one removed takes its entry with it.
 */
export function mediaMetaFor(media: string[], ...metas: MediaMeta[]): MediaMeta {
  const merged: MediaMeta = Object.assign({}, ...metas);
  return Object.fromEntries(media.flatMap((path) => (merged[path] ? [[path, merged[path]]] : [])));
}

/**
 * Which copy a surface draws (2026-10-30): the thumbnail on boards, the grid,
 * cards and lists; the display copy on the post's page; the full one up close.
 */
export type MediaVariant = 'thumb' | 'display' | 'full';

function sizeOf(value: unknown): MediaSize | null {
  if (!value || typeof value !== 'object') return null;
  const { w, h } = value as Record<string, unknown>;
  return typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 ? { w, h } : null;
}

/** The column as read, kept only where it has the shape 0070 writes; never throws. */
export function mediaMetaOf(value: unknown): MediaMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: MediaMeta = {};
  for (const [path, entry] of Object.entries(value)) {
    const size = sizeOf(entry);
    if (!size) continue;
    const d = sizeOf((entry as Record<string, unknown>).d);
    const t = sizeOf((entry as Record<string, unknown>).t);
    out[path] = { ...size, ...(d ? { d } : {}), ...(t ? { t } : {}) };
  }
  return out;
}

/**
 * Where a photo's display copy lives: beside it, `.d` before the extension
 * (`<me>/<id>.webp` → `<me>/<id>.d.webp`). Derived, never stored, so a delete
 * that only knows the path can take both.
 */
export function displayPathOf(path: string): string {
  return copyPathOf(path, 'd');
}

/** Where a photo's thumbnail lives: beside it, `.t` before the extension, derived like `.d`. */
export function thumbPathOf(path: string): string {
  return copyPathOf(path, 't');
}

function copyPathOf(path: string, mark: 'd' | 't'): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash ? `${path.slice(0, dot)}.${mark}${path.slice(dot)}` : `${path}.${mark}`;
}

/**
 * The object a surface loads for a path: the smallest copy it asked for that
 * was uploaded. A thumbnail falls back to the display copy, then the photo.
 */
export function variantPath(path: string, meta: MediaMeta, variant: MediaVariant): string {
  const entry = meta[path];
  if (variant === 'thumb' && entry?.t) return thumbPathOf(path);
  if (variant !== 'full' && entry?.d) return displayPathOf(path);
  return path;
}

/** Width over height, when 0070 knows it. */
export function aspectOf(entry: MediaMetaEntry | undefined): number | undefined {
  return entry ? entry.w / entry.h : undefined;
}

/** One media item of a ripple: a photo by its storage path, or a video its words link to. */
export type RippleMediaItem = {
  rippleId: string;
  path: string;
  video?: YouTubeVideo;
  /** Its width over height when stored (0070), so a layout reserves its space before it loads. */
  aspect?: number;
};

/**
 * A ripple's media, as a card and the board read it (part 5): its photos in
 * the order they were added, then each YouTube video its words link to,
 * unless its author turned video previews off.
 */
export function rippleMedia(ripple: {
  id: string;
  media: string[];
  media_meta?: unknown;
  note: string | null;
  video_previews?: boolean;
}): RippleMediaItem[] {
  const meta = mediaMetaOf(ripple.media_meta);
  const photos = ripple.media.map((path) => {
    const aspect = aspectOf(meta[path]);
    return aspect ? { rippleId: ripple.id, path, aspect } : { rippleId: ripple.id, path };
  });
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
