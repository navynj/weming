'use client';

import { useState, type CSSProperties, type MouseEvent } from 'react';

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

import { splashShape } from './splash-shape';

import {
  captionOf,
  LABEL_OVERLAP_PX,
  LABEL_PAD_BOTTOM_PX,
  LABEL_PAD_TOP_PX,
  PHOTO_PAD_PX,
  SLOT_PX,
  type BoardMetrics,
  type BoardPiece,
  type PhotoCard,
  type BoardTape,
  type LabelStyle,
} from './layout';

type Lanes = Pick<GridColumn, 'id' | 'icon' | 'name'>[];

/** What a piece needs besides its place: the lanes its icon falls back to, and what a tap does. */
type Shared = {
  lanes: Lanes;
  /** The sizes that follow the board's width. */
  metrics: BoardMetrics;
  /** Brings the post's card to the top of the stack, as a mark does in the Lane view. */
  onPick: (id: string) => void;
  /** Swallows the click that ends a pan or a pinch, so moving the board never picks a post. */
  onClickCapture: (event: MouseEvent) => void;
};

function placed(box: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
}): CSSProperties {
  return {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    transform: `rotate(${box.rotate}deg)`,
  };
}

/** The words' colour; the fill is the splash drawn beneath them (`SplashLayer`). */
const LABEL_CLASS: Record<LabelStyle, string> = {
  none: 'text-white',
  white: 'text-main-900',
  ink: 'text-white',
};
/** The splash's fill, and its drops': the label's own colour, white drops for a label with none. */
const FILL_CLASS: Record<LabelStyle, string> = {
  none: 'fill-white',
  white: 'fill-white',
  ink: 'fill-ink',
};

type Box = { x: number; y: number; w: number; h: number };

/**
 * The splash a label or a photo fan sits in (review): thin rings beneath it,
 * one per ripple (three at most), white at 25%; two or three drops just
 * outside its edge; and for a filled label, the wobbling outline that is its
 * fill. Paths come from `splashShape`, once per splash. No shadow.
 */
function SplashLayer({
  id,
  box,
  style,
  ripples,
  outline,
}: {
  id: string;
  box: Box;
  style: LabelStyle;
  ripples: number;
  /** The label draws its blob; a photo fan only its rings and drops. */
  outline: boolean;
}) {
  const shape = splashShape(id, box.w, box.h, {
    filled: outline && style !== 'none',
    ripples,
  });
  return (
    <svg
      aria-hidden
      data-board-splash={id}
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w} ${box.h}`}
      className="pointer-events-none absolute overflow-visible"
      style={{ left: box.x, top: box.y }}
    >
      {shape.rings.map((ring, at) => (
        <ellipse
          key={at}
          data-board-ring
          cx={ring.cx}
          cy={ring.cy}
          rx={ring.rx}
          ry={ring.ry}
          className="fill-none stroke-white/25"
          strokeWidth={1}
        />
      ))}
      {shape.blob ? <path data-board-blob d={shape.blob} className={FILL_CLASS[style]} /> : null}
      {shape.droplets.map((drop, at) => (
        <circle
          key={at}
          data-board-droplet
          cx={drop.cx}
          cy={drop.cy}
          r={drop.r}
          className={FILL_CLASS[style]}
        />
      ))}
    </svg>
  );
}
/** The faces' ring is the surface beneath them, so it parts them unseen. */
const FACE_RING: Record<LabelStyle, string> = {
  none: 'ring-main-900',
  white: 'ring-white',
  ink: 'ring-ink',
};
const CAPTION_CLASS = 'line-clamp-2 text-xs/[15px] font-medium break-words';

/** Faces as the board draws them: 16px at 12px initials, so they hold the 10px floor zoomed out. */
const FACE_CLASS =
  'text-main-900/60 flex h-4 w-4 items-center justify-center rounded-full bg-[#8283EE] text-xs ring-1';

function FaceStack({
  faces,
  ring,
  faded = false,
}: {
  faces: CardFace[];
  ring: string;
  faded?: boolean;
}) {
  return (
    <span className={`inline-flex items-center ${faded ? 'opacity-50' : ''}`}>
      {faces.slice(0, 4).map((face, at) => (
        <Avatar
          key={face.authorId}
          id={face.authorId}
          initials={face.initials}
          className={`${FACE_CLASS} ${ring} ${at > 0 ? '-ml-1' : ''}`}
        />
      ))}
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
 * piece with a dashed white outline under the label, holding the faded faces
 * of the current members who have not written. When I am one of them it reads
 * "Add your side" and opens the splash to write my ripple; once everyone has
 * written, the card carries no one awaiting and the slot is gone.
 */
function OpenSlot({ piece, onWrite }: { piece: BoardPiece; onWrite: (card: Card) => void }) {
  const { me } = usePeople();
  const awaiting = piece.card.awaiting ?? [];
  const mine = me !== null && awaiting.some((face) => face.authorId === me);
  const style: CSSProperties = {
    top: piece.slotY!,
    left: piece.labelBox.x + 6,
    height: SLOT_PX,
    transform: `rotate(${-piece.rotate / 2 - 1.5}deg)`,
  };
  const body = (
    <>
      <FaceStack faces={awaiting} ring="ring-main-900" faded />
      {mine ? <span className="font-medium whitespace-nowrap">Add your side</span> : null}
    </>
  );
  const className =
    'absolute flex items-center gap-1.5 rounded-sm border border-dashed border-white px-1.5 text-xs text-white';
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

/** The clamp on a photo's shape: never narrower than 4:5 nor wider than 5:4. */
const RATIO_MIN = 4 / 5;
const RATIO_MAX = 5 / 4;

/**
 * One photo card: a white frame around its image, cropped to the image's own
 * aspect within 4:5 to 5:4 once it has loaded (square until then), standing
 * on the photo area's bottom edge.
 */
function PhotoCardView({
  photo,
  url,
  areaH,
  more,
  metrics,
}: {
  photo: PhotoCard;
  url: string | null | undefined;
  areaH: number;
  more: number;
  metrics: BoardMetrics;
}) {
  const [ratio, setRatio] = useState(1);
  const innerW = metrics.photoW - PHOTO_PAD_PX * 2;
  const innerH = metrics.photoH - PHOTO_PAD_PX * 2;
  const w = ratio >= 1 ? innerW : Math.min(innerW, innerH * ratio);
  const h = ratio >= 1 ? innerW / ratio : innerH;
  return (
    <span
      data-board-photo-card
      className="absolute block rounded-md bg-white shadow-[0_1px_4px_rgba(22,22,33,0.22)]"
      style={{
        left: photo.dx,
        top: areaH - photo.dy - h - PHOTO_PAD_PX * 2,
        padding: PHOTO_PAD_PX,
        transform: `rotate(${photo.rotate}deg)`,
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
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setRatio(
                Math.min(RATIO_MAX, Math.max(RATIO_MIN, img.naturalWidth / img.naturalHeight)),
              );
            }
          }}
          className="block rounded-sm object-cover"
          style={{ width: w, height: h }}
        />
      ) : (
        <span
          aria-hidden
          data-board-photo-pending
          className="bg-pool-100 block rounded-sm"
          style={{ width: w, height: h }}
        />
      )}
      {more > 0 ? (
        <span
          data-board-more-photos
          className="bg-ink absolute -top-2 -right-2 rounded-full px-1.5 text-xs/4 font-medium text-white"
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A post on its day (Board view): every one is a label with its title, in
 * one of three styles. With photos, up to three cards fan above the label,
 * which overlaps their bottom edge, and the icon is small before the words;
 * without, the icon is a large sticker overhanging a corner of the label.
 */
export function BoardPieceView({
  piece,
  photos,
  lanes,
  metrics,
  onPick,
  onWrite,
  onClickCapture,
}: Shared & { piece: BoardPiece; photos: SignedMedia; onWrite: (card: Card) => void }) {
  const { card } = piece;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  const pictured = piece.variant === 'photo';
  const left = piece.corner === 'left';
  const top = piece.fan.length - 1;
  return (
    <div
      data-board-piece={piece.id}
      data-board-day={piece.day}
      data-variant={piece.variant}
      data-label={piece.label}
      data-rotate={piece.rotate}
      className="absolute"
      style={placed(piece)}
    >
      {/* The piece is the tap that brings its card up; the slot beside it is a tap of its own. */}
      <button
        type="button"
        onClick={() => onPick(card.splash.id)}
        onClickCapture={onClickCapture}
        aria-label={caption}
        data-board-pick={piece.id}
        className="absolute inset-0 block text-left"
      >
        {piece.photoBox ? (
          <SplashLayer
            id={`${piece.id}:photos`}
            box={piece.photoBox}
            style={piece.label}
            ripples={card.splash.count}
            outline={false}
          />
        ) : null}
        {piece.fan.map((photo, at) => (
          <PhotoCardView
            key={photo.path}
            photo={photo}
            url={photos[photo.path]}
            areaH={piece.labelBox.y + (piece.label === 'none' ? 0 : LABEL_OVERLAP_PX)}
            more={at === top ? piece.morePhotos : 0}
            metrics={metrics}
          />
        ))}
        <SplashLayer
          id={piece.id}
          box={piece.labelBox}
          style={piece.label}
          ripples={card.splash.count}
          outline
        />
        <span
          data-board-label
          className={`absolute block ${LABEL_CLASS[piece.label]}`}
          style={{
            top: piece.labelBox.y,
            left: piece.labelBox.x,
            width: piece.labelBox.w,
            paddingTop: pictured ? LABEL_PAD_BOTTOM_PX : LABEL_PAD_TOP_PX,
            paddingBottom: LABEL_PAD_BOTTOM_PX,
            paddingLeft: piece.label === 'none' ? 2 : metrics.labelPadX,
            paddingRight: piece.label === 'none' ? 2 : metrics.labelPadX,
          }}
        >
          <span className={CAPTION_CLASS}>
            {pictured && icon ? (
              <span aria-hidden data-board-icon className="mr-1">
                {icon}
              </span>
            ) : null}
            {caption}
            {card.joint ? <Faces card={card} ring={FACE_RING[piece.label]} /> : null}
          </span>
        </span>
        {!pictured && icon ? (
          <span
            aria-hidden
            data-board-sticker
            className="absolute flex items-center justify-center leading-none"
            style={{
              top: 0,
              [left ? 'left' : 'right']: 0,
              width: metrics.sticker,
              height: metrics.sticker,
              fontSize: metrics.sticker,
            }}
          >
            {icon}
          </span>
        ) : null}
      </button>
      {piece.slotY !== null ? <OpenSlot piece={piece} onWrite={onWrite} /> : null}
    </div>
  );
}

/** A ranged post's strip across its days in one week row, its caption on the tape. */
export function BoardTapeView({
  tape,
  lanes,
  onPick,
  onClickCapture,
}: Shared & { tape: BoardTape }) {
  const { card } = tape;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  return (
    <button
      type="button"
      onClick={() => onPick(card.splash.id)}
      onClickCapture={onClickCapture}
      aria-label={caption}
      data-board-tape={tape.id}
      data-board-week={tape.week}
      // White at 20% over the water: translucent tape, white words.
      data-starts-here={tape.startsHere ? '' : undefined}
      data-ends-here={tape.endsHere ? '' : undefined}
      // Masking tape: round only where the range truly starts and ends; a
      // cut where it runs on into the next week row stays square.
      className={`absolute flex items-center gap-1 bg-white/20 px-2.5 text-left text-xs font-medium text-white ${
        tape.startsHere ? 'rounded-l-full' : ''
      } ${tape.endsHere ? 'rounded-r-full' : ''}`}
      style={placed(tape)}
    >
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span className="min-w-0 truncate">{caption}</span>
      {/* The tape over the water reads as JOINT_SURFACE: the faces' ring takes it. */}
      {card.joint ? <Faces card={card} ring="ring-[#3739D4]" /> : null}
    </button>
  );
}
