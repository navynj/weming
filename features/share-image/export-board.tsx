'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { WaveGlyph } from '@/components/ui/waves';
import type { GridColumn } from '@/features/home/grid';
import { boardPhotos } from '@/features/month-board/board-layout';
import {
  layoutMonthBoard,
  layoutWeekBoard,
  type BoardLayout,
  type Measured,
} from '@/features/month-board/layout';
import { storedAspects, usePhotoAspects, withAspects } from '@/features/month-board/photo-aspects';
import { useCaptionMeasure } from '@/features/month-board/use-caption-measure';
import { monthKey } from '@/features/splash/summary';
import type { SignedMedia } from '@/lib/media';

import { Canvas } from './export-canvas';
import type { Redacted } from './redact';
import type { ShareRange } from './range';

/**
 * A shared image's own page (H63): 540×960, drawn at twice that — a story's
 * 1080×1920. Laid out for it, never a capture of the screen: a phone's
 * proportions, so the board's type reads on a story at twice its size.
 */
export const EXPORT_W = 540;
export const EXPORT_H = 960;
export const EXPORT_SCALE = 2;
const PAD = 24;
const INNER = EXPORT_W - PAD * 2;
const HEAD_PX = 72;
const GAP = 16;
/** The month's foot: the wordmark and its line at the left, the range at the right. */
const FOOT_PX = 48;
/** A capture waits this long after the last change: measuring settles in a frame or two. */
const SETTLE_MS = 150;

/**
 * The image's page: the range as its title (the pool's name over it, with
 * the switch on), the Calendar beneath — a week in two rows, Sun–Wed over
 * Thu–Sat, the eighth cell holding the wordmark; or the month's seven
 * columns, compact as on a phone — and the wordmark at the foot. Told once
 * it has settled: fonts loaded, every photo decoded, the captions measured.
 */
export function ExportBoard({
  redacted,
  range,
  lanes,
  photos,
  placeName,
  onSettled,
}: {
  redacted: Redacted;
  range: ShareRange;
  lanes: Pick<GridColumn, 'id' | 'icon' | 'name'>[];
  /** My photos, as data URLs, by path. */
  photos: SignedMedia;
  /** The pool's name, with the switch on; else none. */
  placeName: string | null;
  onSettled: (root: HTMLElement) => void;
}) {
  const [measured, setMeasured] = useState<Measured>({});
  const aspects = usePhotoAspects();
  const drawn = useMemo(
    () =>
      redacted.cards.map((card) =>
        card.photos?.length ? { ...card, photos: boardPhotos(card.photos, card.layout) } : card,
      ),
    [redacted.cards],
  );
  const known = withAspects(measured, { ...storedAspects(drawn), ...aspects });
  const boards = useMemo((): BoardLayout[] => {
    if (range.span === 'week' && range.rows) {
      const column = INNER / 4;
      return [
        layoutWeekBoard(drawn, range.rows[0], { width: INNER, days: 4, measured: known }),
        layoutWeekBoard(drawn, range.rows[1], { width: column * 3, days: 3, measured: known }),
      ];
    }
    const room = EXPORT_H - PAD * 2 - HEAD_PX - FOOT_PX - GAP;
    return [
      layoutMonthBoard(drawn, monthKey(range.first), {
        width: INNER,
        fill: room,
        compact: true,
        measured: known,
      }),
    ];
    // `known` is rebuilt each render; what it is made of is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, range, measured, aspects]);

  const root = useRef<HTMLDivElement>(null);
  const pieces = useMemo(() => boards.flatMap((b) => b.pieces), [boards]);
  useCaptionMeasure(root, pieces, measured, setMeasured);

  // Settled: the last change some time ago, the fonts in, every photo decoded.
  const signature = useMemo(
    () => boards.map((b) => `${b.key}:${b.height}:${b.pieces.length}`).join('|'),
    [boards],
  );
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      const el = root.current;
      if (!el) return;
      void (async () => {
        await document.fonts?.ready;
        await Promise.all(
          [...el.querySelectorAll('img')].map((img) =>
            (img.decode ? img.decode() : Promise.resolve()).catch(() => undefined),
          ),
        );
        if (live) onSettled(el);
      })();
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [signature, measured, aspects, photos, onSettled]);

  const head = (
    <header className="flex flex-col justify-end" style={{ height: HEAD_PX }}>
      {placeName ? (
        <p data-export-place className="text-xs font-medium text-white/70">
          {placeName}
        </p>
      ) : null}
      <h1 className="text-2xl font-semibold tabular-nums">{range.title}</h1>
    </header>
  );

  return (
    <div
      ref={root}
      data-export-board={range.span}
      // The ground, as the place wears it: its colour and mode come from <html>.
      className="water-ground relative flex flex-col overflow-hidden font-sans"
      style={{ width: EXPORT_W, height: EXPORT_H, padding: PAD }}
    >
      {head}
      {range.span === 'week' ? (
        <WeekRows
          boards={boards}
          range={range}
          shapes={redacted.shapes}
          photos={photos}
          lanes={lanes}
        />
      ) : (
        <>
          <Fit room={EXPORT_H - PAD * 2 - HEAD_PX - FOOT_PX} height={boards[0].height + GAP}>
            <div style={{ paddingTop: GAP }}>
              <Canvas
                board={boards[0]}
                height={boards[0].height}
                shapes={redacted.shapes}
                photos={photos}
                lanes={lanes}
              />
            </div>
          </Fit>
          <footer className="flex items-end justify-between" style={{ height: FOOT_PX }}>
            <Wordmark />
            <span className="text-xs font-medium whitespace-nowrap text-white/80 tabular-nums">
              {range.title}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}

/** A week in two rows of the same column width; the second's last cell is the wordmark's. */
function WeekRows({
  boards,
  range,
  shapes,
  photos,
  lanes,
}: {
  boards: BoardLayout[];
  range: ShareRange;
  shapes: ReadonlySet<string>;
  photos: SignedMedia;
  lanes: Pick<GridColumn, 'id' | 'icon' | 'name'>[];
}) {
  const room = EXPORT_H - PAD * 2 - HEAD_PX;
  const least = (room - GAP * 2) / 2;
  const [top, bottom] = boards;
  const topH = Math.max(least, top.height);
  const bottomH = Math.max(least, bottom.height);
  const column = INNER / 4;
  return (
    <Fit room={room} height={topH + bottomH + GAP * 2}>
      <div className="flex flex-col" style={{ paddingTop: GAP, gap: GAP }}>
        <Canvas board={top} height={topH} shapes={shapes} photos={photos} lanes={lanes} />
        <div className="relative flex" style={{ height: bottomH }}>
          <Canvas board={bottom} height={bottomH} shapes={shapes} photos={photos} lanes={lanes} />
          {/* The eighth cell: the wordmark, its line and the range, at its foot. */}
          <div
            data-export-mark
            className="flex flex-col justify-end border-l border-white/20 pl-3"
            style={{ width: column, height: bottomH }}
          >
            <Wordmark />
            <span className="mt-2 text-xs font-medium whitespace-nowrap text-white/80 tabular-nums">
              {range.title}
            </span>
          </div>
        </div>
      </div>
    </Fit>
  );
}

/** Scales its content down to the room, never up: a busy week or month still fits the page. */
function Fit({ room, height, children }: { room: number; height: number; children: ReactNode }) {
  const scale = Math.min(1, room / height);
  return (
    <div className="relative min-h-0 flex-1">
      <div
        data-export-scale={scale}
        className="absolute top-0 left-1/2"
        style={{
          width: INNER,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Weming, its wave beside it, and its line under it, small. */
function Wordmark() {
  return (
    <div data-export-wordmark className="flex flex-col">
      <span className="flex items-center gap-1.5 text-base font-semibold">
        <WaveGlyph width={20} stroke="var(--color-white)" strokeWidth={1.6} />
        Weming
      </span>
      <span className="text-[10px] font-medium text-white/70">Pool your days.</span>
    </div>
  );
}
