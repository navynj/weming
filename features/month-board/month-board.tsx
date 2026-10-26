'use client';

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Card, GridColumn } from '@/features/home/grid';
import { monthName } from '@/features/home/scope';

import { BoardPieceView, BoardTapeView } from './board-pieces';
import { BOARD_PX, COLUMNS, layoutMonthBoard, shiftMonth, WEEKDAY_PX } from './layout';
import { useBoardPhotos } from './use-board-photos';
import { useBoardZoom } from './use-board-zoom';

/** The board's room in the grid's place: a phone's side gutter, a breath above the stack. */
export function BoardFrame({ children }: { children: ReactNode }) {
  return (
    <div data-board-frame className="flex min-h-0 flex-1 flex-col px-4 pb-3 lg:pb-10">
      {children}
    </div>
  );
}

/**
 * The Board view (phase 1, read only): one month as a finished collage on
 * the water — seven days as lanes, roped in white, each post on its day as
 * a label (photos fanned above it, or its icon as a sticker on a corner),
 * ranged posts as tape along the top of each week row. Laid out at the
 * room's own width (980px at most, scaled up past that), so it always fits
 * with nothing to pan; a pinch or a double tap zooms in (to 3x) and pans.
 * A tap brings the post's card to the top of the stack, as a mark does in
 * the Lane view.
 */
export function MonthBoard({
  cards,
  month,
  onMonth,
  onPick,
  lanes,
}: {
  cards: Card[];
  /** `YYYY-MM`. */
  month: string;
  onMonth: (month: string) => void;
  /** Brings a post's card to the top of the stack. */
  onPick: (id: string) => void;
  /** What a post's icon falls back to: its lane's emoji. */
  lanes: Pick<GridColumn, 'id' | 'icon' | 'name'>[];
}) {
  const [room, setRoom] = useState<number | null>(null);
  // Same data, same width, same board: laid out once per month, set of posts and width.
  const layout = useMemo(
    () => layoutMonthBoard(cards, month, { width: room ?? BOARD_PX }),
    [cards, month, room],
  );
  const photos = useBoardPhotos(layout.pieces);
  const { scroller, zoom, moved, toggleAt } = useBoardZoom();
  const { metrics } = layout;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // The room's width: the board is laid out at it, so it fits exactly.
    const measure = (): void => setRoom(el.clientWidth > 0 ? el.clientWidth : BOARD_PX);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scroller]);

  const onClickCapture = useCallback(
    (event: MouseEvent): void => {
      if (moved.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [moved],
  );

  // Past 980px the board scales up to the room; below, it is laid out at it (1x).
  const fit = room === null ? 1 : room / layout.width;
  const scale = fit * zoom;
  const router = useRouter();
  // "Add your side": the splash's own sheet, opened with the next block's editor up.
  const onWrite = useCallback(
    (card: Card): void => {
      if (card.href) router.push(`${card.href}?write=1`, { scroll: false });
    },
    [router],
  );
  const empty = layout.pieces.length === 0 && layout.tapes.length === 0;
  const name = monthName(month);

  return (
    <div
      ref={scroller}
      data-month-board={month}
      data-zoom={zoom}
      onDoubleClick={(event) => toggleAt(event.clientX, event.clientY)}
      // The cards' radius; no scrollbar, the board is scrolled by hand.
      className="water-ground no-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain rounded-[24px]"
      // One-finger pans scroll natively; two fingers are the board's to zoom.
      style={{ touchAction: 'pan-x pan-y' }}
    >
      <div
        style={{
          width: layout.width * scale,
          height: layout.height * scale,
          visibility: room === null ? 'hidden' : undefined,
        }}
      >
        <div
          data-board-canvas
          className="relative origin-top-left text-white select-none"
          style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
        >
          <div
            className="absolute inset-x-0 top-0 flex items-center justify-center gap-6"
            style={{ height: metrics.title }}
          >
            <button
              type="button"
              aria-label={`${monthName(shiftMonth(month, -1))}`}
              data-board-prev
              onClick={() => onMonth(shiftMonth(month, -1))}
              className="flex h-14 w-14 items-center justify-center rounded-full"
            >
              <ChevronLeft aria-hidden size={32} />
            </button>
            <h2
              data-board-title
              className={`font-semibold ${metrics.width < 600 ? 'text-3xl' : 'text-5xl'}`}
            >
              {layout.title}
            </h2>
            <button
              type="button"
              aria-label={`${monthName(shiftMonth(month, 1))}`}
              data-board-next
              onClick={() => onMonth(shiftMonth(month, 1))}
              className="flex h-14 w-14 items-center justify-center rounded-full"
            >
              <ChevronRight aria-hidden size={32} />
            </button>
          </div>

          {layout.weekdays.map((weekday, col) => (
            <span
              key={weekday}
              data-board-weekday
              className="absolute text-xs font-medium"
              style={{
                left: col * metrics.column + metrics.pad,
                top: metrics.title + 8,
                height: WEEKDAY_PX,
              }}
            >
              {weekday}
            </span>
          ))}

          {/* Thin column rules only; the rows are read from the day numbers. */}
          {Array.from({ length: COLUMNS - 1 }, (_, at) => (
            <span
              key={at}
              aria-hidden
              // Lane ropes: thin white at 20%.
              className="absolute w-px bg-white/20"
              style={{ left: (at + 1) * metrics.column, top: metrics.title, bottom: 16 }}
            />
          ))}

          {layout.weeks.map((week) => (
            <div
              key={week.index}
              data-board-week-row={week.index}
              data-height={week.h}
              className="absolute inset-x-0"
              style={{ top: week.y, height: week.h }}
            >
              {week.cells.map((cell) => (
                <div
                  key={cell.day}
                  data-board-cell={cell.day}
                  data-in-month={cell.inMonth ? '' : undefined}
                  className="absolute inset-y-0"
                  style={{ left: cell.x, width: metrics.column }}
                >
                  <span
                    className={`absolute text-sm font-medium ${cell.inMonth ? '' : 'text-white/40'}`}
                    style={{ left: metrics.pad, top: 6 }}
                  >
                    {Number(cell.day.slice(8))}
                  </span>
                </div>
              ))}
            </div>
          ))}

          {empty ? (
            <p
              data-board-empty
              className="absolute inset-x-0 text-center text-sm text-white/80"
              style={{ top: metrics.head + 44 }}
            >
              Nothing on the board for {name} yet.
            </p>
          ) : null}

          {layout.tapes.map((tape) => (
            <BoardTapeView
              key={tape.key}
              tape={tape}
              lanes={lanes}
              metrics={metrics}
              onPick={onPick}
              onClickCapture={onClickCapture}
            />
          ))}
          {layout.pieces.map((piece) => (
            <BoardPieceView
              key={piece.id}
              onWrite={onWrite}
              piece={piece}
              photos={photos}
              lanes={lanes}
              metrics={metrics}
              onPick={onPick}
              onClickCapture={onClickCapture}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
