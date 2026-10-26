'use client';

import type { CSSProperties } from 'react';

import {
  postIcon,
  laneOfCard,
  type Card,
  type CardFace,
  type GridColumn,
} from '@/features/home/grid';
import { Monogram } from '@/components/ui/monogram';
import { Avatar } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';
import type { SignedMedia } from '@/lib/media';

import {
  captionOf,
  type Box,
  type BoardMetrics,
  type BoardPiece,
  type BoardTape,
  type LabelStyle,
  type PhotoCard,
} from './layout';

type Lanes = Pick<GridColumn, 'id' | 'icon' | 'name'>[];

/** What a piece needs besides its place: the lanes its icon falls back to, the sizes, and what a tap does. */
type Shared = {
  lanes: Lanes;
  /** The sizes that follow the board's width. */
  metrics: BoardMetrics;
  /** Brings the post's card to the top of the stack, as a mark does in the Lane view. */
  onPick: (id: string) => void;
  /**
   * The stack is heading to this post (review): it bobs on the water, once
   * per value — the ring's counterpart on the calendar.
   */
  ripple: number | null;
};

/** The motion a piece plays: a bob for the heading, a plunge for a drop. */
function motionOf(ripple: number | null, plunge: boolean): string {
  if (plunge) return 'board-plunge';
  if (ripple !== null) return 'board-bob';
  return '';
}

function placed(box: Box): CSSProperties {
  return { left: box.x, top: box.y, width: box.w, height: box.h };
}

/** The words' colour and the fill beneath them: none, unless the splash is joint (review). */
const LABEL_CLASS: Record<LabelStyle, string> = {
  none: 'text-white',
  white: 'bg-white text-main-900',
  ink: 'bg-ink text-white',
};
/** The faces' ring is the surface beneath them, so it parts them unseen. */
const FACE_RING: Record<LabelStyle, string> = {
  none: 'ring-main-900',
  white: 'ring-white',
  ink: 'ring-ink',
};
/** Faces as the calendar draws them: within the words' 13px line, at the 10px floor. */
const FACE_CLASS =
  'text-main-900/60 flex h-3 w-3 items-center justify-center overflow-hidden rounded-full bg-[#8283EE] text-[10px] leading-none ring-1';

function FaceStack({
  faces,
  ring,
  faded = false,
  max = 4,
}: {
  faces: CardFace[];
  ring: string;
  faded?: boolean;
  max?: number;
}) {
  const more = faces.length - max;
  return (
    <span className={`inline-flex items-center ${faded ? 'opacity-50' : ''}`}>
      {faces.slice(0, max).map((face, at) => (
        <Avatar
          key={face.authorId}
          id={face.authorId}
          initials={face.initials}
          className={`${FACE_CLASS} ${ring} ${at > 0 ? '-ml-1' : ''}`}
        />
      ))}
      {more > 0 ? <span className="ml-0.5 text-[10px] text-white/80">+{more}</span> : null}
    </span>
  );
}

/**
 * A joint splash's writers, stacked after its caption, whatever the label's
 * style: who wrote on it, else (where the card carries no list) its
 * branches' authors, else me. On Home a pool's splash shows its pool's
 * monogram — its photo when set — in the faces' place instead (review):
 * Home says where a post lives; a pool says who wrote it.
 */
function Faces({ card, ring }: { card: Card; ring: string }) {
  const { me } = usePeople();
  const pool = card.pools?.[0];
  if (pool !== undefined) {
    return (
      <span data-board-pool className="ml-1 inline-flex h-[13px] items-center align-top">
        <Monogram name={pool} size="face" photo={card.poolPhoto ?? null} />
      </span>
    );
  }
  const faces: CardFace[] =
    card.writers ??
    (card.branches
      ? [
          ...new Map(
            card.branches.map((b) => [
              b.authorId ?? b.initials,
              { authorId: b.authorId ?? b.initials, initials: b.initials },
            ]),
          ).values(),
        ]
      : me
        ? [{ authorId: me, initials: '' }]
        : []);
  if (faces.length === 0) return null;
  return (
    <span data-board-faces className="ml-1 inline-flex h-[13px] items-center align-top">
      <FaceStack faces={faces} ring={ring} />
    </span>
  );
}

/**
 * An open joint splash's slot (review): a note stuck on the label after the
 * fact — a small rounded rectangle, dashed 1.5px white outline, no fill,
 * white at 80% — holding the faded faces of the current members who have
 * not written and "Add your side" ("Add" on a phone). It hangs from the
 * label's bottom-right corner (bottom-left where the next lane is taken),
 * tilted down about that corner, never over any words. When I am one of
 * the missing it opens the splash to write my ripple; for anyone else it
 * is only a mark.
 */
function OpenSlot({
  piece,
  narrow,
  onWrite,
}: {
  piece: BoardPiece;
  narrow: boolean;
  onWrite: (card: Card) => void;
}) {
  const { me } = usePeople();
  const awaiting = piece.card.awaiting ?? [];
  const mine = me !== null && awaiting.some((face) => face.authorId === me);
  const body = (
    <>
      {/* Faces first, 16px, overlapping by 4; then the words, never under a face. */}
      <span data-board-slot-faces className="flex shrink-0 items-center opacity-50">
        {awaiting.slice(0, narrow ? 2 : 4).map((face, at) => (
          <Avatar
            key={face.authorId}
            id={face.authorId}
            initials={face.initials}
            className={`text-main-900/60 ring-main-900 flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#8283EE] text-[10px] leading-none ring-1 ${at > 0 ? '-ml-1' : ''}`}
          />
        ))}
      </span>
      <span data-board-slot-words className="whitespace-nowrap">
        {narrow ? 'Add' : 'Add your side'}
      </span>
    </>
  );
  const box = piece.slotBox!;
  // Its content's own width: placed at its corner, as tall as its row.
  const style: CSSProperties = {
    left: box.x,
    top: box.y,
    transform: `rotate(${piece.slotRotate}deg)`,
    transformOrigin: piece.slotAt === 'right' ? 'top left' : 'top right',
  };
  const className =
    'absolute flex items-center gap-1 border-[1.5px] border-dashed border-white/80 px-[6px] py-[3px] text-[10px] leading-none text-white/80';
  return mine ? (
    <button
      type="button"
      data-board-slot={piece.id}
      data-board-slot-mine
      data-slot-at={piece.slotAt}
      aria-label={`Add your side to ${captionOf(piece.card)}`}
      onClick={() => onWrite(piece.card)}
      className={`pointer-events-auto ${className}`}
      style={style}
    >
      {body}
    </button>
  ) : (
    <span
      data-board-slot={piece.id}
      data-slot-at={piece.slotAt}
      className={className}
      style={style}
    >
      {body}
    </span>
  );
}

/**
 * One photo card: square, no frame, the image cropped to fill it; standing
 * on the photo area's bottom edge, a card behind peeking above the one in
 * front.
 */
function PhotoCardView({
  photo,
  url,
  area,
  more,
}: {
  photo: PhotoCard;
  url: string | null | undefined;
  area: Box;
  more: number;
}) {
  return (
    <span
      data-board-photo-card
      className="absolute block"
      style={{
        left: 0,
        top: area.h - photo.dy - Math.round(area.w),
        width: area.w,
        height: Math.round(area.w),
      }}
    >
      {url ? (
        // A signed URL for a few minutes: next/image would cache it past its life.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          data-board-photo
          className="block h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden data-board-photo-pending className="block h-full w-full bg-white/20" />
      )}
      {more > 0 ? (
        <span
          data-board-more-photos
          className="bg-ink absolute top-1 right-1 rounded-full px-1.5 text-xs/4 font-medium text-white"
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A post on its day (Calendar view, the mockup's three recipes): A, a
 * label shifted into its lane — over the next, where that is empty — its
 * icon small before the words; B, a label flush the lane wide, its large
 * sticker on the top-left corner; C, photos with the caption centred under
 * them, tucked into the padding above. Labels hug their words; nothing
 * ever covers them.
 */
export function BoardPieceView({
  piece,
  photos,
  lanes,
  metrics,
  onPick,
  onWrite,
  ripple,
  plunge,
}: Shared & {
  piece: BoardPiece;
  photos: SignedMedia;
  onWrite: (card: Card) => void;
  /** Just dropped: it plunges in. */
  plunge: boolean;
}) {
  const { card } = piece;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  const top = piece.fan.length - 1;
  const label = piece.labelBox;
  return (
    <div
      // Remounted per ring, so the motion plays again for the same post.
      key={`${ripple ?? 'still'}:${plunge ? 'drop' : ''}`}
      data-board-piece={piece.id}
      data-board-day={piece.day}
      data-variant={piece.variant}
      data-label={piece.label}
      data-recipe={piece.recipe}
      data-overhang={piece.overhang ? '' : undefined}
      data-heading={ripple !== null ? '' : undefined}
      data-dropped={plunge ? '' : undefined}
      data-muted={piece.muted ? '' : undefined}
      // A day of the month before or after: at half strength (review).
      className={`absolute ${piece.muted ? 'opacity-50' : ''} ${motionOf(ripple, plunge)}`}
      style={{ left: piece.x, top: piece.y, width: piece.w, height: piece.h }}
    >
      {/* The tap that brings its card up, under the drawing; the slot is a tap of its own. */}
      <button
        type="button"
        onClick={() => onPick(card.splash.id)}
        aria-label={caption}
        data-board-pick={piece.id}
        className="absolute inset-0 block"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {piece.photoBox ? (
          <span data-board-photos className="absolute block" style={placed(piece.photoBox)}>
            {piece.fan.map((photo, at) => (
              <PhotoCardView
                key={photo.path}
                photo={photo}
                url={photos[photo.path]}
                area={piece.photoBox!}
                more={at === top ? piece.morePhotos : 0}
              />
            ))}
          </span>
        ) : null}
        <span
          data-board-label
          className={`absolute block ${LABEL_CLASS[piece.label]}`}
          style={{
            ...placed(label),
            paddingTop: piece.pad.top,
            paddingRight: piece.pad.right,
            paddingBottom: piece.pad.bottom,
            paddingLeft: piece.pad.left,
          }}
        >
          <span
            data-board-text
            // Clamped to the lines its box was sized for (three at most), so the words never
            // spill into the padding a sticker hangs in (review: text is never covered).
            className={`block overflow-hidden font-medium break-words ${piece.center ? 'text-center' : ''}`}
            data-lines={piece.captionLines}
            style={{
              fontSize: metrics.caption.size,
              lineHeight: `${metrics.caption.line}px`,
              // A corner sticker's room, on the first line only (review).
              textIndent: piece.indent || undefined,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: piece.captionLines,
              maxHeight: piece.captionLines * metrics.caption.line,
            }}
          >
            {piece.inlineIcon && icon ? (
              // Held to the words' line, so it never stretches it (review).
              <span
                aria-hidden
                data-board-icon
                className="mr-1 inline-block h-[13px] align-top leading-[13px]"
              >
                {icon}
              </span>
            ) : null}
            {caption}
            {card.joint ? <Faces card={card} ring={FACE_RING[piece.label]} /> : null}
          </span>
        </span>
        {piece.stickerBox && icon ? (
          <span
            aria-hidden
            data-board-sticker
            data-size={piece.stickerSize ?? undefined}
            data-at={piece.stickerAt ?? undefined}
            className="absolute flex items-center justify-center leading-none"
            style={{ ...placed(piece.stickerBox), fontSize: piece.stickerBox.w }}
          >
            {icon}
          </span>
        ) : null}
      </div>
      {/* Its own tap, beside the drawing: outside the hidden layer, so it is announced. */}
      {piece.slotBox ? <OpenSlot piece={piece} narrow={metrics.narrow} onWrite={onWrite} /> : null}
    </div>
  );
}

/**
 * A ranged post's band across its days in one row (review): the full width
 * of its lanes, translucent white with no outline (review), at the top of
 * the row above the items.
 */
export function BoardTapeView({
  tape,
  lanes,
  metrics,
  onPick,
  ripple,
}: Shared & { tape: BoardTape }) {
  const { card } = tape;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  return (
    <div
      key={ripple ?? 'still'}
      data-board-tape={tape.id}
      data-board-week={tape.week}
      data-starts-here={tape.startsHere ? '' : undefined}
      data-ends-here={tape.endsHere ? '' : undefined}
      data-heading={ripple !== null ? '' : undefined}
      data-muted={tape.muted ? '' : undefined}
      className={`absolute ${tape.muted ? 'opacity-50' : ''} ${motionOf(ripple, false)}`}
      style={placed(tape)}
    >
      <button
        type="button"
        onClick={() => onPick(card.splash.id)}
        aria-label={caption}
        data-board-pick={tape.id}
        data-board-band
        className="absolute inset-0 flex items-center gap-1 bg-white/20 px-2 text-left font-medium text-white"
        style={{ fontSize: metrics.caption.size }}
      >
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span className="min-w-0 truncate">{caption}</span>
        {/* Over the band the water reads as the joint surface: the faces' ring takes it. */}
        {card.joint ? <Faces card={card} ring="ring-[#3739D4]" /> : null}
      </button>
    </div>
  );
}
