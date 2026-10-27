'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { Check, MoreHorizontal, Type, Undo2 } from 'lucide-react';

import { AXIS_LOCK_PX } from '@/components/ui/use-axis-lock';

import {
  alongTilt,
  angleOf,
  clamp,
  cornerSized,
  heldAt,
  LIMITS,
  moved,
  partPatch,
  pointOn,
  resized,
  shareOf,
  spanned,
  spannedFromLeft,
  stepFont,
  turned,
  widened,
  type BoardPart,
  type PartValues,
} from './handle-math';
import type { BoardEditing } from './use-board-editing';

/** Which handles a part has (review): the panel's own fields, no more. */
export type Tools = {
  move: boolean;
  rotate: boolean;
  size: boolean;
  ends: boolean;
  /** A label's right edge: its width, the words rewrapping as it moves. */
  width: boolean;
};
export const NO_TOOLS: Tools = {
  move: false,
  rotate: false,
  size: false,
  ends: false,
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
  /** The part's size now, in pixels, a corner's pull starts from. */
  sizePx: number;
  /** The label's width in pixels: the wave's length is a share of it, and a width pull starts from it. */
  labelW: number;
};

type Kind = 'move' | 'rotate' | 'size' | 'width' | 'end-left' | 'end-right';
type Point = { x: number; y: number };
type Gesture = {
  kind: Kind;
  start: PartValues;
  from: Point;
  pivot: Point;
  pointers: Map<number, Point>;
  /** Two fingers: where they began, apart and at what angle. */
  pinch: { dist: number; angle: number } | null;
  moved: boolean;
  /** The box's corners on screen as the gesture began. */
  box: { tl: Point; br: Point };
  /**
   * A size change holds a point of the box still on screen (review): the
   * opposite corner for a corner pulled, the fingers' midpoint for a pinch.
   */
  pin: { share: Point; target: Point } | null;
};

/** A corner pull or a width pull begins after this much travel, then tracks the finger exactly. */
const SIZE_DEAD_PX = 4;
/** How many frames a release waits for the held point to settle before it saves. */
const SETTLE_FRAMES = 4;

const HANDLE = 'absolute flex h-11 w-11 items-center justify-center';
const DOT = 'block h-3 w-3 rounded-full border border-main-900 bg-white';

/** What a tap on the board is on when it lets an active piece go: none of these. */
export const ON_PIECE =
  '[data-board-piece], [data-board-tape], [data-edit-toolbar], [data-board-slot]';

/** A tap on a piece names the part it landed on: a photo, the sticker, the wave, else the label. */
export function partAt(target: EventTarget | null): BoardPart {
  const el = target instanceof Element ? target : null;
  const photo = el?.closest<HTMLElement>('[data-board-photo-card]');
  if (photo) return { kind: 'photo', path: photo.dataset.boardPhotoCard! };
  if (el?.closest('[data-board-sticker]')) return { kind: 'icon' };
  if (el?.closest('[data-board-wave], [data-edit-frame="wave"]')) return { kind: 'wave' };
  return { kind: 'label' };
}

/**
 * The selected part's frame (review): a thin white outline drawn inside the
 * part itself, so it moves and turns exactly as the part does; the body
 * drags it, a round handle above turns it, a corner sizes it, the wave's
 * ends lengthen it. On a phone two fingers pinch and twist it, the second
 * landing anywhere. While a finger is down only the screen changes; letting
 * go saves once. Its own touches never scroll the board.
 */
export function PartFrame({
  part,
  values,
  units,
  tools,
  editing,
  origin = 'center',
  widthInside = false,
}: {
  part: BoardPart;
  /** The part's hand-set values as drawn now. */
  values: PartValues;
  units: FrameUnits;
  tools: Tools;
  editing: Pick<BoardEditing, 'hold' | 'commit'>;
  /** The part's transform origin: its centre, or (a band, a wave) its left edge's middle. */
  origin?: 'center' | 'left';
  /** The label reaches the board's edge, which clips past it: its width bar sits just inside. */
  widthInside?: boolean;
}) {
  const pivotRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<HTMLSpanElement>(null);
  const brRef = useRef<HTMLSpanElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<PartValues | null>(null);
  // The latest of everything a gesture reads, without re-binding its listeners.
  const latest = useRef({ part, values, units, tools, editing });
  useEffect(() => {
    latest.current = { part, values, units, tools, editing };
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
  const pivotNow = (): Point => at(pivotRef.current);
  const boxNow = (): { tl: Point; br: Point } => ({ tl: at(tlRef.current), br: at(brRef.current) });

  /** How far the held point has drifted as drawn, taken back from the part's offset; null when still. */
  const pinFix = (g: Gesture): { x: number; y: number } | null => {
    if (!g.pin) return null;
    const { tl, br } = boxNow();
    const now = pointOn(tl, br, g.pin.share);
    const drift = { x: now.x - g.pin.target.x, y: now.y - g.pin.target.y };
    if (Math.hypot(drift.x, drift.y) < 0.5) return null;
    const { values: v, units: u } = latest.current;
    return heldAt(v, drift, u.column, u.line);
  };

  /** A size change let go: the held point settled over a frame or two, then one save. */
  const settle = (g: Gesture, left: number): void => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const fix = left > 0 ? pinFix(g) : null;
        if (fix) {
          latest.current.editing.hold(partPatch(latest.current.part, fix));
          settle(g, left - 1);
        } else latest.current.editing.commit();
      }),
    );
  };

  const onMove = (event: PointerEvent): void => {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const { part: p, units: u, tools: t } = latest.current;
    const points = [...g.pointers.values()];
    if (g.pinch && points.length >= 2) {
      const [a, b] = points;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const ratio = g.pinch.dist > 0 ? dist / g.pinch.dist : 1;
      const next: PartValues = { tilt: turned(g.start.tilt, g.pinch.angle, angleOf(a, b)) };
      // By the fingers' distance, around their midpoint as they began.
      if (t.size && (p.kind === 'icon' || p.kind === 'photo')) {
        next.size = resized(p.kind, u.sizePx, ratio, u.sizeUnit);
        Object.assign(next, pinFix(g));
      }
      if (p.kind === 'wave')
        next.span = clamp(Number(((g.start.span ?? 1) * ratio).toFixed(2)), LIMITS.span);
      g.moved = true;
      send(next);
      return;
    }
    const at = { x: event.clientX, y: event.clientY };
    const dx = at.x - g.from.x;
    const dy = at.y - g.from.y;
    const dead = g.kind === 'size' || g.kind === 'width' ? SIZE_DEAD_PX : AXIS_LOCK_PX;
    if (!g.moved && Math.hypot(dx, dy) < dead) return;
    g.moved = true;
    switch (g.kind) {
      case 'move':
        send(moved(g.start, dx, dy, u.column, u.line));
        break;
      case 'rotate':
        send({ tilt: turned(g.start.tilt, angleOf(g.pivot, g.from), angleOf(g.pivot, at)) });
        break;
      case 'size': {
        // The opposite corner held, the pulled one under the finger: no smoothing.
        if (p.kind === 'icon' || p.kind === 'photo') {
          const px = cornerSized(u.sizePx, g.box.tl, g.box.br, { x: dx, y: dy });
          send({ size: resized(p.kind, px, 1, u.sizeUnit), ...pinFix(g) });
        }
        break;
      }
      case 'width':
        send({ width: widened(u.labelW, alongTilt(dx, dy, g.start.tilt), u.column) });
        break;
      case 'end-right':
        send({ span: spanned(g.start.span ?? 1, alongTilt(dx, dy, g.start.tilt), u.labelW) });
        break;
      case 'end-left':
        send(
          spannedFromLeft(
            { ...g.start, span: g.start.span ?? 1 },
            alongTilt(dx, dy, g.start.tilt),
            u.labelW,
            u.column,
            u.line,
          ),
        );
        break;
    }
  };

  const onUp = (event: PointerEvent): void => {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId)) return;
    // A finger lifted ends the gesture, pinch or not: one save a release.
    stop.current();
    if (!g.moved) return;
    flush();
    if (g.pin) settle(g, SETTLE_FRAMES);
    else latest.current.editing.commit();
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
    const { tools: t, part: p } = latest.current;
    if (t.size && (p.kind === 'icon' || p.kind === 'photo')) {
      const box = boxNow();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.box = box;
      g.pin = { share: shareOf(box.tl, box.br, mid), target: mid };
    } else g.pin = null;
  };

  const begin = (kind: Kind, event: React.PointerEvent): void => {
    event.stopPropagation();
    // A second finger on the frame itself: stopped here, so it never reaches the window's.
    if (gesture.current) {
      onSecond(event.nativeEvent);
      return;
    }
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const box = boxNow();
    gesture.current = {
      kind,
      start: { ...latest.current.values },
      from: { x: event.clientX, y: event.clientY },
      pivot: pivotNow(),
      pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]),
      pinch: null,
      moved: false,
      box,
      // A corner pulled holds the opposite one where it is.
      pin: kind === 'size' ? { share: { x: 0, y: 0 }, target: box.tl } : null,
    };
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

  // Its own taps do nothing more: never the piece's pick beneath.
  const swallow = (event: React.SyntheticEvent): void => event.stopPropagation();
  const still: CSSProperties = { touchAction: 'none' };

  return (
    <span
      data-edit-frame={part.kind}
      data-edit-tools={Object.entries(tools)
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(' ')}
      onClick={swallow}
      onPointerDown={(event) => (tools.move ? begin('move', event) : swallow(event))}
      className={`pointer-events-auto absolute -inset-[3px] block outline outline-1 outline-white ${tools.move ? 'cursor-move' : ''}`}
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
        <span
          data-edit-handle="rotate"
          aria-hidden
          onClick={swallow}
          onPointerDown={(event) => begin('rotate', event)}
          className={`${HANDLE} -top-11 left-1/2 -translate-x-1/2 cursor-grab`}
          style={still}
        >
          {/* A stem down to the outline, so it reads as the frame's, not a mark on the water. */}
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 h-[22px] w-px -translate-x-1/2 bg-white"
          />
          <span className={`${DOT} relative h-3.5 w-3.5`} />
        </span>
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
      {tools.ends ? (
        <>
          <span
            data-edit-handle="end-left"
            aria-hidden
            onClick={swallow}
            onPointerDown={(event) => begin('end-left', event)}
            className={`${HANDLE} top-1/2 -left-[22px] -translate-y-1/2 cursor-ew-resize`}
            style={still}
          >
            <span className={DOT} />
          </span>
          <span
            data-edit-handle="end-right"
            aria-hidden
            onClick={swallow}
            onPointerDown={(event) => begin('end-right', event)}
            className={`${HANDLE} top-1/2 -right-[22px] -translate-y-1/2 cursor-ew-resize`}
            style={still}
          >
            <span className={DOT} />
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * The active piece's toolbar (review): near it, small, white over the
 * water — the text size stepper when the label is selected ("T | − 14 +"),
 * Undo, More and Done — and what the save is doing: "Saving…", then "Saved".
 */
export function EditToolbar({
  editing,
  fontSize,
  style,
}: {
  editing: BoardEditing;
  /** The label's text size as drawn, while the label is selected; else no stepper. */
  fontSize: number | null;
  style: CSSProperties;
}) {
  const button = 'flex h-8 min-w-8 items-center justify-center rounded-full px-1.5';
  return (
    <div
      data-edit-toolbar
      role="toolbar"
      aria-label="Layout"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      // A white bar on the ground stays white with ink (0032).
      className="surface text-ink pointer-events-auto absolute z-[100] flex items-center gap-0.5 rounded-full bg-white px-1 text-xs font-medium whitespace-nowrap shadow-md"
      style={style}
    >
      {fontSize !== null ? (
        <div data-edit-text-size className="flex items-center" role="group" aria-label="Text size">
          <Type aria-hidden size={14} className="mx-1.5" />
          <span aria-hidden className="bg-ink/20 h-4 w-px" />
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
          <span aria-hidden className="bg-ink/20 mx-0.5 h-4 w-px" />
        </div>
      ) : null}
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
      <button
        type="button"
        aria-label="More"
        data-edit-more
        onClick={editing.more}
        className={button}
      >
        <MoreHorizontal aria-hidden size={16} />
      </button>
      <button
        type="button"
        data-edit-done
        onClick={editing.deactivate}
        className={`${button} text-main-900 gap-1 px-2.5 font-semibold`}
      >
        <Check aria-hidden size={14} />
        Done
      </button>
      {editing.status ? (
        <span data-edit-status={editing.status} className="text-pool-500 pr-2 pl-1 text-[10px]">
          {editing.status === 'saving' ? 'Saving…' : 'Saved'}
        </span>
      ) : null}
    </div>
  );
}
