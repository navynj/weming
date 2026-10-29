'use client';

import { useRef, useState } from 'react';

import { COLUMN_MAX_WIDTH } from '@/components/ui/column';
import { initialsOf } from '@/features/home/grid';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { SHEET_MAX_HEIGHT } from '@/features/splash-sheet/splash-sheet';
import { AVATAR_BUCKET, avatarPath } from '@/lib/avatar-bucket';
import { createClient } from '@/lib/supabase/client';

import { saveProfile } from './actions';
import { AVATAR_ACCEPT, decodePhoto, encodeAvatar, sourceRect, type CropView } from './crop';
import { CropFrame, FRAME_PX } from './crop-frame';
import { displayName, NAME_MAX } from './name';
import { usePeople } from './people-provider';

/** How long my saved face overlays the server's before the re-read has surely landed. */
const SETTLE_MS = 2500;

type Photo =
  { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; image: HTMLImageElement; view: CropView };

/**
 * My profile (0018; 0059): from my face in the header, on Home or among a
 * pool's members — my photo and name alone; the theme is the gear's,
 * notifications the bell's. A bottom sheet, at every width.
 * Tap the large avatar to pick a photo, crop it square; "Remove photo" goes
 * back to initials; the name is 1–40 characters. Save shows the new face on
 * every surface at once and the upload and save run behind it; a refusal
 * takes it back and says why. The timezone is not shown here.
 */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { me, people, markMe, clearMe } = usePeople();
  const { dropFailed } = useInputSheet();
  const current = me ? people[me] : undefined;
  const [name, setName] = useState(current?.name ?? '');
  const [photo, setPhoto] = useState<Photo>({ kind: 'keep' });
  const [message, setMessage] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const nameOk = displayName.safeParse(name).success;
  const changed = name.trim() !== (current?.name ?? '') || photo.kind !== 'keep';
  const hasPhoto = photo.kind === 'new' || (photo.kind === 'keep' && Boolean(current?.photo));

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setMessage(null);
    try {
      const image = await decodePhoto(file);
      setPhoto({ kind: 'new', image, view: { zoom: 1, x: 0, y: 0 } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (picker.current) picker.current.value = '';
    }
  }

  async function save(): Promise<void> {
    if (!me) return;
    let blob: Blob | null = null;
    if (photo.kind === 'new') {
      const size = { width: photo.image.naturalWidth, height: photo.image.naturalHeight };
      try {
        blob = await encodeAvatar(photo.image, sourceRect(photo.view, size, FRAME_PX));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    const trimmed = name.trim();
    // Shown at once everywhere a face is drawn (CLAUDE.md, the principle).
    markMe({
      name: trimmed,
      photo: blob
        ? URL.createObjectURL(blob)
        : photo.kind === 'remove'
          ? null
          : (current?.photo ?? null),
    });
    onClose();

    const fail = (reason: string) => {
      clearMe();
      dropFailed(reason);
    };
    if (blob) {
      const { error } = await createClient()
        .storage.from(AVATAR_BUCKET)
        .upload(avatarPath(me), blob, {
          contentType: blob.type,
          upsert: true,
          cacheControl: '86400',
        });
      if (error) return fail(error.message);
    }
    const done = await saveProfile({
      name: trimmed,
      photo: blob ? 'uploaded' : photo.kind === 'remove' ? 'remove' : 'keep',
    });
    if (!done.ok) return fail(done.message);
    // saveProfile calls refresh(): the page came back with its answer.
    window.setTimeout(clearMe, SETTLE_MS);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-main-900/60 scrim-in absolute inset-0"
      />
      <section
        role="dialog"
        aria-label="Settings"
        data-profile-sheet
        data-settings-sheet
        className={`surface sheet-rise relative mx-auto flex w-full ${COLUMN_MAX_WIDTH} ${SHEET_MAX_HEIGHT} flex-col overflow-hidden rounded-t-[32px] bg-white`}
      >
        <div
          className="flex min-h-0 flex-col items-center gap-5 overflow-y-auto px-7 pt-8"
          style={{ paddingBottom: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <input
            ref={picker}
            type="file"
            accept={AVATAR_ACCEPT}
            data-avatar-input
            className="hidden"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          {photo.kind === 'new' ? (
            <CropFrame
              image={photo.image}
              view={photo.view}
              onChange={(view) => setPhoto({ ...photo, view })}
            />
          ) : (
            <button
              type="button"
              aria-label="Choose a photo"
              data-avatar-pick
              onClick={() => picker.current?.click()}
              className="bg-pool-100 text-pool-500 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full text-3xl font-medium"
            >
              {photo.kind === 'keep' && current?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsOf(name) || initialsOf(current?.name ?? '')
              )}
            </button>
          )}
          <div className="flex items-center gap-4 text-sm">
            <button
              type="button"
              data-avatar-change
              onClick={() => picker.current?.click()}
              className="text-main-900 font-medium"
            >
              {photo.kind === 'new' ? 'Choose another' : hasPhoto ? 'Change photo' : 'Add photo'}
            </button>
            {hasPhoto ? (
              <button
                type="button"
                data-avatar-remove
                onClick={() => setPhoto(current?.photo ? { kind: 'remove' } : { kind: 'keep' })}
                className="text-pool-500"
              >
                Remove photo
              </button>
            ) : null}
          </div>
          {message ? (
            <p role="alert" data-avatar-message className="text-ink text-center text-sm">
              {message}
            </p>
          ) : null}

          <label className="flex w-full flex-col gap-1">
            <span className="text-pool-500 text-xs">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={NAME_MAX + 10}
              aria-label="Name"
              data-profile-name
              className="text-ink bg-pool-100 rounded-xl px-3 py-2.5 text-base outline-none"
            />
            {nameOk ? null : (
              <span className="text-pool-500 text-xs">
                {displayName.safeParse(name).error?.issues[0].message}
              </span>
            )}
          </label>

          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={onClose}
              className="border-pool-200 text-ink flex-1 rounded-full border py-2.5 text-base font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              data-profile-save
              disabled={!changed || !nameOk}
              onClick={() => void save()}
              className="bg-main-900 flex-1 rounded-full py-2.5 text-base font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
