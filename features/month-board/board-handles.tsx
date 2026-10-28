'use client';

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  BringToFront,
  Check,
  Eye,
  EyeOff,
  MoreHorizontal,
  SendToBack,
  Type,
  Undo2,
} from 'lucide-react';

import { AXIS_LOCK_PX } from '@/components/ui/use-axis-lock';

import {
  alongTilt,
  angleOf,
  cornerPulled,
  LIMITS,
  moved,
  partPatch,
  resized,
  samePart,
  shareOf,
  stepFont,
  turned,
  widened,
  type BoardPart,
  type PartValues,
} from './handle-math';
import {
  AutoSwatch,
  ChosenDot,
  LabelSwatch,
  useLabelStyleNames,
  type LabelChoice,
} from './label-styles';
import { LABEL_STYLES, type LabelStyle } from './layout';
import type { LayerControls, LayerMove } from './stacking';
import type { BoardEditing, PartChip } from './use-board-editing';

/** Which handles a part has (review): the panel's own fields, no more. */
export type Tools = {
  move: boolean;
  rotate: boolean;
  size: boolean;
  /** A label's right edge: its width, the words rewrapping as it moves. */
  width: boolean;
};
export const NO_TOOLS: Tools = {
  move: false,
  rotate: false,
  size: false,
  width: false,
};

/** What a part's frame needs to turn pixels into its layout's units. */
export type FrameUnits = {
  /** X: a share of this many pixels. */
  column: number;
  /** Y: line heights of this many pixels. */
  line: number;
  /** A sticker's size is in these pixels (the board's line), a photo's in the lane's. */
  sizeUnit: number;
  /** The part's size in pixels, a corner's pull starts from (read once, as the finger goes down). */
  sizePx: number;
  /** The part's drawn box, whose diagonal a corner is pulled along; square at `sizePx` when absent. */
  sizeBox?: { w: number; h: number };
  /** The label's width in pixels: a width pull starts from it. */
  labelW: number;
};

type Kind = 'move' | 'rotate' | 'size' | 'width';
type Point = { x: number; y: number };
type Gesture = {
  kind: Kind;
  /** Everything the gesture reads, as it stood when the finger went down: never the part as drawn since. */
  start: PartValues;
  units: FrameUnits;
  from: Point;
  pivot: Point;
  /** The board's CSS scale: pointer pixels over it are layout pixels. */
  scale: number;
  pointers: Map<number, Point>;
  /** Two fingers: where they began, apart and at what angle. */
  pinch: { dist: number; angle: number } | null;
  moved: boolean;
  /** A size change holds a point of the part still: the piece keeps it there as it redraws. */
  holding: boolean;
};

/** A corner pull or a width pull begins after this much travel, then tracks the finger exactly. */
const SIZE_DEAD_PX = 4;

const HANDLE = 'pointer-events-auto absolute flex h-11 w-11 items-center justify-center';
const DOT = 'block h-3 w-3 rounded-full border border-main-900 bg-white';

/**
 * Where the rotate handle stands off its part (review): above it, unless
 * that spot lies on another part of the same piece (or on the frame's own
 * size or width handle); then to its right, below, left. Its 44px seat
 * reaches outward from the part, the stem back to the outline.
 */
type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
const ROTATE_AT: Record<Side, string> = {
  top: '-top-11 left-1/2 -translate-x-1/2',
  right: '-right-11 top-1/2 -translate-y-1/2',
  bottom: '-bottom-11 left-1/2 -translate-x-1/2',
  left: '-left-11 top-1/2 -translate-y-1/2',
};
const STEM_AT: Record<Side, string> = {
  top: 'top-1/2 left-1/2 h-[22px] w-px -translate-x-1/2',
  bottom: 'bottom-1/2 left-1/2 h-[22px] w-px -translate-x-1/2',
  right: 'right-1/2 top-1/2 h-px w-[22px] -translate-y-1/2',
  left: 'left-1/2 top-1/2 h-px w-[22px] -translate-y-1/2',
};
/** The handle's seat, and whether it is clear of the piece's other parts. */
type Seat = { side: Side; clear: boolean };

/** Every part a piece or band draws: what a rotate handle keeps off. */
const PARTS =
  '[data-board-label], [data-board-sticker], [data-board-photo-card], [data-board-band], [data-band-icon]';

/** The element(s) a part is drawn as. */
function selectorOf(part: BoardPart): string {
  // The whole piece is none of its parts: each of them is another.
  if (part.kind === 'piece') return ':not(*)';
  if (part.kind === 'label') return '[data-board-label], [data-board-band]';
  if (part.kind === 'icon') return '[data-board-sticker], [data-band-icon]';
  return `[data-board-photo-card="${part.path.replace(/["\\]/g, '\\$&')}"]`;
}

/**
 * The other parts of the piece `from` sits in: never the part itself, nor
 * what holds it or what it holds (a band's icon sits inside its label).
 */
export function siblingParts(from: Element, part: BoardPart): Element[] {
  const piece = from.closest('[data-board-piece], [data-board-tape]');
  if (!piece) return [];
  const own = [...piece.querySelectorAll(selectorOf(part))];
  return [...piece.querySelectorAll(PARTS)].filter(
    (el) =>
      !el.matches(selectorOf(part)) &&
      !el.contains(from) &&
      !own.some((o) => el.contains(o) || o.contains(el)),
  );
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  // Touching edges are not overlapping: the seat starts on the outline.
  const EPS = 0.5;
  return (
    a.width > 0 &&
    a.height > 0 &&
    b.width > 0 &&
    b.height > 0 &&
    a.left < b.right - EPS &&
    b.left < a.right - EPS &&
    a.top < b.bottom - EPS &&
    b.top < a.bottom - EPS
  );
}

/** The first side whose seat, as drawn (turned with the part), lies on none of the obstacles. */
function seatFor(frame: HTMLElement, part: BoardPart): Seat {
  const rects = (els: Element[]): DOMRect[] => els.map((el) => el.getBoundingClientRect());
  const own = rects(
    [...frame.querySelectorAll('[data-edit-handle]')].filter(
      (h) => h.getAttribute('data-edit-handle') !== 'rotate',
    ),
  );
  const others = rects(siblingParts(frame, part));
  const free = (side: Side, against: DOMRect[]): boolean => {
    const probe = frame.querySelector(`[data-edit-probe="${side}"]`);
    if (!probe) return false;
    const r = probe.getBoundingClientRect();
    return against.every((o) => !overlaps(r, o));
  };
  const clear = SIDES.find((side) => free(side, [...own, ...others]));
  if (clear) return { side: clear, clear: true };
  return { side: SIDES.find((side) => free(side, own)) ?? 'top', clear: false };
}

/** The part of the piece under a point, other than `part`: where a tap on the handle lands. */
function siblingAt(from: Element, part: BoardPart, x: number, y: number): Element | null {
  const siblings = siblingParts(from, part);
  const stack =
    typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [];
  for (const el of stack) {
    const hit = siblings.find((s) => s === el || s.contains(el));
    if (hit) return hit;
  }
  return null;
}

/** What a tap on the board is on when it lets an active piece go: none of these. */
export const ON_PIECE =
  '[data-board-piece], [data-board-tape], [data-edit-toolbar], [data-board-slot]';

/** A tap on a piece names the part it landed on: a photo, the sticker, else the label. */
export function partAt(target: EventTarget | null): BoardPart {
  const el = target instanceof Element ? target : null;
  const photo = el?.closest<HTMLElement>('[data-board-photo-card]');
  if (photo) return { kind: 'photo', path: photo.dataset.boardPhotoCard! };
  if (el?.closest('[data-board-sticker], [data-band-icon]')) return { kind: 'icon' };
  return { kind: 'label' };
}

/** The board's CSS scale where this element sits: its unturned room's drawn width over its own. */
function scaleAt(el: Element | null): number {
  const room = el?.closest<HTMLElement>('[data-board-canvas], [data-lane-pieces]');
  if (!room || room.offsetWidth === 0) return 1;
  const drawn = room.getBoundingClientRect().width / room.offsetWidth;
  return Number.isFinite(drawn) && drawn > 0 ? drawn : 1;
}

/**
 * The selected part's frame (review): a thin white outline drawn inside the
 * part itself, so it moves and turns exactly as the part does; the body
 * drags it, a round handle above turns it, a corner sizes it, a label's
 * right edge widens it. On a phone two fingers
 * pinch and twist it, the second landing anywhere. Every pull is read from
 * a snapshot taken as the finger went down; a size change asks the piece to
 * hold the part's top-left (or a pinch's midpoint) where it was. While a
 * finger is down only the screen changes; letting go saves once.
 */
/** A frame's move, started by its piece from a pointer down on the selected part itself. */
export type FrameHandle = { beginMove: (event: React.PointerEvent) => void };

export function PartFrame({
  part,
  values,
  units,
  tools,
  editing,
  origin = 'center',
  widthInside = false,
  onHold,
  onHeld,
  onPick,
  ref,
}: {
  part: BoardPart;
  /** The part's hand-set values as drawn now. */
  values: PartValues;
  units: FrameUnits;
  tools: Tools;
  editing: Pick<BoardEditing, 'hold' | 'commit'>;
  /** The part's transform origin: its centre, or (a band) its left edge's middle. */
  origin?: 'center' | 'left';
  /** The label reaches the board's edge, which clips past it: its width bar sits just inside. */
  widthInside?: boolean;
  /** A size change begins (the point of the part to hold, as a share of it) or ends (null). */
  onHold?: (share: Point | null) => void;
  /** A handle is down (the part rises over every piece) or let go (it drops back). */
  onHeld?: (held: boolean) => void;
  /** Selects another part of the piece: a tap on the rotate handle over it (review). */
  onPick?: (part: BoardPart) => void;
  /**
   * Drawn over every piece, its body lets pointers through to what is
   * beneath — a sticker on the label's corner stays a tap away — and the
   * piece starts a move from the part itself through this.
   */
  ref?: Ref<FrameHandle>;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const pivotRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<HTMLSpanElement>(null);
  const brRef = useRef<HTMLSpanElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<PartValues | null>(null);
  // The latest of everything a gesture reads, without re-binding its listeners.
  const latest = useRef({ part, values, units, tools, editing, onHold, onHeld, onPick });
  useEffect(() => {
    latest.current = { part, values, units, tools, editing, onHold, onHeld, onPick };
  });
  // The rotate handle's seat, read from what is drawn each time it is drawn:
  // the piece's other parts move without this frame's props saying so. Set
  // only when it changes, so it settles in a pass.
  const [seat, setSeat] = useState<Seat>({ side: 'top', clear: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!tools.rotate || !root.current) return;
    const next = seatFor(root.current, part);
    setSeat((current) =>
      current.side === next.side && current.clear === next.clear ? current : next,
    );
  });
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);

  const send = (next: PartValues): void => {
    pending.current = { ...pending.current, ...next };
    if (frame.current !== null) return;
    // One draw a frame, however fast the finger.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const out = pending.current;
      pending.current = null;
      if (out) latest.current.editing.hold(partPatch(latest.current.part, out));
    });
  };
  const flush = (): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const out = pending.current;
    pending.current = null;
    if (out) latest.current.editing.hold(partPatch(latest.current.part, out));
  };

  const at = (el: HTMLElement | null): Point => {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top } : { x: 0, y: 0 };
  };

  const onMove = (event: PointerEvent): void => {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const { part: p, tools: t } = latest.current;
    const u = g.units;
    const points = [...g.pointers.values()];
    if (g.pinch && points.length >= 2) {
      const [a, b] = points;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const ratio = g.pinch.dist > 0 ? dist / g.pinch.dist : 1;
      const next: PartValues = { tilt: turned(g.start.tilt, g.pinch.angle, angleOf(a, b)) };
      // By the fingers' distance now over at the start, around their first midpoint.
      if (t.size && (p.kind === 'icon' || p.kind === 'photo'))
        next.size = resized(p.kind, u.sizePx, ratio, u.sizeUnit);
      g.moved = true;
      send(next);
      return;
    }
    const now = { x: event.clientX, y: event.clientY };
    const dx = now.x - g.from.x;
    const dy = now.y - g.from.y;
    const dead = g.kind === 'size' || g.kind === 'width' ? SIZE_DEAD_PX : AXIS_LOCK_PX;
    if (!g.moved && Math.hypot(dx, dy) < dead) return;
    g.moved = true;
    // Pointer pixels in the board's own (layout) pixels.
    const lx = dx / g.scale;
    const ly = dy / g.scale;
    switch (g.kind) {
      case 'move':
        send(moved(g.start, lx, ly, u.column, u.line));
        break;
      case 'rotate':
        send({ tilt: turned(g.start.tilt, angleOf(g.pivot, g.from), angleOf(g.pivot, now)) });
        break;
      case 'size':
        // The pulled corner under the finger, no smoothing; the piece holds the top-left.
        if (p.kind === 'icon' || p.kind === 'photo') {
          const px = cornerPulled(u.sizePx, lx, ly, g.start.tilt, 1, u.sizeBox);
          send({ size: resized(p.kind, px, 1, u.sizeUnit) });
        }
        break;
      case 'width':
        send({ width: widened(u.labelW, alongTilt(lx, ly, g.start.tilt), u.column) });
        break;
    }
  };

  const onUp = (event: PointerEvent): void => {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId)) return;
    // A finger lifted ends the gesture, pinch or not: one save a release.
    stop.current();
    latest.current.onHeld?.(false);
    const release = latest.current.onHold;
    // A tap on the rotate handle (under 8px) where it lies over another part
    // of the piece selects that part; only a drag turns (review).
    // So does a tap inside All's outline (H41): the part under it, its tab.
    const tapped =
      !g.moved &&
      (g.kind === 'rotate' || (g.kind === 'move' && latest.current.part.kind === 'piece'));
    if (tapped && root.current) {
      const under = siblingAt(root.current, latest.current.part, event.clientX, event.clientY);
      if (under) latest.current.onPick?.(partAt(under));
    }
    if (g.moved) {
      flush();
      latest.current.editing.commit();
    }
    // Held until the last size has been drawn and its place written with it.
    if (g.holding) requestAnimationFrame(() => release?.(null));
  };

  // A second finger, wherever it lands, makes the drag a pinch and a twist.
  const onSecond = (event: PointerEvent): void => {
    const g = gesture.current;
    if (!g || g.pointers.has(event.pointerId) || event.pointerType !== 'touch') return;
    if (g.pointers.size !== 1) return;
    const [a] = [...g.pointers.values()];
    const b = { x: event.clientX, y: event.clientY };
    g.pointers.set(event.pointerId, b);
    g.pinch = { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: angleOf(a, b) };
    // From where the first finger has taken it so far.
    g.start = { ...latest.current.values };
    g.units = { ...latest.current.units };
    const { tools: t, part: p } = latest.current;
    if (t.size && (p.kind === 'icon' || p.kind === 'photo')) {
      // Where the fingers' midpoint lies on the part, read once as they land.
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.holding = true;
      latest.current.onHold?.(shareOf(at(tlRef.current), at(brRef.current), mid));
    }
  };

  const begin = (kind: Kind, event: React.PointerEvent): void => {
    event.stopPropagation();
    // A second finger on the frame itself: stopped here, so it never reaches the window's.
    if (gesture.current) {
      onSecond(event.nativeEvent);
      return;
    }
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const holding = kind === 'size' || kind === 'width';
    gesture.current = {
      kind,
      start: { ...latest.current.values },
      units: { ...latest.current.units },
      from: { x: event.clientX, y: event.clientY },
      pivot: at(pivotRef.current),
      scale: scaleAt(root.current),
      pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]),
      pinch: null,
      moved: false,
      holding,
    };
    // A corner pulled or a width pulled holds the top-left where it is.
    if (holding) latest.current.onHold?.({ x: 0, y: 0 });
    latest.current.onHeld?.(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('pointerdown', onSecond);
    stop.current = () => {
      gesture.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointerdown', onSecond);
    };
  };

  useImperativeHandle(ref, () => ({
    beginMove: (event) => {
      if (latest.current.tools.move) begin('move', event);
    },
  }));

  // Its own taps do nothing more: never the piece's pick beneath.
  const swallow = (event: React.SyntheticEvent): void => event.stopPropagation();
  const still: CSSProperties = { touchAction: 'none' };

  return (
    <span
      ref={root}
      data-edit-frame={part.kind}
      data-edit-tools={Object.entries(tools)
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(' ')}
      onClick={swallow}
      onPointerDown={(event) => (tools.move ? begin('move', event) : swallow(event))}
      // All's outline takes a drag anywhere inside it (H41); a part's lets
      // pointers through, its move started from the part itself.
      className={`${part.kind === 'piece' ? 'pointer-events-auto cursor-move' : 'pointer-events-none'} absolute -inset-[3px] block outline outline-1 outline-white`}
      style={still}
    >
      <span
        ref={pivotRef}
        aria-hidden
        className="absolute h-0 w-0"
        style={origin === 'left' ? { left: 3, top: '50%' } : { left: '50%', top: '50%' }}
      />
      {/* The part's own corners (the outline sits 3px out): what a size change is read against. */}
      <span
        ref={tlRef}
        aria-hidden
        data-edit-corner="tl"
        className="absolute h-0 w-0"
        style={{ left: 3, top: 3 }}
      />
      <span
        ref={brRef}
        aria-hidden
        data-edit-corner="br"
        className="absolute h-0 w-0"
        style={{ right: 3, bottom: 3 }}
      />
      {tools.rotate ? (
        <>
          {/* Unseen seats, one a side, measured to choose where the handle stands. */}
          {SIDES.map((side) => (
            <span
              key={side}
              aria-hidden
              data-edit-probe={side}
              className={`pointer-events-none invisible absolute h-11 w-11 ${ROTATE_AT[side]}`}
            />
          ))}
          <span
            aria-hidden
            data-edit-rotate-seat={seat.side}
            data-clear={seat.clear ? '' : undefined}
            className={`pointer-events-none absolute flex h-11 w-11 items-center justify-center ${ROTATE_AT[seat.side]}`}
          >
            {/* A stem to the outline, so it reads as the frame's, not a mark on the water. */}
            <span aria-hidden className={`absolute bg-white ${STEM_AT[seat.side]}`} />
            <span
              data-edit-handle="rotate"
              aria-hidden
              onClick={swallow}
              onPointerDown={(event) => begin('rotate', event)}
              // 44px reaching outward from the part; where no side is clear of
              // the piece's other parts, no more than the dot itself.
              className={`pointer-events-auto relative flex cursor-grab items-center justify-center ${seat.clear ? 'h-11 w-11' : 'h-5 w-5'}`}
              style={still}
            >
              <span className={`${DOT} relative h-3.5 w-3.5`} />
            </span>
          </span>
        </>
      ) : null}
      {tools.size ? (
        <span
          data-edit-handle="size"
          aria-hidden
          onClick={swallow}
          onPointerDown={(event) => begin('size', event)}
          className={`${HANDLE} -right-[22px] -bottom-[22px] cursor-nwse-resize`}
          style={still}
        >
          <span className="border-main-900 block h-3 w-3 border bg-white" />
        </span>
      ) : null}
      {tools.width ? (
        <span
          data-edit-handle="width"
          data-inside={widthInside ? '' : undefined}
          aria-hidden
          onClick={swallow}
          onPointerDown={(event) => begin('width', event)}
          className={`${HANDLE} top-1/2 ${widthInside ? 'right-0' : '-right-[22px]'} -translate-y-1/2 cursor-ew-resize`}
          style={still}
        >
          <span className="border-main-900 block h-4 w-1.5 rounded-full border bg-white" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * The active piece's toolbar (review; H41): white over the water, three
 * rows — the parts as tabs with More at the right; the selected part's own
 * controls (All: the layers; the label: its eye, text size and style; the
 * icon: its eye and Icon inline; a photo or video: its eye); Undo at the
 * left, Done at the right with what the save is doing beside it. Near the
 * piece on a desktop; on a phone docked to the foot of the screen, the
 * board scrolled so the selected part stays above it.
 */

/** The label's style on the toolbar (0058): as set by hand, or unset (Auto), and as drawn. */
export type ToolbarStyle = { set: LabelChoice | undefined; drawn: LabelStyle };
/** The selected part's eye (0055, 0058): hide it, unless it is the last one shown; or show it again. */
export type ToolbarEye = { name: string; hidden: boolean; disabled: boolean; toggle: () => void };
/**
 * Where a toolbar starts or ends (`x`, by `align`) in its container's
 * pixels, kept between `min` and `max`: the board's edges there.
 */
export type ToolbarSeat = { x: number; align: 'left' | 'right'; min: number; max: number };

export function EditToolbar({
  editing,
  fontSize,
  layers = null,
  parts = [],
  seat = null,
  phone = false,
  style,
  labelStyle = null,
  eye = null,
  iconInline = null,
  partKind = null,
}: {
  editing: BoardEditing;
  /** The selected part's kind, as the piece draws it: where the layer buttons go. */
  partKind?: BoardPart['kind'] | null;
  /** While the label is selected: its style, for the swatch. */
  labelStyle?: ToolbarStyle | null;
  /** While a part is selected: its eye. */
  eye?: ToolbarEye | null;
  /** While the label or the icon is selected, on a post with an icon to set apart. */
  iconInline?: { on: boolean } | null;
  /** A phone's board (under 600px): docked, 44px taps, the layer buttons in More but All's. */
  phone?: boolean;
  /** The piece's parts, as chips that select one (review): shown when there is more than one. */
  parts?: PartChip[];
  /** Placed by its own width, within the board; else `style` places it. */
  seat?: ToolbarSeat | null;
  /** The label's text size as drawn, while the label is selected; else no stepper. */
  fontSize: number | null;
  /** The piece's layer moves (stacking.ts), each possible or not; none for a band along its days. */
  layers?: LayerControls | null;
  style: CSSProperties;
}) {
  // Cmd/Ctrl+] forward, Cmd/Ctrl+[ backward; with Shift, to the front and the back.
  const latest = useRef(layers);
  useEffect(() => {
    latest.current = layers;
  });
  const hasLayers = layers !== null;
  // Its own width, as drawn (it wraps on a phone), read each time it is
  // drawn; set only when it changes, so it settles in a pass.
  const bar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const w = bar.current?.offsetWidth ?? 0;
    if (w !== width) setWidth(w);
  });
  useDock(phone, bar, editing.activeId, editing.part);
  const left = seat
    ? Math.max(
        seat.min,
        Math.min(seat.align === 'right' ? seat.x - width : seat.x, seat.max - width),
      )
    : undefined;
  useEffect(() => {
    if (!hasLayers) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const up = event.code === 'BracketRight';
      if (!up && event.code !== 'BracketLeft') return;
      const how: LayerMove = up
        ? event.shiftKey
          ? 'front'
          : 'forward'
        : event.shiftKey
          ? 'back'
          : 'backward';
      // Never the browser's back or forward.
      event.preventDefault();
      if (latest.current?.can[how]) latest.current.move(how);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasLayers]);
  // A finger's taps on a phone, 44px; a pointer's on a desktop, 36px (review).
  const button = `flex ${phone ? 'h-11 min-w-11' : 'h-9 min-w-9'} items-center justify-center rounded-full px-1.5`;
  // Every row keeps its height whatever the part, so the bar never jumps.
  const row = `flex items-center ${phone ? 'h-11' : 'h-9'}`;
  // The parts as tabs (review): only for a piece of more than one part.
  const tabs =
    parts.length > 1 ? (
      <div
        data-edit-parts
        role="tablist"
        aria-label="Part"
        className="no-scrollbar border-ink/10 flex min-w-0 items-end overflow-x-auto border-b"
      >
        <PartChips parts={parts} editing={editing} tall={phone} muted="text-pool-500" tabs />
      </div>
    ) : null;
  const stepper =
    fontSize !== null ? (
      <div data-edit-text-size className="flex items-center" role="group" aria-label="Text size">
        <Type aria-hidden size={14} className={phone ? 'mx-1' : 'mx-1.5'} />
        <button
          type="button"
          aria-label="Smaller text"
          data-edit-text-smaller
          disabled={fontSize <= LIMITS.fontSize[0]}
          onClick={() => editing.edit({ label: { fontSize: stepFont(fontSize, -1) } })}
          className={`${button} disabled:opacity-20`}
        >
          −
        </button>
        <span data-edit-text-value className="w-5 text-center tabular-nums">
          {fontSize}
        </span>
        <button
          type="button"
          aria-label="Larger text"
          data-edit-text-larger
          disabled={fontSize >= LIMITS.fontSize[1]}
          onClick={() => editing.edit({ label: { fontSize: stepFont(fontSize, 1) } })}
          className={`${button} disabled:opacity-20`}
        >
          +
        </button>
      </div>
    ) : null;
  const swatch = labelStyle ? (
    <StyleSwatch labelStyle={labelStyle} editing={editing} button={button} phone={phone} />
  ) : null;
  const eyeButton = eye ? (
    <button
      type="button"
      aria-label={
        eye.disabled
          ? `${eye.name}: keep at least one`
          : `${eye.hidden ? 'Show' : 'Hide'} ${eye.name.toLowerCase()}`
      }
      aria-pressed={!eye.hidden}
      title={
        eye.disabled
          ? 'Keep at least one'
          : `${eye.hidden ? 'Show' : 'Hide'} ${eye.name.toLowerCase()}`
      }
      data-edit-eye={eye.hidden ? 'off' : 'on'}
      disabled={eye.disabled}
      onClick={eye.toggle}
      className={`${button} disabled:opacity-20`}
    >
      {eye.hidden ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
    </button>
  ) : null;
  // Icon inline (review): the icon before the title, or apart as a sticker;
  // the panel's Inline, the same field, undoable.
  const inlineToggle = iconInline ? (
    <button
      type="button"
      aria-pressed={iconInline.on}
      data-edit-icon-inline={iconInline.on ? 'on' : 'off'}
      onClick={() => editing.edit({ icon: { inline: !iconInline.on } })}
      className={`${button} gap-1.5 px-2.5`}
    >
      {/* Selection is ink (H20f). */}
      <span
        aria-hidden
        className={`flex h-4 w-7 items-center rounded-full p-0.5 ${
          iconInline.on ? 'bg-ink justify-end' : 'bg-pool-200 justify-start'
        }`}
      >
        <span className="h-3 w-3 rounded-full bg-white" />
      </span>
      Icon inline
    </button>
  ) : null;
  // The four layer moves (H41): All's own row on every width; for another
  // part a desktop's, after its controls — or, the label's row being full,
  // in the last row between Undo and Done — and a phone's in More.
  const whole = partKind === 'piece';
  const layerGroup = layers ? (
    <div data-edit-layers className="flex items-center" role="group" aria-label="Layer">
      <LayerButtons layers={layers} className={`${button} disabled:opacity-20`} />
    </div>
  ) : null;
  const layersInRow = whole || (!phone && partKind !== 'label') ? layerGroup : null;
  const layersInActions = !whole && !phone && partKind === 'label' ? layerGroup : null;
  const toolbar = (
    <div
      ref={bar}
      data-edit-toolbar
      data-phone={phone ? '' : undefined}
      data-docked={phone ? '' : undefined}
      role="toolbar"
      aria-label="Layout"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      // A white bar on the ground stays white with ink (0032). Three rows, on
      // every width: the parts and More, the selected part's own controls,
      // Undo to Done. On a phone docked to the screen's foot, full width,
      // clear of the home indicator (H41).
      className={`surface text-ink pointer-events-auto flex flex-col bg-white px-1 text-xs font-medium whitespace-nowrap ${
        phone
          ? 'fixed inset-x-0 bottom-0 z-30 rounded-t-[20px] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_16px_rgba(0,0,0,0.15)]'
          : 'absolute w-max rounded-[20px] shadow-md'
      }`}
      style={phone ? undefined : left === undefined ? style : { ...style, left }}
    >
      <div data-edit-tab-row className={`${row} min-w-0`}>
        <div className="flex min-w-0 flex-1 self-stretch">{tabs}</div>
        <button
          type="button"
          aria-label="More"
          data-edit-more
          onClick={editing.more}
          className={`${button} shrink-0`}
        >
          <MoreHorizontal aria-hidden size={16} />
        </button>
      </div>
      {/* What applies to the selected part, nothing greyed in its place. */}
      <div data-edit-part-row className={`${row} min-w-0`}>
        {eyeButton}
        {stepper}
        {swatch}
        {inlineToggle}
        {layersInRow}
      </div>
      <div data-edit-actions className={row}>
        <button
          type="button"
          aria-label="Undo"
          data-edit-undo
          disabled={!editing.canUndo}
          onClick={editing.undo}
          className={`${button} disabled:opacity-20`}
        >
          <Undo2 aria-hidden size={16} />
        </button>
        {layersInActions}
        <span className="flex-1" />
        {editing.status ? (
          <span
            role="status"
            data-edit-status={editing.status}
            className="text-pool-500 pr-1 pl-2 text-[10px]"
          >
            {editing.status === 'saving' ? 'Saving…' : 'Saved'}
          </span>
        ) : null}
        <button
          type="button"
          data-edit-done
          onClick={editing.deactivate}
          className={`${button} text-main-900 gap-1 px-2.5 font-semibold`}
        >
          <Check aria-hidden size={14} />
          Done
        </button>
      </div>
    </div>
  );
  // Docked, it leaves the board: over every piece, never inside one's stacking.
  return phone && typeof document !== 'undefined' ? createPortal(toolbar, document.body) : toolbar;
}

/** What a docked toolbar keeps between itself and the selected part. */
const DOCK_GAP_PX = 12;

/**
 * A phone's docked toolbar (H41): its height given to the board as room at
 * its foot (`--edit-dock`), so the last row can scroll clear of it, and the
 * board scrolled so the selected part — or the piece, where the part has no
 * outline of its own — stands above it, each time a piece or a part is
 * chosen; never while a part is dragged.
 */
function useDock(
  docked: boolean,
  bar: React.RefObject<HTMLDivElement | null>,
  activeId: string | null,
  part: BoardPart,
): void {
  useLayoutEffect(() => {
    const el = bar.current;
    if (!docked || !el) return;
    const root = document.documentElement;
    const set = (): void => root.style.setProperty('--edit-dock', `${el.offsetHeight}px`);
    set();
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    watch?.observe(el);
    return () => {
      watch?.disconnect();
      root.style.removeProperty('--edit-dock');
    };
  }, [docked, bar]);
  const partKey = JSON.stringify(part);
  useEffect(() => {
    const el = bar.current;
    if (!docked || !el || !activeId) return;
    const target =
      document.querySelector('[data-edit-overlay], [data-edit-ghost]') ??
      document.querySelector(`[data-board-piece="${activeId}"], [data-board-tape="${activeId}"]`);
    if (!target) return;
    let scroller = target.parentElement;
    while (
      scroller &&
      !(
        /(auto|scroll)/.test(getComputedStyle(scroller).overflowY) &&
        scroller.scrollHeight > scroller.clientHeight
      )
    )
      scroller = scroller.parentElement;
    if (!scroller) return;
    const box = target.getBoundingClientRect();
    const floor = el.getBoundingClientRect().top - DOCK_GAP_PX;
    const ceiling = scroller.getBoundingClientRect().top + DOCK_GAP_PX;
    // Its foot above the bar; a part taller than the room, its top in view.
    const by = box.height > floor - ceiling ? box.top - ceiling : box.bottom - floor;
    if (by <= 0 && box.top >= ceiling) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    scroller.scrollBy({ top: by, behavior: still ? 'auto' : 'smooth' });
  }, [docked, bar, activeId, partKey]);
}

/**
 * The label's style (0058): a swatch of the style as drawn; a tap opens the
 * four and Auto. A pick is drawn at once and saved after the rest, undoable,
 * as the stepper's is; Auto hands it back to the rule.
 */
function StyleSwatch({
  labelStyle,
  editing,
  button,
  phone,
}: {
  labelStyle: ToolbarStyle;
  editing: BoardEditing;
  button: string;
  phone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const names = useLabelStyleNames();
  const pick = (style: LabelChoice | undefined): void => {
    setOpen(false);
    if (style === undefined) editing.edit({}, ['label.style']);
    else editing.edit({ label: { style } });
  };
  // Every option keeps its own look; the chosen one has a dot under it (review).
  const choice = `flex ${phone ? 'h-11 min-w-11' : 'h-8 min-w-8'} items-center justify-center px-1.5`;
  return (
    <span className="relative flex">
      <button
        type="button"
        aria-label={`Label style: ${labelStyle.set ? names[labelStyle.set] : 'Auto'}`}
        aria-expanded={open}
        data-edit-style={labelStyle.set ?? 'auto'}
        onClick={() => setOpen((was) => !was)}
        className={button}
      >
        <LabelSwatch style={labelStyle.drawn} px={20} />
      </button>
      {open ? (
        <span
          role="menu"
          aria-label="Label style"
          data-edit-style-menu
          // A white card on the ground stays white (0032); the chosen one's dot is ink (H20f).
          // Centred on the swatch: under it on a desktop, above it on a phone's docked bar.
          className={`surface absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[20px] bg-white px-1 pt-1 pb-2 shadow-md ${
            phone ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={labelStyle.set === undefined}
            aria-label="Auto"
            title="Auto"
            data-edit-style-choice="auto"
            onClick={() => pick(undefined)}
            className={choice}
          >
            <span className="relative flex">
              <AutoSwatch px={20} />
              <ChosenDot on={labelStyle.set === undefined} />
            </span>
          </button>
          {LABEL_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              role="menuitemradio"
              aria-checked={labelStyle.set === style}
              aria-label={names[style]}
              title={names[style]}
              data-edit-style-choice={style}
              onClick={() => pick(style)}
              className={choice}
            >
              <span className="relative flex">
                <LabelSwatch style={style} px={20} />
                <ChosenDot on={labelStyle.set === style} />
              </span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The part chips (review): one per part of the active piece, the selected
 * one in ink (H20f), a tap selecting its part. The toolbar's, and More's on
 * a phone when the toolbar's row is out of sight; `tall`, a 44px tap.
 */
export function PartChips({
  parts,
  editing,
  tall,
  muted,
  tabs = false,
}: {
  parts: PartChip[];
  editing: Pick<BoardEditing, 'part' | 'activeId' | 'tap' | 'edit'>;
  tall: boolean;
  /** The unselected chips' text: muted on the white bar, on the water. */
  muted: string;
  /** The toolbar's (review): underlined tabs, the chosen one in ink; More keeps pills. */
  tabs?: boolean;
}) {
  return (
    <>
      {parts.map(({ part, name, hidden }) => {
        const on = samePart(part, editing.part);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={tabs ? undefined : on}
            aria-label={hidden ? `${name}, hidden` : undefined}
            data-edit-part-chip={name}
            data-edit-part-hidden={hidden ? '' : undefined}
            // A hidden part is selected as any other (review): its eye shows it again.
            onClick={() => editing.tap(editing.activeId!, part)}
            role={tabs ? 'tab' : undefined}
            aria-selected={tabs ? on : undefined}
            className={
              tabs
                ? `relative flex shrink-0 items-center px-2.5 ${tall ? 'h-11' : 'h-9'} ${
                    on ? 'text-ink' : muted
                  } ${hidden ? 'line-through' : ''}`
                : `flex shrink-0 items-center ${tall ? 'h-11' : 'h-8'}`
            }
          >
            {tabs ? (
              <>
                {name}
                {on ? (
                  <span
                    aria-hidden
                    className="bg-ink absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                  />
                ) : null}
              </>
            ) : (
              <span
                className={`flex h-7 items-center rounded-full px-2 ${
                  on ? 'bg-ink text-white' : muted
                } ${hidden ? 'line-through' : ''}`}
              >
                {name}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

/** The four layer moves as buttons: the toolbar's on a desktop, More's on a phone. */
export function LayerButtons({ layers, className }: { layers: LayerControls; className: string }) {
  return (
    <>
      {LAYER_BUTTONS.map(({ how, label, Icon }) => (
        <button
          key={how}
          type="button"
          aria-label={label}
          title={label}
          data-edit-layer={how}
          disabled={!layers.can[how]}
          onClick={() => layers.move(how)}
          className={className}
        >
          <Icon aria-hidden size={16} />
        </button>
      ))}
    </>
  );
}

/** The toolbar's layer buttons, in order (review): forward, backward, to the front, to the back. */
const LAYER_BUTTONS = [
  { how: 'forward', label: 'Bring forward', Icon: ArrowUp },
  { how: 'backward', label: 'Send backward', Icon: ArrowDown },
  { how: 'front', label: 'Bring to front', Icon: BringToFront },
  { how: 'back', label: 'Send to back', Icon: SendToBack },
] as const;
