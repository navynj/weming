'use client';

// DORMANT (H21): the ripple detail half-sheet. The post's page is where a
// block is read and edited now, and the lock toggle lives in its block
// editor. Kept, compiling, for the dormant day rows the focus screen's world
// renders (H20b). Do not wire it back in; do not delete it.

import { useEffect, useState, useTransition } from 'react';
import { Lock, Pencil, Trash2, Unlock } from 'lucide-react';

import { DurationChip } from '@/components/ui/chips/duration-chip';
import { COLUMN_MAX_WIDTH } from '@/components/ui/column';
import { annotationLabel, draftFrom } from '@/features/input-sheet/draft';
import { signRippleMedia } from '@/lib/media';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { rippleDurationMinutes, rippleKind } from '@/lib/ripple-kind';
import type { IsoDate } from '@/lib/time';

import { deleteRipple, setRippleLock } from './actions';
import { LinkedText } from '@/components/ui/linked-text';

/**
 * The Ripple detail half-sheet (SPEC 6, H17): category · note, the
 * annotation, media, the board it belongs to, and the **lock toggle** — the
 * one place audience lives in P1 (H20g). Edit and Delete live here and
 * nowhere else.
 *
 * No view count — counting needs an audience, which arrives in P2. The
 * inner-ripple list that used to sit here is dormant with the live surfaces
 * (H20b).
 */
export function DetailSheet({
  ripple,
  locked,
  splashTitle,
  timeZone,
  today,
  onClose,
  onEdit,
}: {
  ripple: RippleWithSplash;
  locked: boolean;
  splashTitle: string | null;
  timeZone: string;
  today: IsoDate;
  onClose: () => void;
  onEdit: () => void;
}) {
  const kind = rippleKind(ripple, timeZone);
  const [confirming, setConfirming] = useState(false);
  const [isLocked, setIsLocked] = useState(locked);
  const [pending, startTransition] = useTransition();
  const [media, setMedia] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    // Signed on open, not stored: `ripples.media` holds paths, and a signed
    // URL is a short-lived credential rather than part of the record.
    signRippleMedia(ripple.id)
      .then((urls) => {
        if (live) setMedia(urls);
      })
      .catch((error: unknown) => console.error('[during] ripple media not signed', error));
    return () => {
      live = false;
    };
  }, [ripple.id]);

  const annotation = draftFrom(ripple, timeZone).annotation;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-ink/40 scrim-in absolute inset-0"
      />

      <section
        role="dialog"
        aria-label="Ripple"
        className={`sheet-rise relative mx-auto flex max-h-[82vh] w-full ${COLUMN_MAX_WIDTH} flex-col gap-4 overflow-y-auto rounded-t-3xl bg-white px-5 pt-5`}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-pool-500 flex flex-wrap items-center gap-2 text-xs">
              <span data-annotation>
                {annotation ? annotationLabel(annotation, today) : 'Posted'}
              </span>
              {splashTitle ? <span className="text-ink">· {splashTitle}</span> : null}
            </p>
            <p className="text-ink text-base">
              {ripple.note ? (
                <LinkedText text={ripple.note} />
              ) : (
                <span className="text-pool-500">No note</span>
              )}
            </p>
          </div>

          {kind === 'timed' && ripple.ended_at ? (
            <DurationChip minutes={rippleDurationMinutes(ripple, timeZone)} />
          ) : null}
        </header>

        {media.length > 0 ? (
          <ul className="flex gap-2 overflow-x-auto">
            {media.map((url) => (
              <li key={url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-32 w-auto rounded-lg object-cover" />
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="border-pool-200 flex items-center gap-3 border-t pt-3">
          <button
            type="button"
            onClick={onEdit}
            className="text-main-900 flex items-center gap-1.5 text-sm font-medium"
          >
            <Pencil aria-hidden size={14} />
            Edit
          </button>

          {/* Everyone / Only me: one spectrum, and the lock is one end of it
              (C8). It toggles here because this is where the record is read. */}
          <button
            type="button"
            aria-pressed={isLocked}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const next = !isLocked;
                const result = await setRippleLock(ripple.id, next);
                if (result.ok) setIsLocked(next);
              })
            }
            className="text-pool-500 flex items-center gap-1 text-sm disabled:opacity-50"
          >
            {isLocked ? <Lock aria-hidden size={13} /> : <Unlock aria-hidden size={13} />}
            {isLocked ? 'Only me' : 'Everyone'}
          </button>

          <span className="flex-1" />

          {confirming ? (
            <span className="flex items-center gap-3 text-sm">
              <span className="text-pool-500">Deletes this record</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteRipple(ripple.id);
                    onClose();
                  })
                }
                className="text-main-900 font-medium disabled:opacity-50"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-pool-500">
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-pool-500 flex items-center gap-1.5 text-sm"
            >
              <Trash2 aria-hidden size={14} />
              Delete
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
