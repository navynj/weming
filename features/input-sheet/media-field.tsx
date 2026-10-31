'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';

import { compressImage, type Compressed } from '@/lib/compress-image';
import type { MediaType } from '@/lib/media-bucket';
import { reportFailure } from '@/lib/report-failure';
import type { MediaMeta, MediaMetaEntry } from '@/lib/ripple-media';
import { putSigned } from '@/lib/storage/upload';

import { QuietAffordance } from './annotation-control';
import { requestMediaUploads } from './upload-actions';

/**
 * Photos on a Ripple. Each is made ready on the phone first (lib/compress-
 * image: at most 1600px, WebP, no metadata, a 1024px display copy and a
 * 400px thumbnail), then
 * sent with a PUT to URLs the server issued for a path it minted in my own
 * folder (`requestMediaUploads`) — the browser never names where its bytes go.
 *
 * `ripples.media` holds **paths, never URLs**: a URL is a credential with an
 * expiry baked in, and storing one would mean the row rots. The detail sheet
 * signs them on demand instead. Each new photo's size rides along in `meta`
 * (0070), for the action to store beside the path.
 *
 * Two pieces, because the mockup puts them apart: the `+ Add Image` pill sits
 * under the note field and the thumbnails preview above the commit row.
 */
export function useMediaAttach(paths: string[], onChange: (next: string[]) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // What is going up now, by its size once made ready ("412 KB").
  const [progress, setProgress] = useState<string | null>(null);
  // Local previews for what was just picked; a path from an edit has none
  // and shows as a tile until the detail sheet signs it.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<MediaMeta>({});

  async function attach(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    setBusy(true);
    setFailed(null);

    try {
      const added: string[] = [];
      const seen: Record<string, string> = {};
      const sized: MediaMeta = {};
      const refused: string[] = [];
      // Each photo on its own: one that fails says why and the rest still go.
      for (const file of Array.from(files)) {
        const ready = await compressImage(file);
        if ('refused' in ready) {
          reportFailure('upload', ready.refused);
          refused.push(`${file.name}: ${ready.refused}`);
          continue;
        }
        setProgress(`Adding… ${formatBytes(bytesOf(ready))}`);
        const sent = await send(ready);
        if ('error' in sent) {
          // Storage's own words, scrubbed of paths and names: never the photo.
          reportFailure('upload', sent.error);
          refused.push(`${file.name}: ${uploadFailure(sent.error)}`);
          continue;
        }
        added.push(sent.path);
        sized[sent.path] = sent.entry;
        seen[sent.path] = URL.createObjectURL(ready.full.blob);
      }
      setPreviews((current) => ({ ...current, ...seen }));
      setMeta((current) => ({ ...current, ...sized }));
      if (added.length > 0) onChange([...paths, ...added]);
      if (refused.length > 0) setFailed(refused.join('\n'));
    } catch (thrown) {
      reportFailure('upload', thrown);
      setFailed(
        `That photo would not upload: ${thrown instanceof Error ? uploadFailure(thrown) : 'no reason given.'}`,
      );
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  return { input, busy, failed, previews, attach, meta, progress };
}

type UploadError = { message?: string; statusCode?: string | number };

/** One photo up: its URLs asked for, its bytes sent, its display copy and thumbnail beside it. */
async function send(
  ready: Compressed,
): Promise<{ path: string; entry: MediaMetaEntry } | { error: UploadError }> {
  const asked = await requestMediaUploads([
    {
      type: ready.full.blob.type as MediaType,
      display: ready.display !== null,
      thumb: ready.thumb !== null,
    },
  ]);
  if (!asked.ok) return { error: { message: asked.message } };
  const [issued] = asked.uploads;
  const refused = await putSigned(issued.upload, ready.full.blob);
  if (refused) return { error: refused };
  const entry: MediaMetaEntry = { ...ready.full.size };
  // A display copy that would not go up is not a failed photo: without one,
  // the photo is its own display image, as an older photo is.
  // Nor is a thumbnail: a board then loads the display copy, or the photo.
  const [displayRefused, thumbRefused] = await Promise.all([
    ready.display && issued.display ? putSigned(issued.display, ready.display.blob) : undefined,
    ready.thumb && issued.thumb ? putSigned(issued.thumb, ready.thumb.blob) : undefined,
  ]);
  if (ready.display && displayRefused === null) entry.d = ready.display.size;
  else if (displayRefused) reportFailure('upload', displayRefused);
  if (ready.thumb && thumbRefused === null) entry.t = ready.thumb.size;
  else if (thumbRefused) reportFailure('upload', thumbRefused);
  return { path: issued.path, entry };
}

function bytesOf(ready: Compressed): number {
  return ready.full.blob.size + (ready.display?.blob.size ?? 0) + (ready.thumb?.blob.size ?? 0);
}

/** A size as the composer says it: KB below a megabyte, MB with one decimal above. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  progress,
}: Pick<ReturnType<typeof useMediaAttach>, 'attach' | 'busy' | 'input'> & {
  /** The size going up now, once the photo is made ready. */
  progress?: string | null;
}) {
  return (
    <>
      <QuietAffordance
        onClick={() => input.current?.click()}
        label={busy ? (progress ?? 'Adding…') : '+ Add Image'}
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
