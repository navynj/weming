'use client';

import { useMemo } from 'react';

import type { Card, GridColumn } from '@/features/home/grid';
import {
  BoardPieceView,
  BoardTapeView,
  ShapePieceView,
  ShapeTapeView,
} from '@/features/month-board/board-pieces';
import {
  DAY_NUMBER_PX,
  HEADER_PX,
  MONTH_HEADER_PX,
  type BoardLayout,
} from '@/features/month-board/layout';
import { DayWaves } from '@/features/month-board/month-board';
import { stackingOf } from '@/features/month-board/stacking';
import type { SignedMedia } from '@/lib/media';

function noop(): void {}

/** One board as the Calendar draws it, still: no ring, no handles, nothing to tap. */
export function Canvas({
  board,
  height,
  shapes,
  photos,
  lanes,
}: {
  board: BoardLayout;
  height: number;
  shapes: ReadonlySet<string>;
  photos: SignedMedia;
  lanes: Pick<GridColumn, 'id' | 'icon' | 'name'>[];
}) {
  const { metrics } = board;
  const stacking = useMemo(
    () => stackingOf(board.pieces, metrics.column),
    [board.pieces, metrics.column],
  );
  const week = board.span === 'week';
  return (
    <div
      data-export-canvas={board.key}
      className="relative isolate shrink-0 text-white"
      style={{ width: metrics.width, height }}
    >
      {board.headers.map((header, col) => (
        <span
          key={header.day}
          data-board-header={header.day}
          className="absolute flex flex-col items-center justify-start pt-2"
          style={{
            left: col * metrics.column,
            width: metrics.column,
            height: week ? HEADER_PX : MONTH_HEADER_PX,
          }}
        >
          {week ? (
            <>
              <span className="h-3.5 text-[10px]/3.5 font-medium text-white/80">
                {header.weekday}
              </span>
              <span className="h-6 text-base/6 font-semibold tabular-nums">{header.number}</span>
              <span className="flex items-start pt-1.5">
                <DayWaves count={board.weeks[0].cells[col].count} narrow={metrics.narrow} />
              </span>
            </>
          ) : (
            <span className="text-xs font-medium">{header.weekday}</span>
          )}
        </span>
      ))}
      {week
        ? null
        : board.weeks.flatMap((row) =>
            row.cells.map((cell) => (
              <span
                key={cell.day}
                className={`absolute flex justify-center pt-1 text-sm/5 font-medium tabular-nums ${cell.inMonth ? '' : 'text-white/40'}`}
                style={{ left: cell.x, top: row.y, width: metrics.column, height: DAY_NUMBER_PX }}
              >
                {Number(cell.day.slice(8))}
              </span>
            )),
          )}
      {Array.from({ length: metrics.columns - 1 }, (_, at) => (
        <span
          key={at}
          aria-hidden
          className="absolute top-0 w-px bg-white/20"
          style={{ left: (at + 1) * metrics.column, height }}
        />
      ))}
      {board.tapes.map((tape) =>
        shapes.has(tape.id) ? (
          <ShapeTapeView key={tape.key} tape={tape} />
        ) : (
          <BoardTapeView
            key={tape.key}
            tape={tape}
            lanes={lanes}
            metrics={metrics}
            onPick={noop}
            ripple={null}
          />
        ),
      )}
      {board.pieces.map((piece) =>
        shapes.has(piece.id) ? (
          <ShapePieceView key={piece.id} piece={piece} metrics={metrics} />
        ) : (
          <BoardPieceView
            key={piece.id}
            piece={piece}
            photos={photos}
            lanes={lanes}
            metrics={metrics}
            onPick={noop}
            onWrite={noop as (card: Card) => void}
            ripple={null}
            plunge={false}
            // A video reads as one on a story: its play mark over its thumbnail.
            videoPlay
            order={stacking.order.get(piece.id) ?? 0}
            total={stacking.total}
            stacking={stacking}
          />
        ),
      )}
    </div>
  );
}
