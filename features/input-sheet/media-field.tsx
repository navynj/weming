'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';

import { downscale, isHeic } from '@/lib/downscale';
import { reportFailure } from '@/lib/report-failure';
import { MEDIA_BUCKET } from '@/lib/media-bucket';
import { createClient } from '@/lib/supabase/client';

import { QuietAffordance } from './annotation-control';

/**
 * Photos on a Ripple. Uploaded straight from the browser into the author's
 * own folder — the storage policy keys on that prefix, so a path is the only
 * thing that needs to be right.
 *
 * `ripples.media` holds **paths, never URLs**: a URL is a credential with an
 * expiry baked in, and storing one would mean the row rots. The detail sheet
 * signs them on demand instead.
 *
 * Two pieces, because the mockup puts them apart: the `+ Add Image` pill sits
 * under the note field and the thumbnails preview above the commit row.
 */
export function useMediaAttach(paths: string[], onChange: (next: string[]) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Local previews for what was just picked; a path from an edit has none
  // and shows as a tile until the detail sheet signs it.
  const [previews, setPreviews] = useState<Record<string, string>>({});

  async function attach(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    setBusy(true);
    setFailed(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFailed('You are signed out. Sign in again to attach a photo.');
        return;
      }

      const added: string[] = [];
      const seen: Record<string, string> = {};
      const refused: string[] = [];
      // Each photo on its own: one that fails says why and the rest still go.
      for (const file of Array.from(files)) {
        const shrunk = await downscale(file);
        if (isHeic(shrunk)) {
          reportFailure('upload', 'a HEIC the decoder could not read');
          refused.push(`${file.name}: ${HEIC_UNREADABLE}`);
          continue;
        }
        const path = mediaKey(user.id, shrunk.type);
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, shrunk, {
          contentType: shrunk.type,
          upsert: false,
        });
        if (error) {
          // Storage's own words, scrubbed of paths and names: never the photo.
          reportFailure('upload', error);
          refused.push(`${file.name}: ${uploadFailure(error)}`);
          continue;
        }
        added.push(path);
        seen[path] = URL.createObjectURL(shrunk);
      }
      setPreviews((current) => ({ ...current, ...seen }));
      if (added.length > 0) onChange([...paths, ...added]);
      if (refused.length > 0) setFailed(refused.join('\n'));
    } catch (thrown) {
      reportFailure('upload', thrown);
      setFailed(
        `That photo would not upload: ${thrown instanceof Error ? uploadFailure(thrown) : 'no reason given.'}`,
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return { input, busy, failed, previews, attach };
}

// Only when even the decoder could not read it (lib/heic.ts): a rare HEIC variant.
const HEIC_UNREADABLE = 'this HEIC photo could not be read. Save it as a JPEG and try again.';

/** The type's extension, for a key that is never the file's own name. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/**
 * Where a photo is stored: my folder, a fresh id, the type's extension. Never
 * the file's own name: Storage refuses a key with characters outside its
 * set, so a Korean file name (a KakaoTalk save, a screenshot) failed with
 * "Invalid key" (review: a friend could not attach a photo).
 */
export function mediaKey(userId: string, type: string): string {
  return `${userId}/${crypto.randomUUID()}.${EXTENSIONS[type] ?? 'img'}`;
}

/** Why an upload failed, in words a person can act on; never silent. */
export function uploadFailure(error: { message?: string; statusCode?: string | number }): string {
  const message = error.message ?? '';
  const status = String(error.statusCode ?? '');
  if (status === '413' || /maximum allowed size|too large|payload/i.test(message)) {
    return 'it is too large to upload (50MB at most).';
  }
  if (status === '401' || status === '403' || /row-level security|jwt|unauthori/i.test(message)) {
    return 'you are signed out. Sign in again, then add it.';
  }
  if (/failed to fetch|network|load failed|timed? ?out/i.test(message)) {
    return 'it could not reach the server. Check the connection and try again.';
  }
  return `it would not upload (${message || 'no reason given'}).`;
}

export function AddImageAffordance({
  attach,
  busy,
  input,
}: Pick<ReturnType<typeof useMediaAttach>, 'attach' | 'busy' | 'input'>) {
  return (
    <>
      <QuietAffordance
        onClick={() => input.current?.click()}
        label={busy ? 'Adding…' : '+ Add Image'}
        disabled={busy}
      />
      {/* Camera or gallery: the phone offers both for an image input. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-media-input
        onChange={(event) => attach(event.target.files)}
      />
    </>
  );
}

export function MediaPreviews({
  paths,
  previews,
  failed,
  onChange,
}: {
  paths: string[];
  previews: Record<string, string>;
  failed: string | null;
  onChange: (next: string[]) => void;
}) {
  if (paths.length === 0 && !failed) return null;

  return (
    <div className="flex flex-col gap-2">
      {paths.length > 0 ? (
        <ul data-media-previews className="flex gap-2 overflow-x-auto">
          {paths.map((path) => (
            <li
              key={path}
              className="bg-pool-100 relative h-16 w-16 shrink-0 overflow-hidden rounded-lg"
            >
              {previews[path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[path]} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-pool-500 block truncate px-1 pt-5 text-center text-[10px]">
                  {path.split('/').pop()}
                </span>
              )}
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => onChange(paths.filter((p) => p !== path))}
                className="text-ink absolute top-1 right-1 rounded-full bg-white/80 p-0.5"
              >
                <X aria-hidden size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {failed ? (
        <p role="alert" className="text-ink text-xs whitespace-pre-line">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
