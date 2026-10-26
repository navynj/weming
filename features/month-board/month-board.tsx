'use client';

import { useCallback, useLayoutEffect, useMemo, useState, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Card, GridColumn } from '@/features/home/grid';
import { monthName } from '@/features/home/scope';

import { BoardPieceView, BoardTapeView } from './board-pieces';
import {
  BOARD_PX,
  CELL_PAD_PX,
  COLUMN_PX,
  COLUMNS,
  HEAD_PX,
  layoutMonthBoard,
  shiftMonth,
  TITLE_PX,
  WEEKDAY_PX,
} from './layout';
import { useBoardPhotos } from './use-board-photos';
import { useBoardZoom } from './use-board-zoom';

/**
 * The Board view (phase 1, read only): one month as a finished collage —
 * seven columns of days on white, each post on its day as a label (photos
 * fanned above it, or its icon as a sticker on a corner), ranged posts as
 * tape along the top of each week row. Laid out once per month at a fixed
 * 980px and scaled to the room, so it never reflows; a phone pinches or
 * double-taps into it (to 3x) and pans. A tap opens the post's sheet.
 */
export function MonthBoard({
  cards,
  month,
  onMonth,
  lanes,
}: {
  cards: Card[];
  /** `YYYY-MM`. */
  month: string;
  onMonth: (month: string) => void;
  /** What a post's icon falls back to: its lane's emoji. */
  lanes: Pick<GridColumn, 'id' | 'icon' | 'name'>[];
}) {
  // Same data, same board: laid out once per month and set of posts.
  const layout = useMemo(() => layoutMonthBoard(cards, month), [cards, month]);
  const photos = useBoardPhotos(layout.pieces);
  const [fit, setFit] = useState<number | null>(null);
  const { scroller, zoom, moved, toggleAt } = useBoardZoom();

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = (): void => setFit(el.clientWidth > 0 ? el.clientWidth / BOARD_PX : 1);
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

  const scale = (fit ?? 1) * zoom;
  const empty = layout.pieces.length === 0 && layout.tapes.length === 0;
  const name = monthName(month);

  return (
    <div
      ref={scroller}
      data-month-board={month}
      data-zoom={zoom}
      onDoubleClick={(event) => toggleAt(event.clientX, event.clientY)}
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-white"
      // One-finger pans scroll natively; two fingers are the board's to zoom.
      style={{ touchAction: 'pan-x pan-y' }}
    >
      <div
        style={{
          width: BOARD_PX * scale,
          height: layout.height * scale,
          visibility: fit === null ? 'hidden' : undefined,
        }}
      >
        <div
          data-board-canvas
          className="text-main-900 relative origin-top-left select-none"
          style={{ width: BOARD_PX, height: layout.height, transform: `scale(${scale})` }}
        >
          <div
            className="absolute inset-x-0 top-0 flex items-center justify-center gap-6"
            style={{ height: TITLE_PX }}
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
            <h2 data-board-title className="text-5xl font-semibold">
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
              style={{ left: col * COLUMN_PX + CELL_PAD_PX, top: TITLE_PX + 8, height: WEEKDAY_PX }}
            >
              {weekday}
            </span>
          ))}

          {/* Thin column rules only; the rows are read from the day numbers. */}
          {Array.from({ length: COLUMNS - 1 }, (_, at) => (
            <span
              key={at}
              aria-hidden
              className="bg-main-900/15 absolute w-px"
              style={{ left: (at + 1) * COLUMN_PX, top: TITLE_PX, bottom: 16 }}
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
                  style={{ left: cell.x, width: COLUMN_PX }}
                >
                  <span
                    className={`absolute text-sm font-medium ${cell.inMonth ? '' : 'text-pool-500/50'}`}
                    style={{ left: CELL_PAD_PX, top: 6 }}
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
              className="text-pool-500 absolute inset-x-0 text-center text-sm"
              style={{ top: HEAD_PX + 44 }}
            >
              Nothing on the board for {name} yet.
            </p>
          ) : null}

          {layout.tapes.map((tape) => (
            <BoardTapeView
              key={tape.key}
              tape={tape}
              lanes={lanes}
              onClickCapture={onClickCapture}
            />
          ))}
          {layout.pieces.map((piece) => (
            <BoardPieceView
              key={piece.id}
              piece={piece}
              photos={photos}
              lanes={lanes}
              onClickCapture={onClickCapture}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
