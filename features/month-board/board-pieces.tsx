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

/**
 * A part's offset and tilt set by hand (review), as a transform: X a share
 * of the lane, Y in line heights; nothing when nothing is set.
 */
function moveOf(
  set: { x?: number; y?: number; tilt?: number } | undefined,
  column: number,
  line: number,
): string | undefined {
  if (!set || (set.x === undefined && set.y === undefined && set.tilt === undefined))
    return undefined;
  const parts = [`translate(${(set.x ?? 0) * column}px, ${(set.y ?? 0) * line}px)`];
  if (set.tilt) parts.push(`rotate(${set.tilt}deg)`);
  return parts.join(' ');
}

/** The wave's defaults: a small calm wave, the label's width. */
export const WAVE_DEFAULTS = { amp: 2, length: 16, weight: 2, span: 1 } as const;

/**
 * The same symmetric wave as the header glyph (review), repeated: half
 * waves as cubics with their controls at a third and two thirds, offset
 * 4/3 of the amplitude, so each crest reaches the amplitude exactly; a
 * whole number of half waves, so both ends sit on the midline.
 */
export function wavePath(width: number, amp: number, wavelength: number, pad: number): string {
  const half = wavelength / 2;
  const count = Math.max(1, Math.round(width / half));
  const step = width / count;
  const mid = pad + amp;
  const k = (amp * 4) / 3;
  const f = (v: number): string => String(Number(v.toFixed(3)));
  let d = `M${f(0)} ${f(mid)}`;
  for (let i = 0; i < count; i += 1) {
    const x = i * step;
    const cy = mid + (i % 2 === 0 ? k : -k);
    d += `C${f(x + step / 3)} ${f(cy)} ${f(x + (2 * step) / 3)} ${f(cy)} ${f(x + step)} ${f(mid)}`;
  }
  return d;
}

/**
 * A wave under the label (review), off unless switched on: white at 80%,
 * round caps, its height, wavelength, weight and length the person's, set
 * from the label's bottom-left and moved and tilted like any part.
 */
function WaveDecoration({
  label,
  wave,
  column,
  line,
}: {
  label: Box;
  wave: {
    amp?: number;
    length?: number;
    weight?: number;
    span?: number;
    x?: number;
    y?: number;
    tilt?: number;
  };
  column: number;
  line: number;
}) {
  const amp = wave.amp ?? WAVE_DEFAULTS.amp;
  const wavelength = wave.length ?? WAVE_DEFAULTS.length;
  const weight = wave.weight ?? WAVE_DEFAULTS.weight;
  const width = Math.max(4, label.w * (wave.span ?? WAVE_DEFAULTS.span));
  const pad = weight;
  const height = amp * 2 + pad * 2;
  return (
    <svg
      aria-hidden
      data-board-wave
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className="absolute overflow-visible"
      style={{
        left: label.x,
        top: label.y + label.h - height / 2,
        transform: moveOf(wave, column, line),
        transformOrigin: 'left center',
      }}
    >
      <path
        d={wavePath(width, amp, wavelength, pad)}
        stroke="#ffffff"
        strokeOpacity={0.8}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  'text-main-900/60 flex h-[calc(var(--line,13px)-1px)] w-[calc(var(--line,13px)-1px)] items-center justify-center overflow-hidden rounded-full bg-joint-face text-[10px] leading-none ring-1';

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
 * What parts the words from the faces or the monogram after them: an en
 * space (half an em, 5px at 10px — review: "give some gap"), not a margin.
 * The line may break after it, and then it hangs at the end of the line
 * before, so the mark starts a wrapped line flush at the padding; a margin
 * stayed, and pushed it in from the left.
 */
const SEPARATOR = '\u2002';

/**
 * The first line's indent (a corner sticker's room) is inherited: an
 * inline box in the words would indent its own content by it — a pool's
 * monogram pushed right inside its tile (review). Every inline box in the
 * words resets it.
 */
const NO_INDENT = 'indent-0';

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
      <>
        {SEPARATOR}
        <span
          data-board-pool
          className={`inline-flex h-[var(--line,13px)] items-center align-top ${NO_INDENT}`}
        >
          <Monogram
            name={pool}
            size="face"
            photo={card.poolPhoto ?? null}
            // A face's size at the words' own line (review: they scale with the text).
            className="!h-[calc(var(--line,13px)-1px)] !min-w-[calc(var(--line,13px)-1px)]"
          />
        </span>
      </>
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
    <>
      {SEPARATOR}
      <span
        data-board-faces
        className={`inline-flex h-[var(--line,13px)] items-center align-top ${NO_INDENT}`}
      >
        <FaceStack faces={faces} ring={ring} />
      </span>
    </>
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
  muted = false,
}: {
  piece: BoardPiece;
  narrow: boolean;
  onWrite: (card: Card) => void;
  muted?: boolean;
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
            className={`text-main-900/60 ring-main-900 bg-joint-face flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] leading-none ring-1 ${at > 0 ? '-ml-1' : ''}`}
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
  // Under every label where they meet (review): the labels' z is 1.
  const className = `absolute z-0 flex items-center gap-1 border-[1.5px] border-dashed border-white/80 px-[6px] py-[3px] text-[10px] leading-none text-white/80 ${muted ? 'opacity-50' : ''}`;
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
  moved,
}: {
  photo: PhotoCard;
  url: string | null | undefined;
  area: Box;
  more: number;
  /** Its offset and tilt set by hand, drawn without moving anything else (review). */
  moved: string | undefined;
}) {
  return (
    <span
      data-board-photo-card
      data-size={photo.size}
      className="absolute block"
      style={{
        left: 0,
        top: area.h - photo.dy - photo.size,
        width: photo.size,
        height: photo.size,
        transform: moved,
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
  const fade = piece.muted ? 'opacity-50' : '';
  // Set by hand (review): offsets and tilts move only this piece's drawing,
  // never the stack; X is a share of the lane, Y in line heights.
  const layout = card.layout ?? {};
  const line = piece.type.line;
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
      // No stacking context of its own (no opacity, no z-index): its parts
      // stack with every other piece's in the row — the slot under the
      // labels, the stickers over them (review). A muted day's half
      // strength is on each part.
      className={`absolute ${motionOf(ripple, plunge)}`}
      style={{ left: piece.x, top: piece.y, width: piece.w, height: piece.h }}
    >
      {/* The tap that brings its card up, under the drawing; the slot is a tap of its own. */}
      <button
        type="button"
        onClick={() => onPick(card.splash.id)}
        aria-label={caption}
        data-board-pick={piece.id}
        className="absolute inset-0 z-[1] block"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {piece.photoBox ? (
          <span
            data-board-photos
            className={`absolute z-[1] block ${fade}`}
            style={placed(piece.photoBox)}
          >
            {piece.fan.map((photo, at) => (
              <PhotoCardView
                key={photo.path}
                photo={photo}
                url={photos[photo.path]}
                area={piece.photoBox!}
                more={at === top ? piece.morePhotos : 0}
                moved={moveOf(layout.photos?.[photo.path], metrics.column, line)}
              />
            ))}
          </span>
        ) : null}
        {layout.wave?.on ? (
          <WaveDecoration label={label} wave={layout.wave} column={metrics.column} line={line} />
        ) : null}
        <span
          data-board-label
          className={`absolute z-[1] block ${LABEL_CLASS[piece.label]} ${fade}`}
          style={{
            ...placed(label),
            transform: moveOf(layout.label, metrics.column, line),
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
              fontSize: piece.type.size,
              lineHeight: `${line}px`,
              // The icon and the faces take the words' own line (review: they scale with the text).
              ['--line' as string]: `${line}px`,
              // A corner sticker's room, on the first line only (review).
              textIndent: piece.indent || undefined,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: piece.captionLines,
              maxHeight: piece.captionLines * line,
            }}
          >
            {piece.inlineIcon && icon ? (
              // Held to the words' line, so it never stretches it (review).
              <span
                aria-hidden
                data-board-icon
                className={`mr-1 inline-block h-[var(--line)] align-top leading-[var(--line)] ${NO_INDENT}`}
                // Inline it only turns, in its place on the line (review: icon tilt).
                style={
                  layout.icon?.tilt ? { transform: `rotate(${layout.icon.tilt}deg)` } : undefined
                }
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
            // Over its own label and any other (review).
            className={`absolute z-[2] flex items-center justify-center leading-none ${fade}`}
            style={{
              ...placed(piece.stickerBox),
              fontSize: piece.stickerBox.w,
              transform: moveOf(layout.icon, metrics.column, line),
            }}
          >
            {icon}
          </span>
        ) : null}
      </div>
      {/* Its own tap, beside the drawing: outside the hidden layer, so it is announced. */}
      {piece.slotBox ? (
        <OpenSlot piece={piece} narrow={metrics.narrow} onWrite={onWrite} muted={piece.muted} />
      ) : null}
    </div>
  );
}

/**
 * A ranged post's band across its days in one row (review): the full width
 * of its lanes, translucent white with no outline (review), at the top of
 * the row above the items.
 */
export function BoardTapeView({ tape, lanes, onPick, ripple }: Shared & { tape: BoardTape }) {
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
        style={{ fontSize: tape.size }}
      >
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span className="min-w-0 truncate">{caption}</span>
        {/* Over the band the water reads as the joint surface: the faces' ring takes it. */}
        {card.joint ? <Faces card={card} ring="ring-joint" /> : null}
      </button>
    </div>
  );
}
