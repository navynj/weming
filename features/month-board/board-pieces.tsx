'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { VideoThumb } from '@/components/ui/video-media';
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
  HALF_WEEK_BELOW_PX,
  type Box,
  type BoardMetrics,
  type BoardPiece,
  type BoardTape,
  type LabelStyle,
  type PhotoCard,
  photoMove,
} from './layout';
import {
  handMoved,
  iconHidden,
  isPeriod,
  labelHidden,
  mergeLayout,
  type BoardLayoutJson,
} from './board-layout';
import {
  EditToolbar,
  NO_TOOLS,
  PartFrame,
  type ToolbarSeat,
  partAt,
  type FrameHandle,
  type FrameUnits,
  type Tools,
} from './board-handles';
import {
  boundsOf,
  clamp,
  LABEL_PART,
  LIMITS,
  PIECE_PART,
  samePart,
  moveHolding,
  partPatch,
  partValues,
  pointOfBox,
  type BoardPart,
  type PartBox,
  type PartValues,
} from './handle-math';
import { learnsAspect } from './photo-aspects';
import {
  defaultPartOrder,
  overAll,
  partOrder,
  partRanks,
  RING_RANK,
  SLOT_RANK,
  zOf,
  type LayerControls,
  type LayerMove,
  type Stacking,
} from './stacking';
import type { BoardEditing, PartChip } from './use-board-editing';
import type { ToolbarEye } from './board-handles';
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
  none: 'label-none text-white',
  // label-fill: the colour's pastel in pastel mode (0036, globals.css).
  white: 'label-fill bg-white text-main-900',
  // label-ink: a pale fill in pastel mode (0036, globals.css).
  ink: 'label-ink bg-ink text-white',
  // Outline (H55): the ground's colour, edged and lettered white; the light
  // grounds' swap makes it white, edged and lettered in the colour.
  outline: 'label-outline bg-main-900 text-white ring-1 ring-inset ring-white',
  // The rule's second fill (H55): ink on the dark ground, Glass on the
  // light and pastel ones (label-second, globals.css).
  second: 'label-ink label-second bg-ink text-white',
  // A period band's fill (review): my side on someone else's record;
  // Outline on the light and pastel grounds (label-pale, globals.css).
  pale: 'label-pale bg-white/20 text-white',
  // Glass (0058): a band's fill, the tint alone, no edge on any ground (H66).
  glass: 'label-glass bg-white/20 text-white',
};
/** The faces' ring is the surface beneath them, so it parts them unseen. */
const FACE_RING: Record<LabelStyle, string> = {
  none: 'ring-main-900',
  white: 'ring-white',
  ink: 'ring-ink',
  outline: 'ring-main-900',
  // None on the light grounds, where the second fill is Glass (globals.css).
  second: 'ring-ink',
  pale: 'ring-transparent',
  glass: 'ring-transparent',
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
 * my column, there only while it waits for my side (H42e). It opens the
 * splash to write my ripple.
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
  if (!card.waitsForMe) return null;
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
 * A together record's slot (review, H42e): a note stuck on the label after
 * the fact — a small rectangle, dashed 1.5px white outline, no fill, white at
 * 80% — reading "Add your side" ("Add" on a phone). Drawn only for me, only
 * while the record waits for my side; it opens the splash to write it. It
 * hangs from the label's bottom-right corner (bottom-left where the next lane
 * is taken), tilted down about that corner, never over any words. Nobody's
 * pending side but mine is ever shown.
 */
function OpenSlot({
  piece,
  narrow,
  onWrite,
  muted = false,
  shift,
  z,
  moving = '',
}: {
  piece: BoardPiece;
  narrow: boolean;
  onWrite: (card: Card) => void;
  muted?: boolean;
  /** The whole piece's move (0038), before its own turn. */
  shift?: string;
  /** Its place in the view's one stacking order: under its own label. */
  z?: number;
  /** The piece's bob or plunge, played on each part (motionOf). */
  moving?: string;
}) {
  if (!piece.card.waitsForMe) return null;
  const box = piece.slotBox!;
  // Its content's own width: placed at its corner, as tall as its row.
  const style: CSSProperties = {
    left: box.x,
    top: box.y,
    height: box.h,
    transform: `${shift ? `${shift} ` : ''}rotate(${piece.slotRotate}deg)`,
    transformOrigin: piece.slotAt === 'right' ? 'top left' : 'top right',
    ...(z !== undefined ? { zIndex: z } : {}),
  };
  // Under every label where they meet (review): the labels' z is 1.
  return (
    <button
      type="button"
      data-board-slot={piece.id}
      data-board-slot-mine
      data-slot-at={piece.slotAt}
      aria-label={`Add your side to ${captionOf(piece.card)}`}
      onClick={() => onWrite(piece.card)}
      className={`pointer-events-auto absolute z-0 flex items-center border-[1.5px] border-dashed border-white/80 px-[6px] py-[3px] text-[10px] leading-none text-white/80 ${muted ? 'opacity-50' : ''} ${moving}`}
      style={style}
    >
      <span data-board-slot-words className="whitespace-nowrap">
        {narrow ? 'Add' : 'Add your side'}
      </span>
    </button>
  );
}

/**
 * One photo card: no frame, the whole image in its own ratio — never cropped
 * (review, 2026-10-27) — standing on the photo area's bottom edge, a card
 * behind peeking above the one in front. Until it loads it holds a 4:3
 * placeholder; on load its ratio is learned and the layout makes room. Once
 * drawn there is nothing behind it, so a cutout floats on the water.
 */
function PhotoCardView({
  photo,
  url,
  more,
  moved,
  play = false,
  children,
}: {
  photo: PhotoCard;
  url: string | null | undefined;
  more: number;
  /** Its offset and tilt set by hand, drawn without moving anything else (review). */
  moved: string | undefined;
  /** A video's play mark: on a shared image, where it must read as a video (H63). */
  play?: boolean;
  /** Its frame, while it is the part selected. */
  children?: ReactNode;
}) {
  return (
    <span
      data-board-photo-card={photo.path}
      data-size={photo.size}
      className="pointer-events-auto absolute block cursor-pointer"
      style={{
        left: photo.x,
        top: photo.y,
        width: photo.w,
        height: photo.h,
        transform: moved,
      }}
    >
      {photo.video ? (
        // A video is decoration here (H42c): its thumbnail in its own shape, a
        // sticker with no play mark, tapped like any part. It plays on the
        // stack card and in the detail sheet.
        <VideoThumb url={url} play={play} small />
      ) : url ? (
        // A signed URL for a few minutes: next/image would cache it past its life.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          data-board-photo
          {...learnsAspect(photo.path)}
          className="block h-full w-full object-contain"
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
  order = 0,
  total = 1,
  stacking = null,
  videoPlay = false,
}: Shared & {
  piece: BoardPiece;
  /** Its place in the view's one stacking order, and how many pieces the view has (stacking.ts). */
  order?: number;
  total?: number;
  /** The view's order: what the toolbar's layer buttons do. */
  stacking?: Stacking | null;
  photos: SignedMedia;
  onWrite: (card: Card) => void;
  /** Just dropped: it plunges in. */
  plunge: boolean;
  /** Videos with their play mark (H63: a shared image); the board draws them as stickers. */
  videoPlay?: boolean;
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
  const saved = card.layout ?? {};
  const line = piece.type.line;
  const shift = saved.piece ?? {};
  // Being edited by hand (review): its handles and toolbar, its parts over every other piece.
  const active = editing !== null && editing.activeId === piece.id;
  const selected = active ? pieceSelected(editing.part, piece, saved, icon !== null) : null;
  // A hidden part selected (review): outlined dashed where it would be, no handles.
  const selectedHidden =
    selected !== null &&
    selected.kind !== 'piece' &&
    (selected.kind === 'label'
      ? labelHidden(saved)
      : selected.kind === 'icon'
        ? iconHidden(saved)
        : saved.photos?.[selected.path]?.hidden === true);

  // A part's box as the engine lays it out, before its own move and turn, on
  // the board: the piece's own place counts, as a bigger sticker hanging
  // above the row moves the whole piece down.
  const boxOf = (part: BoardPart): PartBox | null => {
    const local = (): PartBox | null => {
      if (part.kind === 'label') return label;
      if (part.kind === 'icon') return piece.stickerBox;
      if (part.kind !== 'photo' || !piece.photoBox) return null;
      const photo = piece.fan.find((p) => p.path === part.path);
      const area = piece.photoBox;
      return photo ? { x: area.x + photo.x, y: area.y + photo.y, w: photo.w, h: photo.h } : null;
    };
    const box = local();
    return box ? { ...box, x: piece.x + box.x, y: piece.y + box.y } : null;
  };
  // A part's move in pixels, the whole piece's added: as moveOf draws it.
  const pixelsOf = (values: PartValues) => ({
    x: ((values.x ?? 0) + (shift.x ?? 0)) * metrics.column,
    y: ((values.y ?? 0) + (shift.y ?? 0)) * line,
  });
  // A size change holds a point of the part where it was (review): its
  // top-left for a corner or a width pulled, a pinch's midpoint. As the
  // engine lays the part out at each new size — its own alignment, a
  // right-aligned photo, a label reaching into an empty lane — and as it
  // turns about its centre, the move that keeps that point still is
  // computed here and drawn in the same frame, then written with the size.
  const [holding, setHolding] = useState<{
    part: BoardPart;
    share: { x: number; y: number };
    at: { x: number; y: number };
  } | null>(null);
  const heldBox = holding ? boxOf(holding.part) : null;
  const kept =
    holding && heldBox
      ? (() => {
          const m = moveHolding(
            holding.at,
            heldBox,
            partValues(saved, holding.part).tilt,
            holding.share,
          );
          return {
            x: clamp(Number((m.x / metrics.column - (shift.x ?? 0)).toFixed(4)), LIMITS.x),
            y: clamp(Number((m.y / line - (shift.y ?? 0)).toFixed(4)), LIMITS.y),
          };
        })()
      : null;
  const layout = kept && holding ? mergeLayout(saved, partPatch(holding.part, kept)) : saved;
  useLayoutEffect(() => {
    if (!holding || !kept || !editing) return;
    const now = partValues(saved, holding.part);
    // Written before the frame is painted, so the part never shows out of place.
    if (Math.abs((now.x ?? 0) - kept.x) > 5e-5 || Math.abs((now.y ?? 0) - kept.y) > 5e-5)
      editing.adjust(partPatch(holding.part, kept));
  });
  const onHold = (share: { x: number; y: number } | null): void => {
    const box = share && selected ? boxOf(selected) : null;
    if (!share || !selected || !box) {
      setHolding(null);
      return;
    }
    const values = partValues(layout, selected);
    setHolding({
      part: selected,
      share,
      at: pointOfBox(box, pixelsOf(values), values.tilt, share),
    });
  };
  // One order for the whole view (stacking.ts): its place, then each part's
  // step. The part a handle holds rises over every piece while it is held,
  // and drops back on release; otherwise the order is drawn as it is, so a
  // layer button shows what it did.
  const [held, setHeld] = useState(false);
  const frameRef = useRef<FrameHandle>(null);
  // A move starts from the selected part itself: its frame lets pointers through.
  const onPartDown = (event: React.PointerEvent): void => {
    if (selected && samePart(partAt(event.target), selected)) frameRef.current?.beginMove(event);
  };
  // The selected part takes the finger: dragging it never scrolls the board.
  const stillIf = (kind: BoardPart['kind']): CSSProperties | undefined =>
    selected?.kind === kind ? { touchAction: 'none' } : undefined;
  // Its parts' order within it (0055): saved, else label, photos (the first
  // uploaded on top), icon; what is hidden takes no place.
  const hideIcon = iconHidden(layout);
  const hideLabel = labelHidden(layout) || (piece.compact && piece.captionLines === 0);
  const sticker = !!(piece.stickerBox && icon && !hideIcon);
  const ranks = partRanks(
    partOrder(
      layout.order,
      defaultPartOrder({
        label: !hideLabel,
        photos: [...piece.fan].reverse().map((p) => p.path),
        icon: sticker,
      }),
    ),
  );
  const rankOf = (key: string): number => ranks.get(key) ?? 1;
  const photoRank = Math.max(1, ...piece.fan.map((p) => rankOf(`photo:${p.path}`)));
  const fanDrawn = [...piece.fan].sort(
    (a, b) => rankOf(`photo:${a.path}`) - rankOf(`photo:${b.path}`),
  );
  const zFor = (rank: number, kind: BoardPart['kind']) =>
    held && selected?.kind === kind ? overAll(total, 1) : zOf(order, rank);
  const frameZ = overAll(total, 2);
  const id = card.splash.id;
  // The layer buttons: what each would do, on the pieces this one overlaps.
  const layers =
    active && stacking && !isPeriod(card.splash)
      ? {
          can: Object.fromEntries(
            (['forward', 'backward', 'front', 'back'] as const).map((how) => [
              how,
              stacking.move(id, how) !== null,
            ]),
          ) as Record<LayerMove, boolean>,
          move: (how: LayerMove): void => {
            const next = stacking.move(id, how);
            if (next !== null) editing!.edit({ piece: { layer: next } });
          },
        }
      : null;
  // A phone's toolbar leaves the layer buttons to More (review): offered
  // there while this piece is active, each move the latest one.
  const phone = metrics.width < HALF_WEEK_BELOW_PX;
  const offer = editing?.offerLayers;
  const layersNow = useRef<LayerControls | null>(layers);
  useEffect(() => {
    layersNow.current = layers;
  });
  const canKey = layers && phone ? JSON.stringify(layers.can) : null;
  useEffect(() => {
    if (canKey === null || !offer) return;
    offer({
      can: JSON.parse(canKey) as LayerControls['can'],
      move: (how) => layersNow.current?.move(how),
    });
    return () => offer(null);
  }, [canKey, offer]);

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
    // A photo's own box (its ratio, never cropped): its corner runs on that diagonal.
    sizeBox: (() => {
      if (selected?.kind !== 'photo') return undefined;
      const photo = piece.fan.find((p) => p.path === selected.path);
      return photo ? { w: photo.w, h: photo.h } : undefined;
    })(),
    labelW: label.w,
  };
  const period = isPeriod(card.splash);
  // Where the label's right edge is drawn: at the board's edge its width bar would be clipped.
  const labelRight =
    piece.x + label.x + (nudge(layout.label, layout.piece)?.x ?? 0) * metrics.column + label.w;
  const frame: ReactNode = selected ? (
    <PartFrame
      part={selected}
      values={partValues(layout, selected)}
      units={units}
      tools={period ? NO_TOOLS : TOOLS[selected.kind]}
      editing={editing!}
      widthInside={labelRight > metrics.width - 22}
      onHold={onHold}
      onHeld={setHeld}
      onPick={(part) => editing!.tap(card.splash.id, part)}
      ref={frameRef}
    />
  ) : null;
  const toolbar = toolbarAt(piece, nudge(layout.label, layout.piece), metrics, line);
  // The toolbar's tabs (review), in the panel's order: Label, Icon (inline
  // or a sticker), each photo and video by the order they were added. A
  // hidden part keeps its tab under its own name, struck through (0055).
  // No wave (H41): a stored one is kept and not drawn.
  const media = (card.allPhotos ?? card.photos ?? []).filter(
    (m) => layout.photos?.[m.path]?.hidden === true || piece.fan.some((f) => f.path === m.path),
  );
  let photoAt = 0;
  let videoAt = 0;
  const parts: PartChip[] = active
    ? [
        // All first (H41): the whole piece, its move and its layers.
        { part: PIECE_PART, name: 'All' },
        ...(piece.compact && piece.captionLines === 0 && !labelHidden(layout)
          ? []
          : [{ part: LABEL_PART, name: 'Label', hidden: labelHidden(layout) }]),
        ...(icon ? [{ part: { kind: 'icon' } as const, name: 'Icon', hidden: hideIcon }] : []),
        ...media.map((m) => ({
          part: { kind: 'photo', path: m.path } as const,
          name: m.video ? `Video ${++videoAt}` : `Photo ${++photoAt}`,
          hidden: layout.photos?.[m.path]?.hidden === true,
        })),
      ]
    : [];
  // Its part chips too, for More on a phone when the toolbar's row is out of sight.
  useOffered(active && phone ? parts : null, editing?.offerParts);
  // The selected part's frame, over every piece: placed and turned exactly as
  // the part, so its outline and handles are never covered, while the part
  // itself keeps its place in the order.
  const overlay = (): ReactNode => {
    if (!selected) return null;
    if (selectedHidden) {
      // Where it would be: its own box where it still has one, else the piece's.
      const whole = { x: 0, y: 0, w: piece.w, h: piece.h };
      const ghost =
        selected.kind === 'label'
          ? label.h > 0
            ? label
            : whole
          : selected.kind === 'icon'
            ? (piece.stickerBox ?? {
                x: label.x + piece.pad.left,
                y: label.y + piece.pad.top,
                w: line,
                h: line,
              })
            : (piece.photoBox ?? whole);
      return (
        <span
          aria-hidden
          data-edit-ghost={selected.kind}
          className="pointer-events-none absolute rounded-sm outline-2 outline-offset-1 outline-white/80 outline-dashed"
          style={{
            ...placed(ghost),
            transform: moveOf(layout.piece, metrics.column, line),
            zIndex: frameZ,
          }}
        />
      );
    }
    // An inline icon is outlined in the label, no handles.
    if (selected.kind === 'icon' && !piece.stickerBox) return null;
    if (selected.kind === 'piece') {
      // All (H41): around every part shown, as each is moved and turned; a
      // drag anywhere inside moves them together.
      const area = piece.photoBox;
      const turned = (box: Box, set: { x?: number; y?: number; tilt?: number } | undefined) => ({
        box,
        move: { x: (set?.x ?? 0) * metrics.column, y: (set?.y ?? 0) * line },
        tilt: set?.tilt,
      });
      const whole = boundsOf([
        ...(hideLabel || label.h === 0 ? [] : [turned(label, nudge(layout.label, layout.piece))]),
        ...(sticker ? [turned(piece.stickerBox!, nudge(layout.icon, layout.piece))] : []),
        ...(area
          ? piece.fan.map((photo) =>
              turned(
                { x: area.x + photo.x, y: area.y + photo.y, w: photo.w, h: photo.h },
                nudge(photoMove(layout.photos?.[photo.path], photo), layout.piece),
              ),
            )
          : []),
      ]);
      if (!whole) return null;
      return (
        <span
          aria-hidden
          data-edit-overlay="piece"
          className="pointer-events-none absolute"
          style={{ ...placed(whole), zIndex: frameZ }}
        >
          {frame}
        </span>
      );
    }
    const local =
      selected.kind === 'label'
        ? label
        : selected.kind === 'icon'
          ? piece.stickerBox
          : (() => {
              const photo = piece.fan.find((p) => p.path === selected.path);
              const area = piece.photoBox;
              return photo && area
                ? {
                    x: area.x + photo.x,
                    y: area.y + photo.y,
                    w: photo.w,
                    h: photo.h,
                  }
                : null;
            })();
    if (!local) return null;
    const set =
      selected.kind === 'label'
        ? layout.label
        : selected.kind === 'icon'
          ? layout.icon
          : (() => {
              const photo = piece.fan.find((p) => p.path === selected.path);
              const set = layout.photos?.[selected.path];
              return photo ? photoMove(set, photo) : set;
            })();
    return (
      <span
        aria-hidden
        data-edit-overlay={selected.kind}
        className="pointer-events-none absolute"
        style={{
          ...placed(local),
          transform: moveOf(nudge(set, layout.piece), metrics.column, line),
          zIndex: frameZ,
        }}
      >
        {frame}
      </span>
    );
  };
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
        style={{ zIndex: zOf(order, rankOf('label')) }}
      />
      {/* What is drawn takes the tap, where a layout put it (review): the
          label, the sticker and each photo; the gaps between them do not. */}
      <div
        aria-hidden
        data-board-hits
        className="pointer-events-none absolute inset-0"
        onClick={tap}
        onPointerDown={active ? onPartDown : undefined}
      >
        {piece.photoBox ? (
          <span
            data-board-photos
            className={`absolute z-[1] block ${fade} ${moving}`}
            style={{
              ...placed(piece.photoBox),
              zIndex: zFor(photoRank, 'photo'),
              ...stillIf('photo'),
            }}
          >
            {fanDrawn.map((photo, at) => (
              <PhotoCardView
                key={photo.path}
                photo={photo}
                url={photos[photo.path]}
                play={videoPlay}
                more={at === top ? piece.morePhotos : 0}
                moved={moveOf(
                  nudge(photoMove(layout.photos?.[photo.path], photo), layout.piece),
                  metrics.column,
                  line,
                )}
              />
            ))}
          </span>
        ) : null}
        {/* A phone's month (review): no label, no words, no faces — but the
            label's one line when it is all there is to show (0055). Hidden
            by hand, no label at all (0055). */}
        {hideLabel ? null : (
          <span
            data-board-label
            className={`pointer-events-auto absolute z-[1] block cursor-pointer ${LABEL_CLASS[piece.label]} ${fade} ${moving}`}
            data-reading-outline={reading && still ? '' : undefined}
            style={{
              ...placed(label),
              transform: moveOf(nudge(layout.label, layout.piece), metrics.column, line),
              zIndex: zFor(rankOf('label'), 'label'),
              ...stillIf('label'),
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
              {piece.inlineIcon && icon && !hideIcon ? (
                // Held to the words' line, so it never stretches it (review).
                <span
                  aria-hidden
                  data-board-icon
                  className={`mr-1 inline-block h-[var(--line)] align-top leading-[var(--line)] ${NO_INDENT}`}
                  // Inline it only turns, in its place on the line (review: icon tilt).
                  data-edit-inline-icon={
                    selected?.kind === 'icon' && !selectedHidden ? '' : undefined
                  }
                  style={{
                    ...(layout.icon?.tilt ? { transform: `rotate(${layout.icon.tilt}deg)` } : {}),
                    // The Icon tab on an inline icon (review): outlined where it stands.
                    ...(selected?.kind === 'icon' && !selectedHidden
                      ? {
                          outline: '2px solid var(--color-white)',
                          outlineOffset: 1,
                          borderRadius: 2,
                        }
                      : {}),
                  }}
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
          </span>
        )}
        {reading && !still ? (
          // Out from the sticker, or the front of the label when the icon is inline.
          // Moved and turned exactly as what it rings: the sticker, or the label
          // whose front holds an inline icon.
          // From the icon; with the icon hidden, the front of the label; with
          // the label hidden too, the top photo's centre (0055).
          !sticker && hideLabel && piece.photoBox && fanDrawn.length > 0 ? (
            (() => {
              const front = fanDrawn[fanDrawn.length - 1];
              const box = {
                x: piece.photoBox.x + front.x,
                y: piece.photoBox.y + front.y,
                w: front.w,
                h: front.h,
              };
              return (
                <ReadingRipple
                  key={ripple}
                  box={box}
                  transform={moveOf(
                    nudge(photoMove(layout.photos?.[front.path], front), layout.piece),
                    metrics.column,
                    line,
                  )}
                  ring={{ x: 0, y: 0, w: box.w, h: box.h }}
                  z={zOf(order, RING_RANK)}
                />
              );
            })()
          ) : (
            <ReadingRipple
              key={ripple}
              box={sticker ? piece.stickerBox! : label}
              transform={
                sticker
                  ? moveOf(nudge(layout.icon, layout.piece), metrics.column, line)
                  : moveOf(nudge(layout.label, layout.piece), metrics.column, line)
              }
              ring={
                sticker
                  ? { x: 0, y: 0, w: piece.stickerBox!.w, h: piece.stickerBox!.h }
                  : { x: piece.pad.left, y: piece.pad.top, w: piece.type.line, h: piece.type.line }
              }
              z={zOf(order, RING_RANK)}
            />
          )
        ) : null}
        {sticker ? (
          <span
            aria-hidden
            data-board-sticker
            data-size={piece.stickerSize ?? undefined}
            data-at={piece.stickerAt ?? undefined}
            // Over its own label and any other (review).
            className={`pointer-events-auto absolute z-[2] flex cursor-pointer items-center justify-center leading-none ${fade} ${moving}`}
            style={{
              ...placed(piece.stickerBox!),
              fontSize: piece.stickerBox!.w,
              transform: moveOf(nudge(layout.icon, layout.piece), metrics.column, line),
              zIndex: zFor(rankOf('icon'), 'icon'),
              ...stillIf('icon'),
            }}
          >
            {icon}
          </span>
        ) : piece.compact && piece.stickerBox && !hideIcon ? (
          // No lane to take an emoji from: a compact post is still something to tap.
          <span
            aria-hidden
            data-board-sticker
            data-board-dot
            className={`pointer-events-auto absolute flex cursor-pointer items-center justify-center ${fade} ${moving}`}
            style={{ ...placed(piece.stickerBox), zIndex: zFor(rankOf('icon'), 'icon') }}
          >
            <span className="block h-2 w-2 rounded-full bg-white" />
          </span>
        ) : null}
        {overlay()}
      </div>
      {active ? (
        <EditToolbar
          editing={editing!}
          // Row 2 is the selected part's own (review): a hidden part's eye alone.
          fontSize={selected?.kind === 'label' && !selectedHidden ? piece.type.size : null}
          labelStyle={
            selected?.kind === 'label' && !selectedHidden
              ? { set: layout.label?.style, drawn: piece.label }
              : null
          }
          eye={eyeOf(selected, layout, card.photos?.length ?? 0, editing!)}
          // Icon inline, the Icon tab's (review): on, the icon before the
          // title; off, a sticker. As drawn; a photo's caption keeps it inline.
          iconInline={
            selected?.kind === 'icon' && !selectedHidden && !piece.compact && piece.recipe !== 'C'
              ? { on: piece.inlineIcon }
              : null
          }
          layers={layers}
          parts={parts}
          partKind={selected?.kind ?? null}
          phone={phone}
          // A phone's is docked to the screen's foot (H41); a desktop's under the label.
          seat={toolbar.seat}
          style={{ top: toolbar.top, zIndex: overAll(total, 3), maxWidth: metrics.width }}
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
          z={zOf(order, SLOT_RANK)}
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
  metrics,
  onPick,
  ripple,
  editing = null,
}: Shared & { tape: BoardTape }) {
  const { card } = tape;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  // Set by hand (0047): label and icon, offsets measured across the
  // band's full width — X a share of it, Y in lines — the whole piece's
  // offset added, as on any piece.
  const layout = card.layout ?? {};
  const size = layout.label?.fontSize ?? tape.size;
  const line = size + 3;
  const label = nudge(layout.label, layout.piece);
  const iconSet = layout.icon;
  // Being edited by hand (review): a range along its days takes its text size
  // alone; a band across Members its label and icon (0047), as the panel says.
  const active = editing !== null && editing.activeId === tape.id;
  const period = isPeriod(card.splash);
  const selected = active ? tapeSelected(editing.part, layout) : null;
  const tap = (event: React.MouseEvent): void => {
    if (editing) editing.tap(card.splash.id, partAt(event.target));
    else onPick(card.splash.id);
  };
  const frameOf = (kind: 'label' | 'icon'): ReactNode =>
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
        // A band's width is its days' or the row's (review): no width handle.
        tools={period ? NO_TOOLS : { ...TOOLS[kind], width: false }}
        editing={editing!}
        origin={kind === 'label' ? 'left' : 'center'}
        onPick={(part) => editing!.tap(tape.id, part)}
      />
    ) : null;
  // A band's part chips (review): not on a range along its days, which takes its text size alone.
  const parts: PartChip[] =
    active && !period
      ? [
          { part: LABEL_PART, name: 'Label' },
          ...(icon && layout.icon?.inline === false
            ? [{ part: { kind: 'icon' } as const, name: 'Icon' }]
            : []),
        ]
      : [];
  useOffered(
    metrics.width < HALF_WEEK_BELOW_PX && parts.length > 0 ? parts : null,
    editing?.offerParts,
  );
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
        <button
          type="button"
          onClick={tap}
          aria-label={caption}
          data-board-pick={tape.id}
          data-board-band
          // label-pale (H55): solid on the dark ground, Outline on the light ones.
          className="label-pale absolute inset-0 flex items-center gap-1 bg-white/20 px-2 text-left font-medium text-white"
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
          {/* A phone's month (review): the band and its icon, no words, no faces. */}
          {tape.compact ? null : <span className="min-w-0 truncate">{caption}</span>}
          {/* Over the band the water reads as the joint surface: the faces' ring takes it. */}
          {!tape.compact && (card.joint || card.together) ? (
            <Faces card={card} ring="ring-joint" />
          ) : null}
          {frameOf('label')}
        </button>
      </div>
      {active ? (
        <EditToolbar
          editing={editing!}
          fontSize={selected?.kind === 'label' ? size : null}
          parts={parts}
          partKind={selected?.kind ?? null}
          phone={metrics.width < HALF_WEEK_BELOW_PX}
          // Within the board, as a piece's (its canvas is the band's container); a phone's docked.
          seat={{ x: tape.x, align: 'left', min: 0, max: metrics.width }}
          style={{ top: tape.y + tape.h + 10, maxWidth: metrics.width }}
        />
      ) : null}
    </>
  );
}

/** Offers a value to the board's editing while it is not null (JSON data), taking it back after. */
function useOffered<T>(value: T | null, offer: ((value: T | null) => void) | undefined): void {
  const key = value === null ? null : JSON.stringify(value);
  useEffect(() => {
    if (key === null || !offer) return;
    offer(JSON.parse(key) as T);
    return () => offer(null);
  }, [key, offer]);
}

/** Which handles each part has (review): the label moves, turns and widens, its text size the toolbar's. */
const TOOLS: Record<BoardPart['kind'], Tools> = {
  // All (H41): moved as one, never turned or sized.
  piece: { move: true, rotate: false, size: false, width: false },
  label: { move: true, rotate: true, size: false, width: true },
  icon: { move: true, rotate: true, size: true, width: false },
  photo: { move: true, rotate: true, size: true, width: false },
};

/** The part asked for, when the piece has it as its own: a sticker, a photo shown; else its label. */
function pieceSelected(
  part: BoardPart,
  piece: BoardPiece,
  layout: BoardLayoutJson,
  hasIcon: boolean,
): BoardPart {
  const sticker = piece.stickerBox && hasIcon && !iconHidden(layout);
  if (part.kind === 'piece') return part;
  // A hidden part stays selected (review): its tab, its dashed place, its eye.
  if (part.kind === 'label' && labelHidden(layout)) return part;
  if (part.kind === 'icon' && hasIcon && iconHidden(layout)) return part;
  if (part.kind === 'photo' && layout.photos?.[part.path]?.hidden === true) return part;
  // The icon, a sticker or inline in the label (its outline, no handles).
  if (part.kind === 'icon' && (sticker || (hasIcon && piece.inlineIcon))) return part;
  if (part.kind === 'photo' && piece.fan.some((p) => p.path === part.path)) return part;
  // What is hidden is never selected (0055): the label, else the icon, else the top photo.
  if (!labelHidden(layout) && !(piece.compact && piece.captionLines === 0)) return LABEL_PART;
  if (sticker) return { kind: 'icon' };
  const front = piece.fan[piece.fan.length - 1];
  return front ? { kind: 'photo', path: front.path } : LABEL_PART;
}

/**
 * The selected part's eye (0058): hides it from the board, as its switch in
 * the panel does; the last of photos, icon and label shown keeps it, the
 * eye disabled ("Keep at least one").
 */
function eyeOf(
  selected: BoardPart | null,
  layout: BoardLayoutJson,
  photosShown: number,
  editing: BoardEditing,
): ToolbarEye | null {
  if (!selected) return null;
  const shown = photosShown + (iconHidden(layout) ? 0 : 1) + (labelHidden(layout) ? 0 : 1);
  const last = shown <= 1;
  const eye = (name: string, hidden: boolean, set: (hidden: boolean) => BoardLayoutJson) => ({
    name,
    hidden,
    // Showing is always allowed; hiding the last of photos, icon and label is not.
    disabled: !hidden && last,
    toggle: () => editing.edit(set(!hidden)),
  });
  switch (selected.kind) {
    // The whole piece is never hidden (H41): its row is its layers.
    case 'piece':
      return null;
    case 'label':
      return eye('Label', labelHidden(layout), (hidden) => ({ label: { hidden } }));
    case 'icon':
      return eye('Icon', iconHidden(layout), (hidden) => ({ icon: { hidden } }));
    case 'photo':
      return eye(
        selected.path.startsWith('yt:') ? 'Video' : 'Photo',
        layout.photos?.[selected.path]?.hidden === true,
        (hidden) => ({ photos: { [selected.path]: { hidden } } }),
      );
  }
}

/** A band's: its icon once it is set apart from the words (Inline off); else its label. */
function tapeSelected(part: BoardPart, layout: BoardLayoutJson): BoardPart {
  if (part.kind === 'icon' && layout.icon?.inline === false) return part;
  return LABEL_PART;
}

/**
 * The toolbar's seat (review): under the label as it is moved — below its
 * own handles — towards the board's middle, and never past
 * the board's edges (a phone's half week put it off the left one).
 */
function toolbarAt(
  piece: BoardPiece,
  moved: { x?: number; y?: number } | undefined,
  metrics: BoardMetrics,
  line: number,
): { top: number; seat: ToolbarSeat } {
  const box = piece.labelBox;
  const x = box.x + (moved?.x ?? 0) * metrics.column;
  const top = box.y + (moved?.y ?? 0) * line + box.h + 26;
  const within = { min: -piece.x, max: metrics.width - piece.x };
  return {
    top,
    seat:
      piece.x + x + box.w / 2 > metrics.width / 2
        ? { x: x + box.w, align: 'right', ...within }
        : { x, align: 'left', ...within },
  };
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

/**
 * Someone else's record on a shared image (H63): its label's box in its
 * label's fill, where the layout puts it and as a hand moved it, and nothing
 * else — no words, icon, photos or faces. A label with no fill takes a
 * band's pale one, so the shape is there to see. A compact month's piece is
 * its sticker, so the shape is a disc.
 */
export function ShapePieceView({ piece, metrics }: { piece: BoardPiece; metrics: BoardMetrics }) {
  const layout = piece.card.layout ?? {};
  const box = piece.compact ? (piece.stickerBox ?? piece.labelBox) : piece.labelBox;
  const fill = piece.label === 'none' ? 'pale' : piece.label;
  return (
    <div
      data-board-shape={piece.id}
      aria-hidden
      className="absolute"
      style={{ left: piece.x, top: piece.y, width: piece.w, height: piece.h }}
    >
      <span
        className={`absolute block ${LABEL_CLASS[fill]} ${piece.compact ? 'rounded-full' : ''} ${piece.muted ? 'opacity-50' : ''}`}
        style={{
          ...placed(box),
          transform: moveOf(nudge(layout.label, layout.piece), metrics.column, piece.type.line),
        }}
      />
    </div>
  );
}

/** Someone else's ranged record on a shared image (H63): the band alone, no icon, no words. */
export function ShapeTapeView({ tape }: { tape: BoardTape }) {
  return (
    <div
      data-board-shape={tape.id}
      aria-hidden
      className={`label-pale absolute bg-white/20 ${tape.muted ? 'opacity-50' : ''}`}
      style={placed(tape)}
    />
  );
}
