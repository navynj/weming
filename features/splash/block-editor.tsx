'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';

import { videosIn } from '@/lib/youtube';
import {
  AddImageAffordance,
  MediaPreviews,
  useMediaAttach,
} from '@/features/input-sheet/media-field';
import type { MediaMeta } from '@/lib/ripple-media';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import type { IsoDate } from '@/lib/time';

import { blockDay, defaultBlockDay, isRange } from './block-day';
import { DayChip } from './day-chip';
import type { DateRange } from './summary';

export type EditorTarget =
  { kind: 'edit'; block: RippleWithSplash; locked: boolean } | { kind: 'add'; splashId: string };

/** What the editor hands back: the block's words and photos, with a fresh id when it is new. */
export type BlockDraft = {
  id: string;
  note: string;
  media: string[];
  /** Sizes of the photos added in this edit (0070). */
  mediaMeta: MediaMeta;
  /** Its own day, on a range splash only (0031); absent elsewhere. */
  occurredOn?: IsoDate;
  /** Its YouTube links drawn as videos (part 5); absent when it links none. */
  videoPreviews?: boolean;
};

/**
 * A block, edited in place on the post's page (SPEC 5, H21): blog-editor
 * style, no sheet. The cursor goes into the words; `+ Add Image`, the lock
 * toggle and Delete sit beneath them; Cancel and Save close it. A block has
 * no lane of its own to choose (H24): it takes its post's. On a post with a
 * range it has a day chip — the range's days only, no time (0031).
 *
 * The editor only describes the change; the page applies it optimistically
 * and runs the action (CLAUDE.md, the principle).
 */
export function BlockEditor({
  target,
  range = null,
  today,
  onSubmit,
  onDelete,
  onLock,
  onCancel,
}: {
  target: EditorTarget;
  /** The post's range: a day chip when it spans more than a day (0031). */
  range?: DateRange | null;
  today: IsoDate;
  onSubmit: (draft: BlockDraft) => void;
  onDelete: () => void;
  onLock: (locked: boolean) => void;
  onCancel: () => void;
}) {
  const editing = target.kind === 'edit' ? target.block : null;
  const [note, setNote] = useState(editing?.note ?? '');
  const [media, setMedia] = useState<string[]>(editing?.media ?? []);
  // Its day: the one it has inside the range, else today's or the last.
  const [day, setDay] = useState<IsoDate | null>(() =>
    isRange(range)
      ? editing
        ? blockDay(editing.occurred_on, range)
        : defaultBlockDay(range, today)
      : null,
  );
  const [locked, setLocked] = useState(target.kind === 'edit' ? target.locked : false);
  // Show video previews (part 5): on unless its author turned them off.
  const [previews, setPreviews] = useState(editing?.video_previews !== false);
  const linksVideos = videosIn(note).length > 0;
  const [confirming, setConfirming] = useState(false);
  const attach = useMediaAttach(media, setMedia);
  const field = useRef<HTMLTextAreaElement>(null);

  // The words grow the field; the field never scrolls inside the page.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [note]);

  const hasContent = note.trim().length > 0 || media.length > 0;

  function submit(): void {
    onSubmit({
      id: editing?.id ?? crypto.randomUUID(),
      note,
      media,
      mediaMeta: attach.meta,
      ...(day ? { occurredOn: day } : {}),
      ...(linksVideos ? { videoPreviews: previews } : {}),
    });
  }

  return (
    <div data-block-editor={editing?.id ?? 'new'} className="flex flex-col gap-3 py-2">
      <textarea
        ref={field}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Drop your words here"
        rows={3}
        autoFocus
        aria-label="Block"
        data-block-field
        className="text-ink placeholder:text-ink min-h-20 w-full resize-none overflow-hidden text-[15px]/[1.65] outline-none placeholder:opacity-20"
      />

      <div className="flex flex-wrap items-center gap-2">
        {day && isRange(range) ? <DayChip range={range} value={day} onChange={setDay} /> : null}
        <AddImageAffordance
          attach={attach.attach}
          busy={attach.busy}
          input={attach.input}
          progress={attach.progress}
        />
      </div>

      <MediaPreviews
        paths={media}
        previews={attach.previews}
        failed={attach.failed}
        onChange={setMedia}
      />

      {linksVideos ? (
        // Its links as players, or left as links (part 5); saved with Save.
        <button
          type="button"
          role="switch"
          aria-checked={previews}
          data-video-previews
          onClick={() => setPreviews((on) => !on)}
          className="text-pool-500 flex items-center gap-2 self-start text-sm"
        >
          <span
            className={`flex h-4 w-7 items-center rounded-full p-0.5 ${previews ? 'bg-ink justify-end' : 'bg-pool-200 justify-start'}`}
          >
            <span className="h-3 w-3 rounded-full bg-white" />
          </span>
          Show video previews
        </button>
      ) : null}

      <div className="flex items-center gap-3 text-sm">
        {editing ? (
          <>
            {/* Everyone / Only me: one spectrum, and the lock is one end of
                it (C8). It lives beside the block, where it is edited (H21). */}
            <button
              type="button"
              aria-pressed={locked}
              onClick={() => {
                const next = !locked;
                setLocked(next);
                onLock(next);
              }}
              className="text-pool-500 flex items-center gap-1"
            >
              {locked ? <Lock aria-hidden size={13} /> : <Unlock aria-hidden size={13} />}
              {locked ? 'Only me' : 'Everyone'}
            </button>

            {confirming ? (
              <span className="flex items-center gap-2">
                <span className="text-pool-500">Deletes this block</span>
                <button type="button" onClick={onDelete} className="text-main-900 font-medium">
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-pool-500"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="text-pool-500">
                Delete
              </button>
            )}
          </>
        ) : null}

        <span className="flex-1" />

        <button type="button" onClick={onCancel} className="text-pool-500">
          Cancel
        </button>
        <button
          type="button"
          disabled={!hasContent}
          onClick={submit}
          className="bg-main-900 rounded-full px-4 py-1.5 font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
