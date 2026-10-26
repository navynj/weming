'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { AXIS_LOCK_PX } from '@/components/ui/use-axis-lock';
import { usePrefersReducedMotion } from '@/components/ui/waves/use-reduced-motion';
import type { Card, GridColumn } from '@/features/home/grid';
import type { Ring } from '@/features/home/lane-grid';
import { WaveGlyph } from '@/components/ui/waves';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

import { BoardPieceView, BoardTapeView } from './board-pieces';
import { useBoardSpan, type BoardSpan } from './board-span';
import {
  addDays,
  COLUMNS,
  DAY_NUMBER_PX,
  DAY_WAVES_MAX,
  HEADER_PX,
  layoutMonthBoard,
  layoutWeekBoard,
  measureKey,
  MONTH_HEADER_PX,
  type Measured,
  shiftMonth,
  weekOf,
} from './layout';
import { useBoardPhotos } from './use-board-photos';

/** A sideways swipe this long turns the page, once its axis is decided (the first 8px). */
const SWIPE_PX = 48;

/**
 * A day's waves (review): the pill's own glyph — the exported SVG, its pen
 * scaling with it — 26px wide on a desktop and 22 on a phone, a touch
 * finer than the export's pen, white at 80%; one per record, three at
 * most, stacked with no gap (review).
 */
const DAY_WAVE_W = { wide: 26, narrow: 22 } as const;
const DAY_WAVE_STROKE = 1.2;

function DayWaves({ count, narrow }: { count: number; narrow: boolean }) {
  const lines = Math.min(DAY_WAVES_MAX, count);
  if (lines === 0) return null;
  return (
    <span aria-hidden data-board-waves data-lines={lines} className="flex flex-col items-center">
      {Array.from({ length: lines }, (_, at) => (
        <WaveGlyph
          key={at}
          width={narrow ? DAY_WAVE_W.narrow : DAY_WAVE_W.wide}
          stroke="#ffffff"
          opacity={0.8}
          strokeWidth={DAY_WAVE_STROKE}
        />
      ))}
    </span>
  );
}

/** The board's room in the grid's place: a phone's side gutter, a breath above the stack. */
export function BoardFrame({ children }: { children: ReactNode }) {
  return (
    <div data-board-frame className="flex min-h-0 flex-1 flex-col px-4 pb-3 lg:pb-10">
      {children}
    </div>
  );
}

/**
 * The Calendar view (review, the mockup): a week, or a month, of splashes
 * on the water. Seven days as lanes roped in white; each post on its day a
 * label the lane wide (photos above it, or its icon as a sticker at a
 * corner), stacked flush in time order; a ranged post a band along the top
 * of each row it crosses. The week (the default) heads each lane with its
 * weekday, its number and its waves, and is titled by its range, the
 * arrows and a sideways swipe turning it; the month, rows that grow to
 * their tallest lane, a day's number opening its week. Week or Month is
 * remembered per device. Laid out at the room's own width, scrolling
 * down, never sideways. A tap brings the post's card to the top of the
 * stack; the post the stack heads to bobs on its water, the board turning
 * to its page first if it is on another.
 */
export function MonthBoard({
  cards,
  month,
  onMonth,
  today,
  ring = null,
  dropped = null,
  onPick,
  lanes,
}: {
  cards: Card[];
  /** `YYYY-MM`: the month shown, when Month is; the week shown is the board's own. */
  month: string;
  onMonth: (month: string) => void;
  today: IsoDate;
  /** The post the stack is heading to, once per `seq`: it bobs, and the board turns to it. */
  ring?: Ring | null;
  /** The post just dropped (review): it plunges into its water rather than bobbing on it. */
  dropped?: string | null;
  /** Brings a post's card to the top of the stack. */
  onPick: (id: string) => void;
  /** What a post's icon falls back to: its lane's emoji. */
  lanes: Pick<GridColumn, 'id' | 'icon' | 'name'>[];
}) {
  const [span, setSpan] = useBoardSpan();
  // The week shown: this one on open (review), unless the ground was opened on another month.
  const [week, setWeek] = useState<IsoDate>(() =>
    weekOf(monthKey(today) === month ? today : `${month}-01`),
  );
  // A new `?m=` while open moves the week there, set as it renders.
  const [seenMonth, setSeenMonth] = useState(month);
  if (month !== seenMonth) {
    setSeenMonth(month);
    setWeek(weekOf(monthKey(today) === month ? today : `${month}-01`));
  }
  const [room, setRoom] = useState<number | null>(null);
  // The board's visible height: a month that fits fills it (review).
  const [tall, setTall] = useState<number | null>(null);
  // The words' lines as the browser wrapped them, fed back so every label hugs them (review).
  const [measured, setMeasured] = useState<Measured>({});
  // Same data, same width, same page, same board: laid out once per each.
  const layout = useMemo(
    () =>
      span === 'week'
        ? layoutWeekBoard(cards, week, { width: room ?? 980, measured })
        : layoutMonthBoard(cards, month, { width: room ?? 980, fill: tall ?? undefined, measured }),
    [cards, span, week, month, room, tall, measured],
  );
  const { metrics } = layout;

  // Measure each title's lines as drawn — unclamped, its full height — and
  // keep any the estimate got wrong, by piece, room and indent; the next
  // layout uses them. Settles in a pass or two: a width, once measured,
  // keeps its count.
  const canvas = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const found: Measured = {};
    for (const piece of layout.pieces) {
      const text = el.querySelector<HTMLElement>(
        `[data-board-piece="${piece.id}"] [data-board-text]`,
      );
      if (!text || text.scrollHeight === 0) continue;
      const lines = Math.min(
        piece.type.lines,
        Math.max(1, Math.round(text.scrollHeight / piece.type.line)),
      );
      const key = measureKey(
        piece.id,
        piece.labelBox.w - piece.pad.left - piece.pad.right,
        piece.indent,
        piece.type.size,
      );
      if (lines !== piece.captionLines && measured[key] !== lines) found[key] = lines;
    }
    if (Object.keys(found).length === 0) return;
    // Next frame: the measurement is the browser's, read after it has drawn.
    const frame = requestAnimationFrame(() => setMeasured((current) => ({ ...current, ...found })));
    return () => cancelAnimationFrame(frame);
  }, [layout, measured]);
  const photos = useBoardPhotos(layout.pieces);
  const scroller = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // The room's width: the board is laid out at it, so it always fits.
    const measure = (): void => {
      setRoom(el.clientWidth > 0 ? el.clientWidth : null);
      setTall(el.clientHeight > 0 ? el.clientHeight : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Turning the page: a week or a month either way.
  const turn = useCallback(
    (by: 1 | -1): void => {
      if (span === 'week') setWeek((current) => addDays(current, by * COLUMNS));
      else onMonth(shiftMonth(month, by));
    },
    [span, month, onMonth],
  );
  const switchSpan = (next: BoardSpan): void => {
    if (next === span) return;
    // Month shows the week's month; Week shows the month's first week, or this one.
    if (next === 'month') onMonth(monthKey(addDays(week, 3)));
    else setWeek(weekOf(monthKey(today) === month ? today : `${month}-01`));
    setSpan(next);
  };
  const openWeek = (day: IsoDate): void => {
    setWeek(weekOf(day));
    setSpan('week');
  };

  // The post the stack is heading to (review): the board turns to its page
  // when it is on another — set as it renders, a month through its owner —
  // then it bobs (once per `seq`, by its key) and scrolls into view.
  const onBoard = (id: string): boolean =>
    layout.pieces.some((p) => p.id === id) || layout.tapes.some((t) => t.id === id);
  const seq = ring?.seq ?? null;
  // Unseen at first, so the post on top when the board opens is followed too.
  const [seenSeq, setSeenSeq] = useState<number | null>(null);
  const [wanted, setWanted] = useState<{ seq: number; month: string } | null>(null);
  if (seq !== seenSeq) {
    setSeenSeq(seq);
    const card = ring ? cards.find((c) => c.splash.id === ring.id) : undefined;
    if (card && !onBoard(card.splash.id)) {
      if (span === 'week') setWeek(weekOf(card.day));
      else setWanted({ seq: ring!.seq, month: monthKey(card.day) });
    }
  }
  useEffect(() => {
    if (wanted) onMonth(wanted.month);
    // Once per ring that wants another month; a page turned by hand after stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  useEffect(() => {
    if (!ring) return;
    const el = scroller.current?.querySelector<HTMLElement>(
      `[data-board-piece="${ring.id}"], [data-board-tape="${ring.id}"]`,
    );
    el?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    // Once the page it is on has rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, layout.key]);

  const router = useRouter();
  // "Add your side": the splash's own sheet, opened with the next block's editor up.
  const onWrite = useCallback(
    (card: Card): void => {
      if (card.href) router.push(`${card.href}?write=1`, { scroll: false });
    },
    [router],
  );

  // A sideways swipe turns the page; its axis is decided from the first 8px
  // and held (one axis per gesture), so a vertical scroll never turns it.
  const touch = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const onTouchStart = (event: React.TouchEvent): void => {
    const t = event.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY, axis: null } : null;
  };
  const onTouchMove = (event: React.TouchEvent): void => {
    const t = event.touches[0];
    const start = touch.current;
    if (!t || !start || start.axis !== null) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.hypot(dx, dy) >= AXIS_LOCK_PX) start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  };
  const onTouchEnd = (event: React.TouchEvent): void => {
    const t = event.changedTouches[0];
    const start = touch.current;
    touch.current = null;
    if (!t || !start || start.axis !== 'x') return;
    const dx = t.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_PX) turn(dx < 0 ? 1 : -1);
  };

  const empty = layout.pieces.length === 0 && layout.tapes.length === 0;
  const lastRow = layout.weeks[layout.weeks.length - 1];
  const gridBottom = lastRow ? lastRow.y + lastRow.h : layout.height;
  const ripple = (id: string): number | null =>
    ring && ring.id === id && !reducedMotion ? ring.seq : null;
  const plunge = (id: string): boolean => dropped === id && !reducedMotion;

  return (
    <div
      data-month-board={layout.key}
      data-board-span={span}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* The head: the page's title between its arrows, Week | Month at the right. Small:
          under a pool's name, never over it (review). */}
      <div className="flex shrink-0 items-center gap-1 pb-2 text-white">
        <button
          type="button"
          aria-label={span === 'week' ? 'Previous week' : 'Previous month'}
          data-board-prev
          onClick={() => turn(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full"
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <h2 data-board-title className="text-sm font-semibold tabular-nums">
          {layout.title}
        </h2>
        <button
          type="button"
          aria-label={span === 'week' ? 'Next week' : 'Next month'}
          data-board-next
          onClick={() => turn(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full"
        >
          <ChevronRight aria-hidden size={18} />
        </button>
        <div className="flex-1" />
        <div
          role="tablist"
          aria-label="Board span"
          className="flex rounded-full bg-white/15 p-0.5 text-xs font-medium"
        >
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={span === option}
              data-board-span-option={option}
              onClick={() => switchSpan(option)}
              // On the water, white carries what is chosen (H21c), as the header's toggle.
              className={`rounded-full px-3 py-1 ${span === option ? 'text-main-900 bg-white' : 'text-white/70'}`}
            >
              {option === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scroller}
        data-board-scroller
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        // Transparent over the ground (review: no depth by row); the cards' radius; no scrollbar; down only.
        className="no-scrollbar relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-[24px]"
        style={{ touchAction: 'pan-y' }}
      >
        <div
          // One grid per page: a new week or month is a new grid, the last one gone with it.
          key={`${span}:${layout.key}`}
          ref={canvas}
          data-board-canvas
          className="relative min-h-full text-white select-none"
          style={{
            width: '100%',
            height: layout.height,
            visibility: room === null ? 'hidden' : undefined,
          }}
        >
          {layout.headers.map((header, col) => (
            <span
              key={header.day}
              data-board-header={header.day}
              // Each line at a fixed height, so the waves beneath never move the number (review).
              className="absolute flex flex-col items-center justify-start pt-2"
              style={{
                left: col * metrics.column,
                width: metrics.column,
                height: span === 'week' ? HEADER_PX : MONTH_HEADER_PX,
              }}
            >
              {span === 'week' ? (
                <>
                  {/* The weekday over the day number, centred (the mockup); the day's waves beneath. */}
                  <span className="h-3.5 text-[10px]/3.5 font-medium text-white/80">
                    {header.weekday}
                  </span>
                  <span className="h-6 text-base/6 font-semibold tabular-nums">
                    {header.number}
                  </span>
                  <span className="flex items-start pt-1.5">
                    <DayWaves count={layout.weeks[0].cells[col].count} narrow={metrics.narrow} />
                  </span>
                </>
              ) : (
                <span className="text-xs font-medium">{header.weekday}</span>
              )}
            </span>
          ))}

          {layout.weeks.map((week) => (
            <div
              key={week.index}
              data-board-week-row={week.index}
              data-height={week.h}
              className="absolute inset-x-0"
              style={{
                top: week.y,
                height: week.h,
              }}
            >
              {week.cells.map((cell) => (
                <div
                  key={cell.day}
                  data-board-cell={cell.day}
                  data-in-month={cell.inMonth ? '' : undefined}
                  className="absolute inset-y-0"
                  style={{ left: cell.x, width: metrics.column }}
                >
                  {span === 'month' ? (
                    // A day's number opens its week (review); its waves beneath.
                    <button
                      type="button"
                      data-board-day={cell.day}
                      aria-label={`Open the week of ${cell.day}`}
                      onClick={() => openWeek(cell.day)}
                      className={`absolute inset-x-0 flex flex-col items-center justify-start pt-1 text-sm/5 font-medium tabular-nums ${cell.inMonth ? '' : 'text-white/40'}`}
                      style={{ top: 0, height: DAY_NUMBER_PX }}
                    >
                      {/* No waves under a month's numbers (review). */}
                      <span className="h-5">{Number(cell.day.slice(8))}</span>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ))}

          {/* The lane lines, once for the whole grid, from the header to its bottom edge:
              over the rows' water, under every item, so an overhang lies across them. */}
          {Array.from({ length: COLUMNS - 1 }, (_, at) => (
            <span
              key={at}
              aria-hidden
              data-board-rule={at + 1}
              className="absolute top-0 w-px bg-white/20"
              style={{ left: (at + 1) * metrics.column, height: gridBottom }}
            />
          ))}

          {empty ? (
            <p
              data-board-empty
              className="absolute inset-x-0 text-center text-sm text-white/80"
              style={{ top: (span === 'week' ? HEADER_PX : MONTH_HEADER_PX) + 44 }}
            >
              {span === 'week' ? 'Nothing this week yet.' : 'Nothing this month yet.'}
            </p>
          ) : null}

          {/* Each row's items and bands, clipped to the row: nothing leaves its week. */}
          {layout.weeks.map((week) => (
            <div
              key={week.index}
              data-board-row-items={week.index}
              className="absolute inset-x-0 overflow-hidden"
              style={{ top: week.y, height: week.h }}
            >
              <div className="absolute inset-x-0" style={{ top: -week.y, height: layout.height }}>
                {layout.tapes
                  .filter((tape) => tape.week === week.index)
                  .map((tape) => (
                    <BoardTapeView
                      key={tape.key}
                      tape={tape}
                      lanes={lanes}
                      metrics={metrics}
                      onPick={onPick}
                      ripple={ripple(tape.id)}
                    />
                  ))}
                {layout.pieces
                  .filter((piece) => piece.week === week.index)
                  .map((piece) => (
                    <BoardPieceView
                      key={piece.id}
                      piece={piece}
                      photos={photos}
                      lanes={lanes}
                      metrics={metrics}
                      onPick={onPick}
                      onWrite={onWrite}
                      ripple={ripple(piece.id)}
                      plunge={plunge(piece.id)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
