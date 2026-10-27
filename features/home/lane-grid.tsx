'use client';

import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { ON_PIECE } from '@/features/month-board/board-handles';
import { BoardPieceView, BoardTapeView, TapeSlot } from '@/features/month-board/board-pieces';
import { stackingOf } from '@/features/month-board/stacking';
import type { BoardEditing } from '@/features/month-board/use-board-editing';
import { boardPhotos } from '@/features/month-board/board-layout';
import {
  layoutLaneBoard,
  measureKey,
  TAPE_PX,
  type Measured,
  type Recipe,
} from '@/features/month-board/layout';
import { useBoardPhotos } from '@/features/month-board/use-board-photos';

import { useAxisLock } from '@/components/ui/use-axis-lock';
import { CommitRing } from '@/components/ui/waves';
import { usePrefersReducedMotion } from '@/components/ui/waves/use-reduced-motion';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

import { Monogram } from '@/components/ui/monogram';
import { Avatar, PersonName } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';

import {
  cardColumn,
  daysDown,
  EVEN_COLUMNS_MAX,
  FIXED_COLUMN_PX,
  gridBounds,
  isOrphanCard,
  laneOfCard,
  monthAbbrev,
  weekdayOf,
  type Card,
  type GridColumn,
} from './grid';
import { DAY_RAIL_PX, DateDay } from './date-day';
import { JointBand, JointFaces } from './joint-band';
import { PostRow } from './post-row';

/** The date rail's width and the `+` column's, both fixed; the lanes share the rest. */
/** The date rail's width; shared with the day list. */
const RAIL_PX = DAY_RAIL_PX;
const PLUS_PX = 44;
/** How many day rows the window grows by when the bottom comes into view. */
const WINDOW_STEP = 31;
/** The fewest rows rendered at first, so a month that has barely begun still scrolls. */
const WINDOW_MIN = 21;
/** The narrowest a column gets when six share a phone's width: six always show at once. */
const MIN_COLUMN_PX = 40;
/** A day row's least height, a gap's height (a run of empty days, compressed), and the mark's diameter with the ring's bound. */
const ROW_PX = 56;
const GAP_PX = 28;
export const MARK_PX = 28;
const RING_PX = 96;
/** How long a smooth scroll to the mark is given before its ring plays, so the ring is seen. */
export const SCROLL_MS = 350;

/** A ring to play: at this mark, once per `seq`. */
export type Ring = { id: string; seq: number };

/** Where a mark is on screen: the centre of its disc, in client coordinates. */
export type MarkSpot = { x: number; y: number; size: number };

/** What Home can ask the grid to do. */
export type GridHandle = {
  /**
   * Scrolls so the first mark is in view (smooth unless motion is reduced)
   * and reports where each mark will be once that scroll has landed — the
   * target a diving card flies to, and the seat a rising one leaves from.
   */
  revealMarks: (ids: string[]) => Map<string, MarkSpot>;
};

/**
 * The lane grid (H22; `_docs/mockups/home-grid-stack.png`): a map of recent
 * records. One column per lane in the author's order, each headed by its
 * emoji over its name with a thin rope running down each side of it; one row per day,
 * newest at the top, named on a fixed rail at the left (the day number and
 * weekday, the year and month only where the month changes) at one quiet
 * opacity. A post is a white disc carrying its lane's emoji, centred on its
 * column at its day; several on one lane and day stack within the row, and
 * the row grows to hold them. The post on top of the board has the one
 * solid mark; every other reads translucent (review); tapping any mark
 * brings its card to the top. A run of
 * empty days is one short gap of empty ropes with no date on the rail
 * (review): the past compresses rather than stretching by the calendar,
 * and only a day with something on it is named.
 *
 * One scroll container, both axes: the rail is sticky at the left and the
 * lane headers sticky at the top, so a vertical drag anywhere scrolls days
 * and a horizontal one scrolls columns only, with nothing synchronised in
 * script. The avatar above the headers scrolls away with the days, which is
 * what keeps three rows above the stack on a short phone. With up to
 * `EVEN_COLUMNS_MAX` lanes the columns share the width and the group sits
 * centred; past that each column is fixed and the columns scroll sideways.
 * A lane's header opens its detail — the titles on it; at the far left of
 * the headers, above the rail, an `=` opens the lanes sheet (review).
 *
 * The rendered window of days grows as the bottom comes into view, from the
 * top day back to the oldest post's month. The ring plays at the mark Home
 * names — a landing, a drop, the first post on open — after the grid has
 * scrolled it into view.
 */
export const LaneGrid = forwardRef<
  GridHandle,
  {
    /** Newest first. */
    cards: Card[];
    /** The columns: my lanes on Home; a pool's lanes, or its members, in a pool (H23). */
    categories: GridColumn[];
    today: IsoDate;
    /** The mark to ring, once per `seq`. */
    ring: Ring | null;
    /** Every post but the one on top of the board: their marks read translucent (review). */
    waterIds: ReadonlySet<string>;
    /** The avatar above the headers; null in a pool, whose header names its members. */
    initials: string | null;
    /** `?m=`: the month to scroll the grid to; the newest day of it lands under the headers. */
    scrollToMonth: string | null;
    onPick: (id: string) => void;
    /** The `+` column after the last lane; absent where lanes are not made here. */
    onCreateLane?: () => void;
    /** My avatar opens my profile (0018); absent, it is only a face. */
    onAvatar?: () => void;
    /**
     * A joint splash as a band across every column (H23): in a pool's
     * Members view only (review). Off, it is a mark in its own column.
     */
    bands?: boolean;
    /**
     * The Lane view (the grid) or the Date view (round 3): the same scroller,
     * rail, window, `?m=` target and ring; in the Date view a day's posts are
     * pills, one per line, and there are no lane columns.
     */
    view?: 'lane' | 'date';
    /**
     * The Lane view drawn with the Calendar's pieces (0045): labels, stickers,
     * photo cards, faces, "Add your side" and waves, in their lane columns,
     * a row per day. Off, a post is its mark (the Members view keeps those).
     */
    pieces?: boolean;
    /** The recipe each piece is drawn with, whenever it changes: the Layout panel shows it. */
    onDrawn?: (recipes: Record<string, Recipe>) => void;
    /** Direct manipulation on the pieces (review): taps go through it. */
    editing?: BoardEditing | null;
  }
>(function LaneGrid(
  {
    cards,
    categories,
    today,
    ring,
    waterIds,
    initials,
    scrollToMonth,
    onPick,
    onCreateLane,
    onAvatar,
    bands = true,
    view = 'lane',
    pieces = false,
    onDrawn,
    editing = null,
  },
  ref,
) {
  const { me } = usePeople();
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  // The inner, sideways scroller, and the header bar that follows it.
  const across = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const followAcross = useCallback((): void => {
    const x = across.current;
    if (head.current && x) head.current.style.transform = `translateX(${-x.scrollLeft}px)`;
  }, []);
  // Belt and braces over the native latching: each scroller holds the other
  // axis still for the rest of a gesture (round 3).
  useAxisLock(scroller);
  useAxisLock(across);
  const dateView = view === 'date';
  const reducedMotion = usePrefersReducedMotion();
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  // The ring as it plays: set once its mark has been brought into view.
  const [ringAt, setRingAt] = useState<Ring | null>(null);

  const { top, floor } = gridBounds(cards, today);
  const allDays = useMemo(() => daysDown(top, floor), [top, floor]);
  const [grown, setLimit] = useState(() =>
    Math.max(WINDOW_MIN, daysDown(top, `${monthKey(top)}-01`).length),
  );

  const plusColumn = onCreateLane !== undefined;
  const drawPieces = pieces && view === 'lane';
  // A full-width band where columns are people (H23): with pieces, every
  // joint record — a translucent tape across Members, its "Add your side" in
  // my column (review) — and a member's own record shared with Everyone on.
  // Any other is one piece in its column (0045).
  const banded = (card: Card): boolean =>
    bands &&
    (drawPieces ? card.joint === true || card.everyone === true : card.branches !== undefined);
  const orphans = cards.some((card) => !banded(card) && isOrphanCard(card, categories));
  const columns = categories.length + (orphans ? 1 : 0);
  const even = dateView || columns <= EVEN_COLUMNS_MAX;
  // Every mark carries its short title (round 3). Past six lanes a column
  // keeps a sixth of the room and the rest scroll sideways, so six lanes
  // always show at once; unmeasured, a column falls back to its fixed width.
  const titled = !dateView;
  const share =
    viewportWidth !== null
      ? Math.max(
          MIN_COLUMN_PX,
          Math.floor((viewportWidth - RAIL_PX - (plusColumn ? PLUS_PX : 0)) / EVEN_COLUMNS_MAX),
        )
      : FIXED_COLUMN_PX;
  const template = dateView
    ? `${RAIL_PX}px minmax(0, 1fr)`
    : `${RAIL_PX}px repeat(${Math.max(columns, 1)}, ${
        even ? 'minmax(0, 1fr)' : `${share}px`
      })${plusColumn ? ` ${PLUS_PX}px` : ''}`;

  // Each day's cards by lane, so a cell is one lookup.
  const byCell = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of cards) {
      // A joint splash drawn as a band is never also a mark in a cell (H23).
      if (banded(card)) continue;
      const lane = isOrphanCard(card, categories) ? '' : (cardColumn(card) ?? '');
      const key = `${card.day}|${lane}`;
      const cell = map.get(key);
      if (cell) cell.push(card);
      else map.set(key, [card]);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- banded reads bands and drawPieces
  }, [cards, categories, bands, drawPieces]);

  // The avatar row is sticky at the left and exactly as wide as the viewport,
  // so it never scrolls sideways with the columns.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The month asked for and the mark to ring are always within the window,
  // which reaches down to them: the window is the larger of the two.
  const ringCard = cards.find((card) => card.splash.id === ring?.id) ?? null;
  const monthDay = scrollToMonth
    ? (allDays.find((day) => monthKey(day) === scrollToMonth) ?? null)
    : null;
  const needed = Math.max(
    ringCard ? allDays.indexOf(ringCard.day) + 1 : 0,
    monthDay ? allDays.indexOf(monthDay) + 1 : 0,
  );
  const limit = Math.max(grown, needed);
  const days = allDays.slice(0, limit);
  // A day with something on it is a row; a run of empty days is one gap.
  const byDay = useMemo(() => {
    const map = new Map<IsoDate, Card[]>();
    for (const card of cards) {
      const list = map.get(card.day);
      if (list) list.push(card);
      else map.set(card.day, [card]);
    }
    return map;
  }, [cards]);
  const named = (d: IsoDate): boolean => byDay.has(d);
  const rows: ({ kind: 'day'; day: IsoDate } | { kind: 'gap'; from: IsoDate; to: IsoDate })[] = [];
  for (const day of days) {
    if (named(day)) {
      rows.push({ kind: 'day', day });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last && last.kind === 'gap') last.to = day;
    else rows.push({ kind: 'gap', from: day, to: day });
  }

  // The Lane view drawn with pieces (0045): laid out by the Calendar's engine,
  // a column per lane at the grid's own column width, a row per named day.
  const columnIds = useMemo(
    () => [...categories.map((c) => c.id), ...(orphans ? [''] : [])],
    [categories, orphans],
  );
  const columnPx = even
    ? viewportWidth !== null
      ? (viewportWidth - RAIL_PX - (plusColumn ? PLUS_PX : 0)) / Math.max(columns, 1)
      : FIXED_COLUMN_PX
    : share;
  const namedKey = rows.flatMap((r) => (r.kind === 'day' ? [r.day] : [])).join(',');
  // A day's segments, drawn with pieces: runs of pieces, and the bands between
  // them in Members, newest first as the stack reads (review).
  const segmentsOf = useMemo(() => {
    const map = new Map<IsoDate, PieceSegment[]>();
    if (!drawPieces) return map;
    for (const day of namedKey ? (namedKey.split(',') as IsoDate[]) : []) {
      const list: PieceSegment[] = [];
      for (const card of byDay.get(day) ?? []) {
        const last = list[list.length - 1];
        if (banded(card)) list.push({ kind: 'band', card });
        else if (last?.kind === 'pieces') last.ids.add(card.splash.id);
        else
          list.push({
            kind: 'pieces',
            key: `${day}#${list.length}`,
            ids: new Set([card.splash.id]),
          });
      }
      map.set(day, list);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- banded reads bands and drawPieces
  }, [drawPieces, namedKey, byDay, bands]);
  const [measured, setMeasured] = useState<Measured>({});
  const laneBoard = useMemo(() => {
    if (!drawPieces) return null;
    const pieceRows: { key: string; day: IsoDate }[] = [];
    const rowOfId = new Map<string, string>();
    for (const [day, segments] of segmentsOf) {
      for (const segment of segments) {
        if (segment.kind !== 'pieces') continue;
        pieceRows.push({ key: segment.key, day });
        for (const id of segment.ids) rowOfId.set(id, segment.key);
      }
    }
    // A photo hidden from the board (0044) is not on it.
    const drawn = cards.map((card) =>
      card.photos?.length ? { ...card, photos: boardPhotos(card.photos, card.layout) } : card,
    );
    return layoutLaneBoard(drawn, pieceRows, columnIds, {
      width: columnPx * Math.max(columns, 1),
      measured,
      columnOf: (card) => (isOrphanCard(card, categories) ? '' : cardColumn(card)),
      rowOf: (card) => rowOfId.get(card.splash.id) ?? null,
    });
  }, [drawPieces, segmentsOf, cards, columnIds, columnPx, columns, measured, categories]);
  // One stacking order across every day's pieces (stacking.ts).
  const laneStacking = useMemo(
    () => (laneBoard ? stackingOf(laneBoard.pieces, laneBoard.metrics.column) : null),
    [laneBoard],
  );
  const weekOf = useMemo(
    () => new Map((laneBoard?.weeks ?? []).map((w) => [laneBoard!.rowKeys[w.index], w])),
    [laneBoard],
  );
  const boardPhotosSigned = useBoardPhotos(laneBoard?.pieces ?? NO_PIECES);
  const onWrite = useCallback(
    (card: Card): void => {
      if (card.href) router.push(`${card.href}?write=1`, { scroll: false });
    },
    [router],
  );
  // What was drawn, told once per change, for the panel's recipe.
  const told = useRef('');
  useEffect(() => {
    if (!onDrawn || !laneBoard) return;
    const recipes = Object.fromEntries(laneBoard.pieces.map((p) => [p.id, p.recipe]));
    const key = JSON.stringify(recipes);
    if (key === told.current) return;
    told.current = key;
    onDrawn(recipes);
  }, [laneBoard, onDrawn]);
  // Each title's lines as drawn, kept where the estimate was wrong (as the Calendar does).
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || !laneBoard) return;
    const found: Measured = {};
    for (const piece of laneBoard.pieces) {
      const text = el.querySelector<HTMLElement>(
        `[data-board-piece="${CSS.escape(piece.id)}"] [data-board-text]`,
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
    const frame = requestAnimationFrame(() => setMeasured((current) => ({ ...current, ...found })));
    return () => cancelAnimationFrame(frame);
  }, [laneBoard, measured]);

  // The window grows when its end comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    const root = scroller.current;
    if (!el || !root) return;
    if (limit >= allDays.length) return;
    // Without an observer there is no telling where the bottom is: every day.
    if (typeof IntersectionObserver === 'undefined') {
      const frame = window.requestAnimationFrame(() => setLimit(allDays.length));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => Math.min(allDays.length, current + WINDOW_STEP));
        }
      },
      { root },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [limit, allDays.length]);

  /** The scroll that brings a mark into view, and where the mark sits once it has. */
  const reveal = useCallback(
    (ids: string[]): { spots: Map<string, MarkSpot>; scrolled: boolean } => {
      const el = scroller.current;
      const x = across.current;
      const spots = new Map<string, MarkSpot>();
      if (!el || !x) return { spots, scrolled: false };
      const header = headerHeight(el);
      let scrollTop = el.scrollTop;
      let scrollLeft = x.scrollLeft;
      let scrolled = false;
      const first = ids[0] ? el.querySelector<HTMLElement>(markSelector(ids[0])) : null;
      if (first) {
        const markTop = offsetIn(first, el).top;
        const markLeft = offsetIn(first, x).left;
        if (markTop < scrollTop + header) scrollTop = markTop - header - 8;
        else if (markTop + first.offsetHeight > scrollTop + el.clientHeight) {
          scrollTop = markTop + first.offsetHeight - el.clientHeight + 8;
        }
        if (markLeft < scrollLeft + RAIL_PX) scrollLeft = markLeft - RAIL_PX - 8;
        else if (markLeft + first.offsetWidth > scrollLeft + x.clientWidth) {
          scrollLeft = markLeft + first.offsetWidth - x.clientWidth + 8;
        }
        scrollTop = Math.max(0, Math.min(scrollTop, el.scrollHeight - el.clientHeight));
        scrollLeft = Math.max(0, Math.min(scrollLeft, x.scrollWidth - x.clientWidth));
        if (scrollTop !== el.scrollTop) {
          scrollWithin(el, { top: scrollTop }, reducedMotion);
          scrolled = !reducedMotion;
        }
        if (scrollLeft !== x.scrollLeft) {
          scrollWithin(x, { left: scrollLeft }, reducedMotion);
          scrolled = !reducedMotion;
        }
      }
      const outer = el.getBoundingClientRect();
      const inner = x.getBoundingClientRect();
      for (const id of ids) {
        const mark = el.querySelector<HTMLElement>(markSelector(id));
        if (!mark) continue;
        spots.set(id, {
          x: inner.left + offsetIn(mark, x).left - scrollLeft + mark.offsetWidth / 2,
          y: outer.top + offsetIn(mark, el).top - scrollTop + mark.offsetHeight / 2,
          size: mark.offsetWidth || MARK_PX,
        });
      }
      return { spots, scrolled };
    },
    [reducedMotion],
  );
  useImperativeHandle(ref, () => ({ revealMarks: (ids) => reveal(ids).spots }), [reveal]);

  // `?m=`: the month's newest day lands just under the headers.
  const scrolledMonth = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !scrollToMonth || !monthDay) return;
    if (scrolledMonth.current === scrollToMonth) return;
    const row = rowHolding(el, monthDay);
    if (!row) return;
    scrolledMonth.current = scrollToMonth;
    scrollWithin(el, { top: offsetIn(row, el).top - headerHeight(el) }, reducedMotion);
  }, [scrollToMonth, monthDay, reducedMotion]);

  // The ring never plays off screen: its mark is scrolled into view first,
  // and the ring starts once the scroll has had time to land.
  useLayoutEffect(() => {
    if (!ring) return;
    const { scrolled } = reveal([ring.id]);
    const timer = window.setTimeout(() => setRingAt(ring), scrolled ? SCROLL_MS : 0);
    return () => window.clearTimeout(timer);
  }, [ring, reveal]);

  // The headers' columns: the grid's own, without the rail, which stays put.
  const headTemplate = template.slice(`${RAIL_PX}px `.length);

  return (
    // Two scrollers, one axis each (review): the outer moves only up and
    // down — the avatar, the sticky header bar, the days — and the inner
    // moves only sideways — the columns, the rail sticky at its left. A
    // drag latches to one of them natively, momentum included, so it never
    // drifts diagonally; the header bar follows the inner's sideways scroll.
    <div
      ref={scroller}
      data-lane-grid
      data-columns={even ? 'even' : 'fixed'}
      // A tap anywhere off the pieces lets the active one go (review).
      onClick={(event) => {
        if (!editing?.activeId) return;
        if ((event.target as Element).closest(ON_PIECE)) return;
        editing.deactivate();
      }}
      className="no-scrollbar relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
    >
      {/* The avatar: large, centred, scrolling away with the days. */}
      {initials !== null ? (
        <div data-avatar-row className="flex justify-center pt-5 pb-6">
          {/* My face is the way to my profile (0018). */}
          <button
            type="button"
            data-avatar
            aria-label="Profile"
            disabled={!onAvatar}
            onClick={onAvatar}
            className="flex rounded-full"
          >
            <Avatar
              id={me}
              initials={initials}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-white/25 text-2xl font-medium text-white/70"
            />
          </button>
        </div>
      ) : null}

      {/* The lane headers: one bar sticky at the top, on the water so rows
          pass beneath, moved sideways with the columns. A header opens its
          lane's page (round 3). The Date view has no columns, so no bar. */}
      {dateView ? null : (
        <div data-grid-header className="bg-main-900 sticky top-0 z-30 flex">
          <div aria-hidden className="shrink-0" style={{ width: RAIL_PX }} />
          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              ref={head}
              data-grid-head
              className={`grid ${even ? 'w-full' : 'w-max'}`}
              style={{ gridTemplateColumns: headTemplate }}
            >
              {categories.map((lane) => (
                <ColumnHeader key={lane.id} column={lane} />
              ))}
              {orphans ? <div data-lane-header="" className="pb-2" /> : null}
              {plusColumn ? (
                <div className="flex items-start justify-center pb-2">
                  <button
                    type="button"
                    aria-label="New lane"
                    data-new-lane
                    onClick={onCreateLane}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 text-white/60"
                  >
                    <Plus aria-hidden size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div
        ref={across}
        data-x-scroller
        onScroll={followAcross}
        className={`no-scrollbar ${dateView ? '' : 'overflow-x-auto overflow-y-hidden overscroll-x-contain'}`}
      >
        <div
          ref={gridRef}
          data-grid
          // One stacking layer for every row's pieces (isolate), its rail over them.
          className={`relative isolate grid ${even ? 'w-full' : 'w-max min-w-full'}`}
          // Every day row at least this tall and as tall as its fullest cell,
          // so stacked marks grow the row rather than spill into the next.
          style={{ gridTemplateColumns: template, gridAutoRows: 'auto' }}
        >
          {rows.map((row, index) => {
            // The Date view draws no gaps: every day it lists sits the same
            // distance from the next, however many empty days lie between
            // (review).
            if (row.kind === 'gap') {
              if (dateView) return null;
              return (
                <GapRow
                  key={row.from}
                  from={row.from}
                  to={row.to}
                  columns={dateView ? 0 : columns}
                  plus={!dateView && plusColumn}
                />
              );
            }
            const { day } = row;
            // The month is named on its first named day.
            const monthChanges = !rows
              .slice(0, index)
              .some((r) => r.kind === 'day' && monthKey(r.day) === monthKey(day));
            const marks = (
              lane: string,
              icon: string | null,
              only?: ReadonlySet<string>,
            ): ReactNode =>
              (byCell.get(`${day}|${lane}`) ?? [])
                .filter((card) => !only || only.has(card.splash.id))
                .map((card) => (
                  <Mark
                    key={card.splash.id}
                    card={card}
                    // A member's column has no emoji: the post's own lane stands in (H23).
                    icon={card.splash.icon ?? card.lane?.icon ?? icon}
                    dived={waterIds.has(card.splash.id)}
                    ring={ringAt?.id === card.splash.id ? ringAt.seq : null}
                    titled={titled}
                    onPick={onPick}
                  />
                ));
            if (dateView) {
              return (
                <DateDay key={day} day={day} monthChanges={monthChanges}>
                  {(byDay.get(day) ?? []).map((card) => (
                    <PostRow
                      key={card.splash.id}
                      card={card}
                      lane={laneOfCard(card, categories)}
                      current={!waterIds.has(card.splash.id)}
                      ring={ringAt?.id === card.splash.id ? ringAt.seq : null}
                      onPick={onPick}
                      // A joint splash is one row, as on the grid (review): its
                      // writers' faces and ripple count, never its ripples.
                      // A joint record's faces (review); its reactions count themselves.
                      after={
                        card.branches ? (
                          <JointFaces branches={card.branches} size={26} />
                        ) : undefined
                      }
                    />
                  ))}
                </DateDay>
              );
            }
            // A day reads newest first, as the stack does (review): a run of
            // plain marks shares a row, a band is a row of its own, and only the
            // first row names the day.
            const segments: ({ kind: 'marks'; ids: Set<string> } | { kind: 'band'; card: Card })[] =
              [];
            for (const card of byDay.get(day) ?? []) {
              const last = segments[segments.length - 1];
              if (banded(card)) segments.push({ kind: 'band', card });
              else if (last?.kind === 'marks') last.ids.add(card.splash.id);
              else segments.push({ kind: 'marks', ids: new Set([card.splash.id]) });
            }
            if (laneBoard) {
              const pieceSegments = segmentsOf.get(day) ?? [];
              return (
                <Fragment key={day}>
                  {pieceSegments.map((segment, at) => {
                    if (segment.kind === 'band') {
                      // The whole width, as the Calendar's band, with its faces (review);
                      // when it waits for me, "Add your side" hangs from it in my column.
                      const size = laneBoard.metrics.caption.size;
                      const myColumn = me ? columnIds.indexOf(me) : -1;
                      const waitsForMe =
                        myColumn >= 0 &&
                        (segment.card.awaiting ?? []).some((face) => face.authorId === me);
                      const tapeY = waitsForMe ? 6 : (ROW_PX - TAPE_PX) / 2;
                      return (
                        <DayRow
                          key={`band-${segment.card.splash.id}`}
                          day={day}
                          monthChanges={monthChanges}
                          labelled={at === 0}
                        >
                          <div
                            data-lane-band={segment.card.splash.id}
                            className="relative"
                            style={{ gridColumn: `span ${Math.max(columns, 1)}`, height: ROW_PX }}
                          >
                            <BoardTapeView
                              tape={{
                                key: segment.card.splash.id,
                                id: segment.card.splash.id,
                                card: segment.card,
                                week: 0,
                                startCol: 0,
                                endCol: Math.max(columns - 1, 0),
                                startsHere: true,
                                endsHere: true,
                                muted: false,
                                x: 0,
                                y: tapeY,
                                w: columnPx * Math.max(columns, 1),
                                h: TAPE_PX,
                                size,
                              }}
                              lanes={categories}
                              metrics={laneBoard.metrics}
                              onPick={onPick}
                              ripple={ringAt?.id === segment.card.splash.id ? ringAt.seq : null}
                              editing={editing}
                            />
                            {waitsForMe ? (
                              <TapeSlot
                                card={segment.card}
                                x={myColumn * columnPx + 6}
                                y={tapeY + TAPE_PX - 2}
                                narrow={laneBoard.metrics.narrow}
                                onWrite={onWrite}
                              />
                            ) : null}
                          </div>
                          {plusColumn ? <Cell lane="+" /> : null}
                        </DayRow>
                      );
                    }
                    const week = weekOf.get(segment.key);
                    if (!week) return null;
                    const h = Math.max(ROW_PX, week.h + 8);
                    return (
                      <DayRow
                        key={segment.key}
                        day={day}
                        monthChanges={monthChanges}
                        labelled={at === 0}
                      >
                        <div
                          data-lane-pieces={day}
                          className="relative"
                          style={{ gridColumn: `span ${Math.max(columns, 1)}`, height: h }}
                        >
                          {Array.from({ length: Math.max(columns - 1, 0) }, (_, rope) => (
                            <span
                              key={rope}
                              aria-hidden
                              data-rope
                              className="pointer-events-none absolute inset-y-0 w-px bg-white/15"
                              style={{ left: (rope + 1) * columnPx }}
                            />
                          ))}
                          {/* The segment's pieces, placed as the engine laid them, centred in a short row. */}
                          <div
                            className="absolute inset-x-0"
                            style={{ top: -week.y + (h - week.h) / 2, height: laneBoard.height }}
                          >
                            {laneBoard.pieces
                              .filter((piece) => piece.week === week.index)
                              .map((piece) => (
                                // Which lane and day it is in, and whether it rings: for
                                // finding it, with no box of its own (display: contents).
                                <div
                                  key={piece.id}
                                  data-lane-piece={piece.id}
                                  data-cell={columnIds[piece.col]}
                                  data-ring={ringAt?.id === piece.id ? '' : undefined}
                                  className="contents"
                                >
                                  <BoardPieceView
                                    piece={piece}
                                    photos={boardPhotosSigned}
                                    lanes={categories}
                                    metrics={laneBoard.metrics}
                                    onPick={onPick}
                                    onWrite={onWrite}
                                    ripple={ringAt?.id === piece.id ? ringAt.seq : null}
                                    plunge={false}
                                    editing={editing}
                                    order={laneStacking?.order.get(piece.id) ?? 0}
                                    total={laneStacking?.total ?? 1}
                                    stacking={laneStacking}
                                  />
                                </div>
                              ))}
                          </div>
                        </div>
                        {plusColumn ? <Cell lane="+" /> : null}
                      </DayRow>
                    );
                  })}
                </Fragment>
              );
            }
            return (
              <Fragment key={day}>
                {segments.map((segment, at) =>
                  segment.kind === 'marks' ? (
                    <DayRow
                      key={`marks-${at}`}
                      day={day}
                      monthChanges={monthChanges}
                      labelled={at === 0}
                    >
                      {categories.map((lane, column) => (
                        <Cell key={lane.id} lane={lane.id} first={column === 0}>
                          {marks(lane.id, lane.icon, segment.ids)}
                        </Cell>
                      ))}
                      {orphans ? <Cell lane="">{marks('', null, segment.ids)}</Cell> : null}
                      {plusColumn ? <Cell lane="+" /> : null}
                    </DayRow>
                  ) : (
                    <JointBand
                      key={segment.card.splash.id}
                      card={segment.card}
                      day={day}
                      label={at === 0 ? { monthChanges } : null}
                      icon={
                        segment.card.splash.icon ??
                        laneOfCard(segment.card, categories)?.icon ??
                        null
                      }
                      dived={waterIds.has(segment.card.splash.id)}
                      ring={ringAt?.id === segment.card.splash.id ? ringAt.seq : null}
                      onPick={onPick}
                    />
                  ),
                )}
              </Fragment>
            );
          })}

          <div ref={sentinel} data-grid-end className="col-span-full h-px" />
        </div>
      </div>
    </div>
  );
});

/**
 * A column's header: a lane's emoji over its name, opening its page on
 * Home; in a pool's Members view a member's initials on a disc over their
 * name (H23). A pool's lane opens its page in the pool, as a lane's does on
 * Home (review); a member's column opens nothing.
 */
function ColumnHeader({ column }: { column: GridColumn }) {
  const href = column.href === undefined ? `/lane/${column.id}` : column.href;
  const body = (
    <>
      {column.monogram !== undefined ? (
        <Monogram name={column.monogram} size="head" photo={column.photo} />
      ) : column.avatar !== undefined ? (
        <span data-column-avatar className="flex">
          <Avatar
            id={column.id}
            initials={column.avatar}
            className="text-main-900/60 flex h-9 w-9 items-center justify-center rounded-full bg-white/40 text-xs font-medium"
          />
        </span>
      ) : (
        <span aria-hidden className="text-2xl/none">
          {column.icon}
        </span>
      )}
      <span className="max-w-full truncate text-[11px]/tight font-semibold">
        {column.avatar !== undefined ? (
          <PersonName id={column.id} name={column.name} />
        ) : (
          column.name
        )}
      </span>
    </>
  );
  const className = 'flex flex-col items-center gap-0.5 px-0.5 pb-2 text-white';
  return href ? (
    <Link href={href} data-lane-header={column.id} className={className}>
      {body}
    </Link>
  ) : (
    <div data-lane-header={column.id} className={className}>
      {body}
    </div>
  );
}

/** A day's row: its label on the rail, then a cell per column. */
/** The rail stays over every piece of the grid's one stacking order (stacking.ts). */
const RAIL_Z = 'z-[100000]';

function DayRow({
  day,
  monthChanges,
  labelled = true,
  children,
}: {
  day: IsoDate;
  monthChanges: boolean;
  /** A later row of the same day (after a band): its rail stays blank. */
  labelled?: boolean;
  children: ReactNode;
}) {
  if (!labelled) {
    return (
      <>
        <div
          aria-hidden
          data-day-continued={day}
          className={`bg-main-900 sticky left-0 ${RAIL_Z}`}
          style={{ minHeight: ROW_PX }}
        />
        {children}
      </>
    );
  }
  return (
    <>
      {/* The rail reads quieter than the marks: one readable opacity (review).
          A day row is at least ROW_PX tall and as tall as its fullest cell,
          so stacked marks grow the row rather than spill into the next. */}
      <div
        data-day-row={day}
        data-labelled=""
        className={`bg-main-900 sticky left-0 ${RAIL_Z} flex flex-col justify-center gap-0.5 py-2 pr-2 pl-6 text-white/70`}
        style={{ minHeight: ROW_PX }}
      >
        {monthChanges ? (
          <span data-month-label className="text-[10px]/none font-medium text-white/50">
            {day.slice(0, 4)}
            <br />
            {monthAbbrev(day)}
          </span>
        ) : null}
        <span className="text-sm/none font-medium tabular-nums">{Number(day.slice(8, 10))}</span>
        <span className="text-[10px]/none font-medium text-white/50">{weekdayOf(day)}</span>
      </div>
      {children}
    </>
  );
}

/** A run of empty days, compressed to one short row of empty ropes: the rail says nothing. */
function GapRow({
  from,
  to,
  columns,
  plus,
}: {
  from: IsoDate;
  to: IsoDate;
  columns: number;
  plus: boolean;
}) {
  return (
    <>
      <div
        data-day-row={from}
        data-day-to={to}
        data-gap=""
        className={`bg-main-900 sticky left-0 ${RAIL_Z}`}
        style={{ height: GAP_PX }}
      />
      {columns === 0 ? <div /> : null}
      {Array.from({ length: columns }, (_, at) => (
        <Cell key={at} lane="" first={at === 0} />
      ))}
      {plus ? <Cell lane="+" /> : null}
    </>
  );
}

/**
 * The row that holds a day: its own, or the gap its run is compressed into;
 * in the Date view, which draws no gaps, the next older day it lists.
 */
function rowHolding(scroller: HTMLElement, day: IsoDate): HTMLElement | null {
  for (const row of scroller.querySelectorAll<HTMLElement>('[data-day-row]')) {
    const from = row.getAttribute('data-day-row') ?? '';
    const to = row.getAttribute('data-day-to') ?? from;
    if (day <= from && day >= to) return row;
    if (from < day) return row;
  }
  return null;
}

/**
 * A cell: the rope along its left edge — a lane line runs beside the lane,
 * never through its marks (review), and the first lane has none at the
 * rail's side — and the day's marks on that lane stacked 4px apart, centred
 * in the row. The `+` column's rope closes the last lane.
 */
function Cell({
  lane,
  first = false,
  children,
}: {
  lane: string;
  first?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-cell={lane}
      className="relative flex h-full flex-col items-center justify-center gap-1 py-2"
    >
      {first ? null : (
        <span
          aria-hidden
          data-rope
          className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white/15"
        />
      )}
      {children}
    </div>
  );
}

/**
 * A post's mark: a white disc with its lane's emoji, solid for the post on
 * top of the board and translucent for every other, the ring around it
 * when Home says so. A
 * post on no lane of mine has no emoji to show, so its disc is an outline —
 * a seat with nothing on it, never a blank white coin.
 */
function Mark({
  card,
  icon,
  dived,
  ring,
  titled,
  onPick,
}: {
  card: Card;
  icon: string | null;
  dived: boolean;
  /** The ring's sequence number while it plays here, else null. */
  ring: number | null;
  /** The short title beneath the mark, two lines at most (round 3). */
  titled: boolean;
  onPick: (id: string) => void;
}) {
  const title = card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
  const surface = !icon ? 'border border-white/60' : dived ? 'bg-white/20' : 'bg-white';
  const disc = (
    <span className="relative flex items-center justify-center">
      {ring !== null ? (
        <span
          key={ring}
          aria-hidden
          data-commit-ripple
          // White on the water (H21c), and never shrunk to the mark's width.
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"
        >
          <span className="flex shrink-0">
            <CommitRing size={RING_PX} contentSize={MARK_PX} gap={6} once />
          </span>
        </span>
      ) : null}
      <button
        type="button"
        data-mark={card.splash.id}
        data-dived={dived ? '' : undefined}
        data-ring={ring !== null ? '' : undefined}
        aria-label={title}
        onClick={() => onPick(card.splash.id)}
        data-joint-mark={card.joint ? '' : undefined}
        // A joint splash is the pool's rounded square, as pools are on the
        // strip, so the Lane view shows it is the pool's (review).
        className={`relative flex shrink-0 items-center justify-center text-sm/none ${
          card.joint ? 'rounded-lg' : 'rounded-full'
        } ${surface}`}
        style={{ width: MARK_PX, height: MARK_PX }}
      >
        {icon ? (
          <span aria-hidden className={`leading-none ${dived ? 'opacity-60' : ''}`}>
            {icon}
          </span>
        ) : null}
        {card.pools && card.pools.length > 0 ? (
          // Shared to a pool (H23): its monogram on the disc's shoulder.
          <span className="absolute -top-1.5 -right-2.5" data-mark-pool>
            <Monogram name={card.pools[0]} size="chip" photo={card.poolPhoto ?? null} />
          </span>
        ) : null}
      </button>
    </span>
  );
  if (!titled) return disc;
  return (
    <span className="flex w-full min-w-0 flex-col items-center gap-1 px-1">
      {disc}
      <button
        type="button"
        tabIndex={-1}
        data-mark-title={card.splash.id}
        onClick={() => onPick(card.splash.id)}
        className={`line-clamp-2 w-full text-center text-[10px]/tight font-medium break-words text-white ${
          dived ? 'opacity-60' : ''
        }`}
      >
        {title}
      </button>
      {card.author ? (
        // Whose it is, in a pool's Lane view (H23).
        <span
          data-mark-author
          className={`max-w-full truncate text-[10px]/none font-medium text-white/60 ${dived ? 'opacity-60' : ''}`}
        >
          <PersonName id={card.authorId} name={card.authorName ?? card.author} />
        </span>
      ) : null}
    </span>
  );
}

/** The element a post shows as on either view: its mark, or its pill. */
function markSelector(id: string): string {
  const escaped = CSS.escape(id);
  // Drawn with pieces (0045), a post is its piece.
  return `[data-mark="${escaped}"], [data-pill="${escaped}"], [data-board-piece="${escaped}"]`;
}

const NO_PIECES: [] = [];

/** A day drawn with pieces: a run of pieces, or a full-width band (Members, Everyone). */
type PieceSegment =
  { kind: 'pieces'; key: string; ids: Set<string> } | { kind: 'band'; card: Card };

/** An element's position within the scroller's content. */
function offsetIn(el: HTMLElement, scroller: HTMLElement): { top: number; left: number } {
  const a = el.getBoundingClientRect();
  const b = scroller.getBoundingClientRect();
  return { top: a.top - b.top + scroller.scrollTop, left: a.left - b.left + scroller.scrollLeft };
}

function headerHeight(scroller: HTMLElement): number {
  return scroller.querySelector<HTMLElement>('[data-grid-header]')?.offsetHeight ?? 0;
}

function scrollWithin(
  el: HTMLElement,
  target: { top?: number; left?: number },
  reducedMotion: boolean,
): void {
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ ...target, behavior: reducedMotion ? 'instant' : 'smooth' });
    return;
  }
  if (target.top !== undefined) el.scrollTop = target.top;
  if (target.left !== undefined) el.scrollLeft = target.left;
}
