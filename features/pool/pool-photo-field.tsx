'use client';

import { useRef, useState } from 'react';

import { Monogram } from '@/components/ui/monogram';
import {
  AVATAR_ACCEPT,
  decodePhoto,
  encodeAvatar,
  sourceRect,
  type CropView,
} from '@/features/people/crop';
import { CropFrame, FRAME_PX } from '@/features/people/crop-frame';
import { POOL_PHOTO_BUCKET } from '@/lib/pool-photo-bucket';
import { createClient } from '@/lib/supabase/client';

import { setPoolPhoto } from './actions';

/** What the field holds: the photo as it is, gone, or a new one being cropped. */
export type PoolPhotoChange =
  { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; image: HTMLImageElement; view: CropView };

/**
 * A pool's photo (0024), chosen like a profile photo: tap the tile to pick
 * (JPEG, PNG, WebP, HEIC), crop it square, and it is drawn into a 512px WebP
 * when saved. The tile is the pool's rounded square, the letters until a
 * photo. "Remove photo" goes back to the letters. A file the browser cannot
 * decode says so instead of failing silently.
 */
export function PoolPhotoField({
  name,
  current,
  change,
  onChange,
}: {
  name: string;
  /** The photo now (a signed URL), or null for the letters. */
  current: string | null;
  change: PoolPhotoChange;
  onChange: (change: PoolPhotoChange) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const has = change.kind === 'new' || (change.kind === 'keep' && current !== null);

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setMessage(null);
    try {
      onChange({ kind: 'new', image: await decodePhoto(file), view: { zoom: 1, x: 0, y: 0 } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (picker.current) picker.current.value = '';
    }
  }

  return (
    <div data-pool-photo-field className="flex flex-col gap-3">
      <input
        ref={picker}
        type="file"
        accept={AVATAR_ACCEPT}
        data-pool-photo-input
        className="hidden"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      {change.kind === 'new' ? (
        <CropFrame
          image={change.image}
          view={change.view}
          shape="square"
          onChange={(view) => onChange({ ...change, view })}
        />
      ) : (
        <button
          type="button"
          aria-label="Choose a photo for the Pool"
          data-pool-photo-pick
          onClick={() => picker.current?.click()}
          className="flex w-fit rounded-2xl"
        >
          <Monogram name={name} size="tile" photo={change.kind === 'keep' ? current : null} />
        </button>
      )}
      <div className="flex items-center gap-4 text-sm">
        <button
          type="button"
          data-pool-photo-change
          onClick={() => picker.current?.click()}
          className="text-main-900 font-medium"
        >
          {change.kind === 'new' ? 'Choose another' : has ? 'Change photo' : 'Add photo'}
        </button>
        {has ? (
          <button
            type="button"
            data-pool-photo-remove
            onClick={() => onChange(current ? { kind: 'remove' } : { kind: 'keep' })}
            className="text-pool-500"
          >
            Remove photo
          </button>
        ) : null}
      </div>
      {message ? (
        <p role="alert" data-pool-photo-message className="text-ink text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Saves a pool's photo change (0024), creator only: the bytes go up from the
 * browser to the pool's one file, then the row names the new version; a
 * removal deletes the file and clears the row. Returns null when done, else
 * why not — never throws.
 */
export async function savePoolPhoto(
  poolId: string,
  change: PoolPhotoChange,
): Promise<string | null> {
  if (change.kind === 'keep') return null;
  try {
    return await uploadPoolPhoto(poolId, change);
  } catch (error) {
    // A dropped connection throws rather than returning an error.
    return error instanceof Error ? error.message : String(error);
  }
}

async function uploadPoolPhoto(
  poolId: string,
  change: Exclude<PoolPhotoChange, { kind: 'keep' }>,
): Promise<string | null> {
  const storage = createClient().storage.from(POOL_PHOTO_BUCKET);
  if (change.kind === 'remove') {
    const { error } = await storage.remove([poolId]);
    if (error) return error.message;
    const done = await setPoolPhoto(poolId, false);
    return done.ok ? null : done.message;
  }
  const size = { width: change.image.naturalWidth, height: change.image.naturalHeight };
  const blob = await encodeAvatar(change.image, sourceRect(change.view, size, FRAME_PX));
  const { error } = await storage.upload(poolId, blob, {
    contentType: blob.type,
    upsert: true,
    cacheControl: '86400',
  });
  if (error) return error.message;
  const done = await setPoolPhoto(poolId, true);
  return done.ok ? null : done.message;
}

/** A local preview of a change, for a screen that shows it before the re-read. */
export function previewOf(change: PoolPhotoChange, current: string | null): string | null {
  if (change.kind === 'remove') return null;
  if (change.kind === 'keep') return current;
  return change.image.src;
}
