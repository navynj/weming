'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import {
  postIcon,
  laneOfCard,
  type Card,
  type CardFace,
  type GridColumn,
} from '@/features/home/grid';
import { Monogram } from '@/components/ui/monogram';
import { CommitRing } from '@/components/ui/waves';
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
import { handMoved, isPeriod, type BoardLayoutJson } from './board-layout';
import {
  EditToolbar,
  NO_TOOLS,
  PartFrame,
  partAt,
  type FrameUnits,
  type Tools,
} from './board-handles';
import { LABEL_PART, partValues, type BoardPart } from './handle-math';
import type { BoardEditing } from './use-board-editing';
import { usePrefersReducedMotion } from '@/components/ui/waves/use-reduced-motion';

type Lanes = Pick<GridColumn, 'id' | 'icon' | 'name'>[];

/** What a piece needs besides its place: the lanes its icon falls back to, the sizes, and what a tap does. */
type Shared = {
  lanes: Lanes;
  /** The sizes that follow the board's width. */
  metrics: BoardMetrics;
  /** Brings the post's card to the top of the stack, as a mark does in the Lane view. */
  onPick: (id: string) => void;
  /**
   * Direct manipulation (review, 2026-10-27): a tap goes here instead of
   * `onPick`, and the active piece draws its handles and its toolbar.
   */
  editing?: BoardEditing | null;
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

/** A part's own offset with the whole piece's added (0038): one move for every part. */
function nudge<T extends { x?: number; y?: number }>(
  set: T | undefined,
  shift: { x?: number; y?: number } | undefined,
): T | undefined {
  if (!shift || (shift.x === undefined && shift.y === undefined)) return set;
  return { ...set, x: (set?.x ?? 0) + (shift.x ?? 0), y: (set?.y ?? 0) + (shift.y ?? 0) } as T;
}

/**
 * A part's stacking with the whole piece's layer added (0038): every part
 * rises together, two steps a layer, so its own order (sticker over label)
 * holds and pieces still interleave with no stacking context of their own.
 */
/** Above the highest layer (5) a post in place can take: a moved post's lift (0044). */
const MOVED_LAYERS = 6;

function lifted(base: number, layer: number | undefined): CSSProperties | undefined {
  return layer ? { zIndex: base + 2 * layer } : undefined;
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
  moving = '',
  stack = 0,
  selectable = false,
  frame = null,
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
  /** The piece's bob or plunge, played on each part (motionOf). */
  moving?: string;
  /** The piece's layers (lifted), so a moved wave rises with its piece. */
  stack?: number;
  /** Its piece is being edited: a tap on the wave selects it. */
  selectable?: boolean;
  /** Its frame while selected, laid over it exactly. */
  frame?: ReactNode;
}) {
  const amp = wave.amp ?? WAVE_DEFAULTS.amp;
  const wavelength = wave.length ?? WAVE_DEFAULTS.length;
  const weight = wave.weight ?? WAVE_DEFAULTS.weight;
  const width = Math.max(4, label.w * (wave.span ?? WAVE_DEFAULTS.span));
  const pad = weight;
  const height = amp * 2 + pad * 2;
  const placedAt: CSSProperties = {
    left: label.x,
    top: label.y + label.h - height / 2,
    transform: moveOf(wave, column, line),
    transformOrigin: 'left center',
    ...lifted(0, stack),
  };
  const path = wavePath(width, amp, wavelength, pad);
  return (
    <>
      <svg
        aria-hidden
        data-board-wave
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        className={`absolute overflow-visible ${moving}`}
        style={placedAt}
      >
        {selectable ? (
          // A finger's width to tap, unseen: the drawn line is two pixels.
          <path
            d={path}
            stroke="transparent"
            strokeWidth={16}
            style={{ pointerEvents: 'stroke' }}
            className="cursor-pointer"
          />
        ) : null}
        <path
          d={path}
          // What reads as white on the ground in every mode (0032, 0036).
          style={{ stroke: 'var(--color-white)' }}
          strokeOpacity={0.8}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {frame ? (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{ ...placedAt, width, height, zIndex: 60 }}
        >
          {frame}
        </span>
      ) : null}
    </>
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
  // label-fill: the colour's pastel in pastel mode (0036, globals.css).
  white: 'label-fill bg-white text-main-900',
  // label-ink: a pale fill in pastel mode (0036, globals.css).
  ink: 'label-ink bg-ink text-white',
  // A period band's fill (review): my side on someone else's record.
  pale: 'bg-white/20 text-white',
};
/** The faces' ring is the surface beneath them, so it parts them unseen. */
const FACE_RING: Record<LabelStyle, string> = {
  none: 'ring-main-900',
  white: 'ring-white',
  ink: 'ring-ink',
  pale: 'ring-transparent',
};
/**
 * A face's size on the calendar: a little past the words' line (review: "a
 * bit bigger"), so it scales with them, standing out of the line box evenly.
 */
const FACE_SIZE = 'h-[calc(var(--line,13px)+3px)] w-[calc(var(--line,13px)+3px)]';
/**
 * Its letters scale with it rather than holding the 10px floor, which broke
 * the tile once the face was small (review): a mark, read as a shape.
 */
const FACE_TEXT = 'text-[length:calc((var(--line,13px)+3px)*0.42)]'; // allow-small-text: scales with the face
const FACE_CLASS = `text-main-900/60 flex ${FACE_SIZE} ${FACE_TEXT} shrink-0 items-center justify-center overflow-hidden rounded-full bg-joint-face leading-none ring-1`;

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
  // A joint splash's pool; else every pool my record is shared to (review).
  const pools =
    card.pools?.[0] !== undefined
      ? [{ name: card.pools[0], photo: card.poolPhoto ?? null }]
      : (card.sharedPools ?? []);
  if (pools.length > 0) {
    return (
      <>
        {SEPARATOR}
        <span
          data-board-pool
          className={`inline-flex h-[var(--line,13px)] items-center gap-0.5 align-top ${NO_INDENT}`}
        >
          {pools.map((pool) => (
            <Monogram
              key={pool.name}
              name={pool.name}
              size="face"
              photo={pool.photo}
              // A face's size, scaling with the words (review), letters and all.
              className="!h-[calc(var(--line,13px)+3px)] !min-w-[calc(var(--line,13px)+3px)] !text-[length:calc((var(--line,13px)+3px)*0.42)]" // allow-small-text: scales with the face
            />
          ))}
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
 * "Add your side" hanging from a band (review: Members): the slot's own
 * look — dashed white note, tilted down about its corner — under the tape in
 * my column, there only while I am one it waits for. It opens the splash to
 * write my ripple.
 */
export function TapeSlot({
  card,
  x,
  y,
  narrow,
  onWrite,
}: {
  card: Card;
  x: number;
  y: number;
  narrow: boolean;
  onWrite: (card: Card) => void;
}) {
  const { me } = usePeople();
  if (me === null || !(card.awaiting ?? []).some((face) => face.authorId === me)) return null;
  return (
    <button
      type="button"
      data-tape-slot={card.splash.id}
      aria-label={`Add your side to ${captionOf(card)}`}
      onClick={() => onWrite(card)}
      className="absolute z-0 flex items-center gap-1 border-[1.5px] border-dashed border-white/80 px-[6px] py-[3px] text-[10px] leading-none whitespace-nowrap text-white/80"
      style={{ left: x, top: y, transform: 'rotate(3.5deg)', transformOrigin: 'top left' }}
    >
      {narrow ? 'Add' : 'Add your side'}
    </button>
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
  shift,
  layer,
  moving = '',
}: {
  piece: BoardPiece;
  narrow: boolean;
  onWrite: (card: Card) => void;
  muted?: boolean;
  /** The whole piece's move (0038), before its own turn. */
  shift?: string;
  layer?: number;
  /** The piece's bob or plunge, played on each part (motionOf). */
  moving?: string;
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
    transform: `${shift ? `${shift} ` : ''}rotate(${piece.slotRotate}deg)`,
    transformOrigin: piece.slotAt === 'right' ? 'top left' : 'top right',
    ...lifted(0, layer),
  };
  // Under every label where they meet (review): the labels' z is 1.
  const className = `absolute z-0 flex items-center gap-1 border-[1.5px] border-dashed border-white/80 px-[6px] py-[3px] text-[10px] leading-none text-white/80 ${muted ? 'opacity-50' : ''} ${moving}`;
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
  children,
}: {
  photo: PhotoCard;
  url: string | null | undefined;
  area: Box;
  more: number;
  /** Its offset and tilt set by hand, drawn without moving anything else (review). */
  moved: string | undefined;
  /** Its frame, while it is the part selected. */
  children?: ReactNode;
}) {
  return (
    <span
      data-board-photo-card={photo.path}
      data-size={photo.size}
      className="pointer-events-auto absolute block cursor-pointer"
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
      {children}
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
  editing = null,
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
  // Reduced motion (review): no bob and no ripple; a still outline says which.
  const still = usePrefersReducedMotion();
  const reading = ripple !== null;
  const moving = still ? '' : motionOf(ripple, plunge);
  // Set by hand (review): offsets and tilts move only this piece's drawing,
  // never the stack; X is a share of the lane, Y in line heights.
  const layout = card.layout ?? {};
  const line = piece.type.line;
  // Being edited by hand (review): its handles and toolbar, its parts over every other piece.
  const active = editing !== null && editing.activeId === piece.id;
  const selected = active ? pieceSelected(editing.part, piece, layout, icon !== null) : null;
  // Moved by hand (0044): above every piece in place, its own layer kept among the moved.
  const stack =
    (layout.piece?.layer ?? 0) +
    (handMoved(layout) ? MOVED_LAYERS : 0) +
    (active ? ACTIVE_LAYERS : 0);
  const tap = (event: React.MouseEvent): void => {
    if (editing) editing.tap(card.splash.id, partAt(event.target));
    else onPick(card.splash.id);
  };
  const units: FrameUnits = {
    column: metrics.column,
    line,
    sizeUnit: selected?.kind === 'photo' ? metrics.column : metrics.caption.line,
    sizePx:
      selected?.kind === 'photo'
        ? (piece.fan.find((p) => p.path === selected.path)?.size ?? 0)
        : (piece.stickerBox?.w ?? 0),
    labelW: label.w,
  };
  const period = isPeriod(card.splash);
  const frameOf = (part: BoardPart): ReactNode =>
    selected &&
    selected.kind === part.kind &&
    (part.kind !== 'photo' || (selected.kind === 'photo' && selected.path === part.path)) ? (
      <PartFrame
        part={selected}
        values={partValues(layout, selected)}
        units={units}
        tools={period ? NO_TOOLS : TOOLS[selected.kind]}
        editing={editing!}
      />
    ) : null;
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
      data-board-moved={handMoved(layout) ? '' : undefined}
      // No stacking context of its own (no opacity, no z-index): its parts
      // stack with every other piece's in the row — the slot under the
      // labels, the stickers over them (review). A muted day's half
      // strength is on each part.
      // Its bob or plunge plays on each part, never on this wrapper: an
      // animated wrapper is a stacking context of its own, and its parts
      // would stop meeting other pieces' (review: z-order while it bobs).
      className="absolute"
      style={{ left: piece.x, top: piece.y, width: piece.w, height: piece.h }}
    >
      {/* The tap that brings its card up, under the drawing; the slot is a tap of its own. */}
      <button
        type="button"
        onClick={tap}
        aria-label={caption}
        data-board-pick={piece.id}
        // Keyboard and screen readers: a pointer taps what is drawn, wherever a
        // layout moved it (review: taps on a moved label missed).
        className={`pointer-events-none absolute inset-0 z-[1] block ${moving}`}
        style={lifted(1, stack)}
      />
      {/* What is drawn takes the tap, where a layout put it (review): the
          label, the sticker and each photo; the gaps between them do not. */}
      <div
        aria-hidden
        data-board-hits
        className="pointer-events-none absolute inset-0"
        onClick={tap}
      >
        {piece.photoBox ? (
          <span
            data-board-photos
            className={`absolute z-[1] block ${fade} ${moving}`}
            style={{ ...placed(piece.photoBox), ...lifted(1, stack) }}
          >
            {piece.fan.map((photo, at) => (
              <PhotoCardView
                key={photo.path}
                photo={photo}
                url={photos[photo.path]}
                area={piece.photoBox!}
                more={at === top ? piece.morePhotos : 0}
                moved={moveOf(
                  nudge(layout.photos?.[photo.path], layout.piece),
                  metrics.column,
                  line,
                )}
              >
                {frameOf({ kind: 'photo', path: photo.path })}
              </PhotoCardView>
            ))}
          </span>
        ) : null}
        {layout.wave?.on ? (
          <WaveDecoration
            label={label}
            wave={nudge(layout.wave, layout.piece)!}
            column={metrics.column}
            line={line}
            moving={moving}
            stack={stack}
            selectable={active}
            frame={frameOf({ kind: 'wave' })}
          />
        ) : null}
        <span
          data-board-label
          className={`pointer-events-auto absolute z-[1] block cursor-pointer ${LABEL_CLASS[piece.label]} ${fade} ${moving}`}
          data-reading-outline={reading && still ? '' : undefined}
          style={{
            ...placed(label),
            transform: moveOf(nudge(layout.label, layout.piece), metrics.column, line),
            ...lifted(1, stack),
            ...(reading && still
              ? { outline: '2px solid var(--color-white)', outlineOffset: 2 }
              : {}),
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
            {card.joint || card.together || card.side ? (
              // My side on someone's record shows its pool there (review).
              <Faces card={card} ring={FACE_RING[piece.label]} />
            ) : card.authorFace && card.authorId ? (
              <AuthorFace card={card} px={metrics.narrow ? 12 : 14} />
            ) : null}
          </span>
          {frameOf(LABEL_PART)}
        </span>
        {reading && !still ? (
          // Out from the sticker, or the front of the label when the icon is inline.
          // Moved and turned exactly as what it rings: the sticker, or the label
          // whose front holds an inline icon.
          <ReadingRipple
            key={ripple}
            box={piece.stickerBox && icon ? piece.stickerBox : label}
            transform={
              piece.stickerBox && icon
                ? moveOf(nudge(layout.icon, layout.piece), metrics.column, line)
                : moveOf(nudge(layout.label, layout.piece), metrics.column, line)
            }
            ring={
              piece.stickerBox && icon
                ? { x: 0, y: 0, w: piece.stickerBox.w, h: piece.stickerBox.h }
                : { x: piece.pad.left, y: piece.pad.top, w: piece.type.line, h: piece.type.line }
            }
            z={lifted(3, stack)?.zIndex ?? 3}
          />
        ) : null}
        {piece.stickerBox && icon ? (
          <span
            aria-hidden
            data-board-sticker
            data-size={piece.stickerSize ?? undefined}
            data-at={piece.stickerAt ?? undefined}
            // Over its own label and any other (review).
            className={`pointer-events-auto absolute z-[2] flex cursor-pointer items-center justify-center leading-none ${fade} ${moving}`}
            style={{
              ...placed(piece.stickerBox),
              fontSize: piece.stickerBox.w,
              transform: moveOf(nudge(layout.icon, layout.piece), metrics.column, line),
              ...lifted(2, stack),
            }}
          >
            {icon}
            {frameOf({ kind: 'icon' })}
          </span>
        ) : null}
      </div>
      {active ? (
        <EditToolbar
          editing={editing!}
          fontSize={selected?.kind === 'label' ? piece.type.size : null}
          style={toolbarAt(piece, nudge(layout.label, layout.piece), metrics, line)}
        />
      ) : null}
      {/* Its own tap, beside the drawing: outside the hidden layer, so it is announced. */}
      {piece.slotBox ? (
        <OpenSlot
          piece={piece}
          narrow={metrics.narrow}
          // Being edited, the note is part of the drawing, not a way in.
          onWrite={active ? () => {} : onWrite}
          muted={piece.muted}
          shift={moveOf(layout.piece, metrics.column, line)}
          layer={stack}
          moving={moving}
        />
      ) : null}
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
  onPick,
  ripple,
  editing = null,
}: Shared & { tape: BoardTape }) {
  const { card } = tape;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  // Set by hand (0047): label, icon and wave, offsets measured across the
  // band's full width — X a share of it, Y in lines — the whole piece's
  // offset added, as on any piece.
  const layout = card.layout ?? {};
  const size = layout.label?.fontSize ?? tape.size;
  const line = size + 3;
  const label = nudge(layout.label, layout.piece);
  const iconSet = layout.icon;
  // Being edited by hand (review): a range along its days takes its text size
  // alone; a band across Members its label, icon and wave (0047), as the panel says.
  const active = editing !== null && editing.activeId === tape.id;
  const period = isPeriod(card.splash);
  const selected = active ? tapeSelected(editing.part, layout) : null;
  const tap = (event: React.MouseEvent): void => {
    if (editing) editing.tap(card.splash.id, partAt(event.target));
    else onPick(card.splash.id);
  };
  const frameOf = (kind: 'label' | 'icon' | 'wave'): ReactNode =>
    selected?.kind === kind ? (
      <PartFrame
        part={selected}
        values={partValues(layout, selected)}
        units={{
          column: tape.w,
          line,
          sizeUnit: line,
          sizePx: iconSet?.size ? Math.round(iconSet.size * line) : size,
          labelW: tape.w,
        }}
        tools={period ? NO_TOOLS : TOOLS[kind]}
        editing={editing!}
        origin={kind === 'label' ? 'left' : 'center'}
      />
    ) : null;
  return (
    <>
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
        {layout.wave?.on ? (
          <WaveDecoration
            label={{ x: 0, y: 0, w: tape.w, h: tape.h }}
            wave={nudge(layout.wave, layout.piece)!}
            column={tape.w}
            line={line}
            selectable={active}
            frame={frameOf('wave')}
          />
        ) : null}
        <button
          type="button"
          onClick={tap}
          aria-label={caption}
          data-board-pick={tape.id}
          data-board-band
          className="absolute inset-0 flex items-center gap-1 bg-white/20 px-2 text-left font-medium text-white"
          style={{
            fontSize: size,
            transform: moveOf(label, tape.w, line),
            transformOrigin: 'left center',
          }}
        >
          {icon ? (
            <span
              aria-hidden
              data-band-icon
              className="relative inline-block leading-none"
              style={{
                ...(iconSet?.size ? { fontSize: Math.round(iconSet.size * line) } : {}),
                transform: moveOf(iconSet, tape.w, line),
              }}
            >
              {icon}
              {frameOf('icon')}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{caption}</span>
          {/* Over the band the water reads as the joint surface: the faces' ring takes it. */}
          {card.joint || card.together ? <Faces card={card} ring="ring-joint" /> : null}
          {frameOf('label')}
        </button>
      </div>
      {active ? (
        <EditToolbar
          editing={editing!}
          fontSize={selected?.kind === 'label' ? size : null}
          style={{ left: tape.x, top: tape.y + tape.h + 10 }}
        />
      ) : null}
    </>
  );
}

/** Which handles each part has (review): the label moves and turns, its size the toolbar's. */
const TOOLS: Record<BoardPart['kind'], Tools> = {
  label: { move: true, rotate: true, size: false, ends: false },
  icon: { move: true, rotate: true, size: true, ends: false },
  photo: { move: true, rotate: true, size: true, ends: false },
  wave: { move: true, rotate: false, size: false, ends: true },
};

/** Lifts the piece being edited over every other, moved ones included. */
const ACTIVE_LAYERS = 20;

/** The part asked for, when the piece has it as its own: a sticker, a photo shown, a wave on; else its label. */
function pieceSelected(
  part: BoardPart,
  piece: BoardPiece,
  layout: BoardLayoutJson,
  hasIcon: boolean,
): BoardPart {
  if (part.kind === 'icon' && piece.stickerBox && hasIcon) return part;
  if (part.kind === 'photo' && piece.fan.some((p) => p.path === part.path)) return part;
  if (part.kind === 'wave' && layout.wave?.on) return part;
  return LABEL_PART;
}

/** A band's: its icon once it is set apart from the words (Inline off), its wave once on; else its label. */
function tapeSelected(part: BoardPart, layout: BoardLayoutJson): BoardPart {
  if (part.kind === 'icon' && layout.icon?.inline === false) return part;
  if (part.kind === 'wave' && layout.wave?.on) return part;
  return LABEL_PART;
}

/**
 * The toolbar's seat (review): under the label as it is moved — below its
 * own handles and the wave's — towards the board's middle, so it stays on it.
 */
function toolbarAt(
  piece: BoardPiece,
  moved: { x?: number; y?: number } | undefined,
  metrics: BoardMetrics,
  line: number,
): CSSProperties {
  const box = piece.labelBox;
  const x = box.x + (moved?.x ?? 0) * metrics.column;
  const top = box.y + (moved?.y ?? 0) * line + box.h + 26;
  return piece.x + x + box.w / 2 > metrics.width / 2
    ? { left: x + box.w, top, transform: 'translateX(-100%)' }
    : { left: x, top };
}

/**
 * The ring out from the post being read (review): the List's own — the
 * commit ring's three staggered rings, once — centred on the icon, about
 * three and a half times its size, once per time the post comes to the top,
 * then gone. Keyed by that time, so it never loops.
 */
function ReadingRipple({
  box,
  transform,
  ring: at,
  z,
}: {
  /** The box of what it rings, and that part's own move: the ring rides with it. */
  box: Box;
  transform: string | undefined;
  /** The icon within that box, which the ring is centred on. */
  ring: Box;
  z: number | string;
}) {
  const [done, setDone] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  // Each ring ends on its own; the ripple is over once the last has. The
  // standard event, listened to directly: React maps its prop to a
  // vendor-prefixed name where it guesses the browser lacks it.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let ended = 0;
    const end = (): void => {
      ended += 1;
      if (ended >= RIPPLE_RINGS) setDone(true);
    };
    el.addEventListener('animationend', end);
    return () => el.removeEventListener('animationend', end);
  }, []);
  if (done) return null;
  const size = Math.round(at.w * RIPPLE_SPREAD);
  // The move on the outer box, the rings inside: a ring's growth never scales the move.
  return (
    <span
      aria-hidden
      data-reading-ripple-at
      className="pointer-events-none absolute"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, transform, zIndex: z }}
    >
      <span
        ref={host}
        data-reading-ripple
        className="absolute flex items-center justify-center"
        style={{
          left: at.x + at.w / 2 - size / 2,
          top: at.y + at.h / 2 - size / 2,
          width: size,
          height: size,
        }}
      >
        <CommitRing size={size} contentSize={at.w} gap={6} rings={RIPPLE_RINGS} once />
      </span>
    </span>
  );
}

/** As the List's ring: three rings, out to about three and a half times the icon. */
const RIPPLE_RINGS = 3;
const RIPPLE_SPREAD = 96 / 28;

/**
 * Whose a record is, in a pool's Calendar, Lane and List (review): their face
 * after the title, 14px (12px on a phone), mine included; a joint record
 * shows its writers instead. Its initials scale with it, not the 10px floor:
 * a face is read as a mark.
 */
export function AuthorFace({ card, px }: { card: Card; px: number }) {
  return (
    <>
      {SEPARATOR}
      <span
        data-board-author={card.authorId}
        className={`inline-flex h-[var(--line,13px)] items-center align-top ${NO_INDENT}`}
      >
        <Avatar
          id={card.authorId}
          initials={card.author ?? ''}
          className="text-main-900/60 bg-joint-face flex shrink-0 items-center justify-center overflow-hidden rounded-full leading-none"
          // allow-small-text: initials sized with the face, read as a mark
          style={{ width: px, height: px, fontSize: Math.round(px * 0.45) }}
        />
      </span>
    </>
  );
}
