'use client';

import type { CSSProperties } from 'react';

import {
  postIcon,
  laneOfCard,
  type Card,
  type CardFace,
  type GridColumn,
} from '@/features/home/grid';
import { Avatar } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';
import type { SignedMedia } from '@/lib/media';

import {
  captionOf,
  STICKER_LARGE,
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
   * The stack is heading to this post (review): it bobs on its water, which
   * swells, once per value — the ring's counterpart on the board.
   */
  ripple: number | null;
};

/** The motion a piece plays: a bob for the heading, a plunge for a drop. */
function motionOf(ripple: number | null, plunge: boolean): string {
  if (plunge) return 'board-plunge';
  if (ripple !== null) return 'board-bob';
  return '';
}

function placed(box: { x: number; y: number; w: number; h: number }): CSSProperties {
  return { left: box.x, top: box.y, width: box.w, height: box.h };
}

/** The words' colour and the fill beneath them. */
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
/** Faces as the board draws them: 16px at 12px initials, so they hold the 10px floor. */
const FACE_CLASS =
  'text-main-900/60 flex h-4 w-4 items-center justify-center rounded-full bg-[#8283EE] text-xs ring-1';

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
 * branches' authors, else me — on Home the one author always known.
 */
function Faces({ card, ring }: { card: Card; ring: string }) {
  const { me } = usePeople();
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
    <span data-board-faces className="ml-1 inline-flex translate-y-0.5 align-baseline">
      <FaceStack faces={faces} ring={ring} />
    </span>
  );
}

/**
 * An open joint splash's empty slot (meaning is shape): a small tilted tape
 * piece with a dashed white outline, to the label's right, holding the
 * faded faces of the current members who have not written. When I am one of them it reads "Add your side" — on a phone's
 * narrow column, the words are its label only — and opens the splash to
 * write my ripple; once everyone has written, the slot is gone.
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
  const height = narrow ? 20 : 24;
  const style: CSSProperties = {
    left: piece.labelBox.x + piece.labelBox.w + 4,
    top: piece.labelBox.y + piece.labelBox.h - height,
    height,
  };
  const body = (
    <>
      <FaceStack faces={awaiting} ring="ring-main-900" faded max={narrow ? 2 : 4} />
      {mine && !narrow ? (
        <span className="font-medium whitespace-nowrap">Add your side</span>
      ) : null}
    </>
  );
  const className =
    'absolute flex items-center gap-1.5 rounded-md border border-dashed border-white px-1.5 text-xs text-white';
  return mine ? (
    <button
      type="button"
      data-board-slot={piece.id}
      data-board-slot-mine
      aria-label={`Add your side to ${captionOf(piece.card)}`}
      onClick={() => onWrite(piece.card)}
      className={className}
      style={style}
    >
      {body}
    </button>
  ) : (
    <span data-board-slot={piece.id} className={className} style={style}>
      {body}
    </span>
  );
}

/**
 * One photo card: the lane wide and square, no frame, the image cropped to
 * fill it; standing on the photo area's bottom edge, a card behind peeking
 * above the one in front.
 */
function PhotoCardView({
  photo,
  url,
  areaH,
  more,
  size,
}: {
  photo: PhotoCard;
  url: string | null | undefined;
  areaH: number;
  more: number;
  size: number;
}) {
  return (
    <span
      data-board-photo-card
      className="absolute block"
      style={{ left: 0, top: areaH - photo.dy - size, width: size, height: size }}
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
 * A post on its day (Calendar view, the first mockup): a label the lane
 * wide, square and straight, flush at the lane's line or offset into it
 * and over the next, white or ink. With photos, up to three square cards
 * sit above it, the caption directly under with no fill, the icon small
 * before the words; without, the icon is a large sticker centred on a top
 * corner of the label, or small before the words.
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
  /** Just dropped: it plunges in, its water splashing. */
  plunge: boolean;
}) {
  const { card } = piece;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  const pictured = piece.variant === 'photo';
  const top = piece.fan.length - 1;
  const label = piece.labelBox;
  const filled = piece.label !== 'none';
  const motion = motionOf(ripple, plunge);
  // A large sticker is centred on the label's top corner: half over the
  // label, half over whatever is above and beside it.
  const large = piece.sticker?.size === 'large' ? piece.sticker : null;
  const stickerPx = Math.round(label.h * STICKER_LARGE);
  const stickerStyle: CSSProperties = large
    ? {
        left: (large.corner === 'tl' ? label.x : label.x + label.w) - stickerPx / 2,
        top: label.y - stickerPx / 2,
        width: stickerPx,
        height: stickerPx,
        fontSize: stickerPx,
      }
    : {};
  const inlineIcon = pictured || piece.sticker?.size === 'small';
  return (
    <div
      // Remounted per ring, so the motion plays again for the same post.
      key={`${ripple ?? 'still'}:${plunge ? 'drop' : ''}`}
      data-board-piece={piece.id}
      data-board-day={piece.day}
      data-variant={piece.variant}
      data-label={piece.label}
      data-placement={piece.placement}
      data-sticker={piece.sticker?.size}
      data-heading={ripple !== null ? '' : undefined}
      data-dropped={plunge ? '' : undefined}
      // An offset piece overhangs the next lane: above its separator and its items (review).
      className={`absolute ${piece.placement === 'offset' ? 'z-10' : ''} ${motion}`}
      style={placed(piece)}
    >
      {/* The piece is the tap that brings its card up; the slot beside it is a tap of its own. */}
      <button
        type="button"
        onClick={() => onPick(card.splash.id)}
        aria-label={caption}
        data-board-pick={piece.id}
        className="absolute inset-0 block text-left"
      >
        {piece.photoBox ? (
          <span
            data-board-photos
            className="absolute block"
            style={{
              left: piece.photoBox.x,
              top: piece.photoBox.y,
              width: piece.photoBox.w,
              height: piece.photoBox.h,
            }}
          >
            {piece.fan.map((photo, at) => (
              <PhotoCardView
                key={photo.path}
                photo={photo}
                url={photos[photo.path]}
                areaH={piece.photoBox!.h}
                more={at === top ? piece.morePhotos : 0}
                size={piece.photoBox!.w}
              />
            ))}
          </span>
        ) : null}
        <span
          data-board-label
          className={`absolute block ${LABEL_CLASS[piece.label]}`}
          style={{
            left: label.x,
            top: label.y,
            width: label.w,
            height: label.h,
            paddingTop: metrics.labelPadY,
            paddingLeft: filled ? metrics.labelPadX : 4,
            paddingRight: filled ? metrics.labelPadX : 4,
          }}
        >
          <span
            className="line-clamp-3 block font-medium break-words"
            style={{ fontSize: metrics.caption.size, lineHeight: `${metrics.caption.line}px` }}
          >
            {inlineIcon && icon ? (
              <span aria-hidden data-board-icon className="mr-1">
                {icon}
              </span>
            ) : null}
            {caption}
            {card.joint ? <Faces card={card} ring={FACE_RING[piece.label]} /> : null}
          </span>
        </span>
        {large && icon ? (
          <span
            aria-hidden
            data-board-sticker
            data-corner={large.corner}
            // Above every label, its own and the next lane's: a sticker is never covered (review).
            className="absolute z-20 flex items-center justify-center leading-none"
            style={stickerStyle}
          >
            {icon}
          </span>
        ) : null}
      </button>
      {piece.slot ? <OpenSlot piece={piece} narrow={metrics.narrow} onWrite={onWrite} /> : null}
    </div>
  );
}

/**
 * A ranged post's band across its days in one row (review): translucent
 * white, the full width of its lanes, square.
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
  const motion = motionOf(ripple, false);
  return (
    <div
      key={ripple ?? 'still'}
      data-board-tape={tape.id}
      data-board-week={tape.week}
      data-starts-here={tape.startsHere ? '' : undefined}
      data-ends-here={tape.endsHere ? '' : undefined}
      data-heading={ripple !== null ? '' : undefined}
      className={`absolute ${motion}`}
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
