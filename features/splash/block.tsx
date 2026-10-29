'use client';

import { VideoPlayer } from '@/components/ui/video-media';
import { videosIn } from '@/lib/youtube';
import { DurationChip } from '@/components/ui/chips/duration-chip';
import { annotationLabel, draftFrom } from '@/features/input-sheet/draft';
import { dayOf } from '@/lib/flow-key';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { rippleDurationMinutes, rippleKind } from '@/lib/ripple-kind';
import { mediaMetaOf } from '@/lib/ripple-media';
import type { IsoDate } from '@/lib/time';

import { blockDay, isRange } from './block-day';
import type { DateRange } from './summary';
import { LinkedText } from '@/components/ui/linked-text';

/** `Aug 17`, from an ISO date. */
export function shortDay(date: IsoDate): string {
  const at = new Date(`${date}T00:00:00Z`);
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * A block, read (SPEC 5, H21): a small muted date label — where it rests,
 * with its clock when it has one — then the body at reading size, then its
 * photos at full content width. No avatar, no card; tapping it edits it.
 */
export function BlockView({
  block,
  range = null,
  photos,
  timeZone,
  today,
  onEdit,
  clock = null,
}: {
  block: RippleWithSplash;
  /** Its post's range: inside one, the block reads by its own day (0031). */
  range?: DateRange | null;
  photos: (string | null)[];
  timeZone: string;
  today: IsoDate;
  /** Absent: read-only — another member's ripple in a pool (review). */
  onEdit?: () => void;
  /** In a pool (0013): when it was written, mine, and the author's when our zones differ. */
  clock?: { mine: string; theirs: string | null } | null;
}) {
  const kind = rippleKind(block, timeZone);
  const annotation = draftFrom(block, timeZone).annotation;
  // The photos line up with its paths only when every one came back signed.
  const meta = mediaMetaOf(block.media_meta);
  const sizeAt = (index: number) =>
    photos.length === block.media.length ? meta[block.media[index]] : undefined;
  // Inside a range, its day and nothing else (0031); elsewhere what an older
  // block carries, frozen (H24), read back as it was.
  const label = isRange(range)
    ? shortDay(blockDay(block.occurred_on, range)!)
    : annotation
      ? annotation.time || annotation.endDate
        ? `${shortDay(annotation.date)} · ${annotationLabel(annotation, today)}`
        : shortDay(annotation.date)
      : shortDay(dayOf(block, timeZone));

  const body = (
    <>
      <span className="text-pool-500 flex items-center gap-2 text-[11px] tabular-nums">
        <span data-block-date>{label}</span>
        {clock ? <span data-block-clock>· {clock.mine}</span> : null}
        {clock?.theirs ? (
          <span data-author-clock className="opacity-70">
            · {clock.theirs}
          </span>
        ) : null}
        {kind === 'timed' ? (
          <DurationChip minutes={rippleDurationMinutes(block, timeZone)} />
        ) : null}
      </span>

      {block.note ? (
        <p data-block-body className="text-ink text-[15px]/[1.65] whitespace-pre-wrap">
          <LinkedText text={block.note} />
        </p>
      ) : null}

      {photos.map((url, index) => {
        const size = sizeAt(index);
        return url ? (
          // Its stored size (0070) holds its place before it loads.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt=""
            data-photo
            width={size?.w}
            height={size?.h}
            className="h-auto w-full rounded-xl object-contain"
          />
        ) : (
          <span
            key={index}
            aria-hidden
            data-photo-placeholder
            className="bg-pool-100 block aspect-[4/3] w-full rounded-xl"
            style={size ? { aspectRatio: `${size.w} / ${size.h}` } : undefined}
          />
        );
      })}
    </>
  );
  // Its YouTube links as players (part 5), after its photos; outside the
  // edit tap, so play never opens the editor. Off when its author said so.
  const videos =
    block.video_previews === false
      ? []
      : videosIn(block.note).map((video) => <VideoPlayer key={video.id} video={video} />);
  if (!onEdit) {
    return (
      <div data-block={block.id} data-read-only className="flex w-full flex-col items-start gap-2">
        {body}
        {videos}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col items-start gap-2">
      <button
        type="button"
        data-block={block.id}
        onClick={onEdit}
        aria-label="Edit this block"
        className="flex w-full flex-col items-start gap-2 text-left"
      >
        {body}
      </button>
      {videos}
    </div>
  );
}
