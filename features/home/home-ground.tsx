'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { CategorySheet } from '@/features/lanes/category-sheet';
import { LanesSheet } from '@/features/lanes/lanes-sheet';
import { deleteRipple } from '@/features/ripple-sheet/actions';
import { deleteSplash, setSplashPinned } from '@/features/splash/actions';
import type { SplashSummary } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { FlipBoard } from './diving-board-flip';
import { GroundFoot } from './ground-foot';
import { byNewest, newestIn, placeCard, withEdits, type Card, type GridColumn } from './grid';
import { LaneGrid, type GridHandle, type Ring } from './lane-grid';
import { PinnedCards } from './pinned-cards';
import { StairBoard } from './stair-board';
import { useFlip } from './use-flip';
import { homeViewName, nextHomeView, ViewToggle, type HomeView } from './view-toggle';
import { BoardFrame, MonthBoard } from '@/features/month-board/month-board';
import { LayoutPanel } from '@/features/month-board/layout-panel';
import { LayoutSheet } from '@/features/month-board/layout-sheet';
import { useBoardEditing, useLayoutHistory } from '@/features/month-board/use-board-editing';
import type { Recipe } from '@/features/month-board/layout';
import { useLayoutDrafts } from '@/features/month-board/use-layout-drafts';
import { useWide } from '@/components/ui/use-wide';
import { monthKey } from '@/features/splash/summary';
import { PlaceHeader } from '@/features/header/place-header';
import { usePeople } from '@/features/people/people-provider';
import { ProfileSheet } from '@/features/people/profile-sheet';
import { ThemePicker } from '@/features/people/theme-picker';
import { DeleteAccount } from '@/features/account/delete-account';
import { SettingsSheet } from '@/features/settings/settings-sheet';
import { ShareSheet } from '@/features/share-image/share-sheet';
import { useSettings } from '@/features/settings/use-settings';

/**
 * Which board Home shows (review, 2026-10-22): the **stair** — read cards
 * stepping up above the top card, unread stepping down below — or the
 * **page turn** onto a pile of strips. Both stay in the tree; this one word
 * decides.
 */
export type Board = 'stair' | 'flip';
export const BOARD: Board = 'stair';

/** How long the commit ripple is given at a new post's mark once the real one has landed. */
const RING_MS = 1800;
/** The post on top, remembered for this tab, so coming back finds it again (round 3). */
const TOP_KEY = 'weming.home-top';

/**
 * Home, the water ground (SPEC 5, H22; round 3): one solid #0507C9 surface
 * in two linked halves. Above, the **Lane view** — the grid, lanes across
 * and days down — or the **Date view** — the days as a list, each day's
 * posts as pills — chosen by the header's toggle and remembered per device.
 * Below, the diving board — the posts as a staircase around the top card.
 * The ring plays at the mark or pill of whichever card the stack is
 * heading to; tapping a mark, a pill or a pinned card brings its card up.
 *
 * The header: the lane glyph at the left opens lane management; the
 * toggle at the centre. Pinned posts are cards under the header on a
 * phone, above the stack on a wide screen. Compose is the white disc at
 * the bottom right. Coming back from a post's page finds the same card on
 * top.
 *
 * A post just dropped is on the grid and on top of the stack before the
 * server has it (CLAUDE.md, the principle); lanes edited read edited at
 * once; a post deleted a moment ago is gone.
 */
export function HomeGround({
  cards,
  pinned,
  categories,
  today,
  timeZone,
  initials,
  scrollToMonth,
  topParam = null,
  poolColumns = [],
  board = BOARD,
  initialView = 'board',
}: {
  /** Newest first. */
  cards: Card[];
  pinned: SplashSummary[];
  categories: MyCategory[];
  today: IsoDate;
  timeZone: string;
  initials: string;
  /** `?m=`: the month the ground opens on, its newest post on top. */
  scrollToMonth: string | null;
  /** `?top=`: the post to open with on top, where a post's page sends Home back to. */
  topParam?: string | null;
  /**
   * After my lanes, one column per pool holding my pool records and joint
   * records I have not filed (0014, H45), headed by the pool's monogram and name.
   */
  poolColumns?: GridColumn[];
  board?: Board;
  /** The view a visit opens on: the Calendar, always, outside a test (review). */
  initialView?: HomeView;
}) {
  const [newLane, setNewLane] = useState(false);
  // The gear's sheet (0059), and my profile from my face.
  const settings = useSettings();
  const [profile, setProfile] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { me } = usePeople();
  // Every visit opens on the Calendar, not the view used last (review); a
  // view chosen here holds while I stay.
  const [view, setView] = useState<HomeView>(initialView);
  const {
    openSheet,
    pendingDrop,
    clearDropped,
    dropMessage,
    pendingDeletes,
    markDeleted,
    pendingEdits,
  } = useInputSheet();
  const lanes = useOptimisticAction(categories);
  // Pinned from the card's menu shows at once (CLAUDE.md, the principle).
  const pins = useOptimisticAction(pinned);
  const pinnedIds = useMemo(() => new Set(pins.value.map((p) => p.id)), [pins.value]);
  const pin = (card: Card, on: boolean): void =>
    pins.run(
      (current) =>
        on
          ? [{ ...card.splash, pinnedAt: new Date().toISOString() }, ...current]
          : current.filter((p) => p.id !== card.splash.id),
      () => setSplashPinned(card.splash.id, on),
    );
  // Gone the moment it is asked for, from every surface; a lone block is its own post.
  const remove = (card: Card): void => {
    markDeleted(card.splash.id);
    // The rows follow in the action's own response (revalidatePath): no second read.
    void (card.splash.orphan ? deleteRipple(card.splash.id) : deleteSplash(card.splash.id));
  };
  const grid = useRef<GridHandle>(null);

  // The post just dropped takes its place before the server has it; once the
  // real row is on the ground the optimistic one steps aside. A post deleted
  // a moment ago is gone before the re-read.
  const landed =
    pendingDrop !== null && cards.some(({ splash }) => splash.id === pendingDrop.splash.id);
  const shown = useMemo(() => {
    // An edit made a moment ago shows at once (review).
    const kept = withEdits(cards, pendingEdits).filter(
      ({ splash }) => !pendingDeletes.includes(splash.id),
    );
    if (!pendingDrop || landed) return kept;
    return [
      ...kept,
      {
        ...placeCard(pendingDrop.splash, pendingDrop.note ?? '', timeZone),
        ...pendingDrop.home?.card,
      },
    ].sort(byNewest);
  }, [cards, pendingEdits, pendingDeletes, pendingDrop, landed, timeZone]);

  useEffect(() => {
    if (!landed) return;
    const timer = window.setTimeout(clearDropped, RING_MS);
    return () => window.clearTimeout(timer);
  }, [landed, clearDropped]);

  // A pool's column for a post just dropped there, until the server's has it.
  const pendingColumn = landed ? undefined : pendingDrop?.home?.column;
  const columns = useMemo(
    () => [
      ...lanes.value,
      ...poolColumns,
      ...(pendingColumn && !poolColumns.some((c) => c.id === pendingColumn.id)
        ? [pendingColumn]
        : []),
    ],
    [lanes.value, poolColumns, pendingColumn],
  );
  const ids = useMemo(() => shown.map((card) => card.splash.id), [shown]);
  // What opens on top: the post a page sent Home back to, else the month's
  // newest under `?m=`, else the newest.
  const [initialTop] = useState(
    () =>
      (topParam && ids.includes(topParam) ? topParam : null) ??
      (scrollToMonth ? newestIn(shown, scrollToMonth)?.splash.id : null) ??
      ids[0] ??
      null,
  );
  const flip = useFlip(ids, initialTop, board === 'stair' ? -1 : 1);
  const { heading, bringForward, jumpTo } = flip;
  // The calendar's hand-set layouts as the panel edits them (review): drawn
  // at once, saved when the sliders rest; mine on Home.
  // Each save the database takes, kept to undo per piece and view until I leave (review).
  const history = useLayoutHistory();
  const drafts = useLayoutDrafts(shown, null, 'calendar', history.recorders.calendar);
  // The Lane view's own (0045): its layout read as the card's, saved as the Lane view's.
  const laneShown = useMemo(
    () =>
      shown.map((card) => ({
        ...card,
        layout: card.laneLayout?.layout,
        layoutSource: card.laneLayout?.layoutSource,
        poolLayout: card.laneLayout?.poolLayout,
      })),
    [shown],
  );
  const laneDrafts = useLayoutDrafts(laneShown, null, 'lane', history.recorders.lane);
  // The recipe the board drew each piece with: what Inline shows while it is the recipe's.
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const wide = useWide();
  const laneView = view === 'lane';
  // The panel edits the view on screen: the Calendar's layouts, or the Lane view's.
  const viewDrafts = laneView ? laneDrafts : drafts;
  const topCard = viewDrafts.drawn.find((card) => card.splash.id === heading) ?? null;
  const goTo = bringForward;
  // Direct manipulation (review): a second tap on the top card's piece edits
  // it by hand. Every Home layout is mine to set. More opens the panel on a
  // desktop and the sheet on a phone.
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const editing = useBoardEditing({
    drafts: viewDrafts,
    history,
    view: laneView ? 'lane' : 'calendar',
    topId: heading,
    canEdit: view === 'board' || laneView,
    onPick: goTo,
    onMore: () => (wide ? setPanelOpen(true) : setSheetOpen(true)),
  });
  // The sheet goes with the piece it edits.
  if (sheetOpen && editing.activeId === null) setSheetOpen(false);

  // A bare `/` reached by the browser's back button finds the card that was
  // on top in this tab, put back at once rather than flipped to (review).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (topParam || scrollToMonth) return;
    let remembered: string | null = null;
    try {
      remembered = window.sessionStorage.getItem(TOP_KEY);
    } catch {
      remembered = null;
    }
    if (remembered && remembered !== initialTop && ids.includes(remembered)) jumpTo(remembered);
  }, [topParam, scrollToMonth, initialTop, ids, jumpTo]);
  useEffect(() => {
    if (!heading) return;
    try {
      window.sessionStorage.setItem(TOP_KEY, heading);
    } catch {
      // Not remembered, then.
    }
  }, [heading]);

  // The ring: at the mark of whichever card the stack is heading to — from
  // the moment a flip is committed to, not once it lands (review) — at a
  // drop, and on open at the post on top, which also scrolls to it.
  const [ring, setRing] = useState<Ring | null>(() =>
    initialTop ? { id: initialTop, seq: 0 } : null,
  );
  const seq = useRef(0);
  const ringAt = (id: string): void => {
    seq.current += 1;
    setRing({ id, seq: seq.current });
  };
  const previousHeading = useRef(heading);
  useEffect(() => {
    if (heading && heading !== previousHeading.current) ringAt(heading);
    previousHeading.current = heading;
    // The heading changing is the event; the rest is read when it fires.
  }, [heading]);

  // A post just dropped lands on top of the stack, on the spring, ringed.
  const droppedId = pendingDrop?.splash.id ?? null;
  useEffect(() => {
    if (!droppedId) return;
    goTo(droppedId);
    ringAt(droppedId);
    // The drop is the event; the flip's identity changing is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedId]);

  // `?m=` while the ground is already open: the month's newest post comes up.
  const monthTop = scrollToMonth ? (newestIn(shown, scrollToMonth)?.splash.id ?? null) : null;
  useEffect(() => {
    if (monthTop) goTo(monthTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMonth]);

  // The Board view's month: `?m=` when given, else the month of the post on
  // top, else this month; its arrows move it from there.
  const [boardMonth, setBoardMonth] = useState(() => {
    const top = topParam ? shown.find((card) => card.splash.id === initialTop) : undefined;
    return scrollToMonth ?? (top ? monthKey(top.day) : monthKey(today));
  });
  // A new `?m=` while open moves the board there, set as it renders.
  const [boardParam, setBoardParam] = useState(scrollToMonth);
  if (scrollToMonth !== boardParam) {
    setBoardParam(scrollToMonth);
    if (scrollToMonth) setBoardMonth(scrollToMonth);
  }
  const boardView = view === 'board';

  // Every mark but the one the stack is heading to reads translucent: the
  // one solid mark is the post being read.
  const waterIds = useMemo(() => new Set(ids.filter((id) => id !== heading)), [ids, heading]);

  const pinnedCards = useMemo(() => {
    const byId = new Map(shown.map((card) => [card.splash.id, card]));
    return pins.value
      .filter((p) => !pendingDeletes.includes(p.id))
      .map((p) => byId.get(p.id) ?? placeCard(p, '', timeZone));
  }, [pins.value, pendingDeletes, shown, timeZone]);
  // Both slots render from the server and CSS shows one per breakpoint, so
  // on a wide screen the cards are in the stack's column from the first
  // frame — never moved there by script after load (review).
  const pinnedStrip = (slot: 'phone' | 'wide') => (
    <PinnedCards
      slot={slot}
      cards={pinnedCards}
      categories={lanes.value}
      initials={initials}
      onPick={goTo}
    />
  );

  return (
    <div data-home-ground className="water-ground flex min-h-0 flex-1 flex-col">
      {/* A phone stacks the halves; a wide screen sets them side by side, the
          grid left and the board right, the board's column as tall as the
          screen (review). */}
      <div
        data-ground-row
        className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col lg:max-w-7xl lg:flex-row lg:gap-8"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div
          data-grid-column
          // Wide, every view on the left takes two thirds and the stack one (review).
          className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:flex-[2]"
        >
          {/* The header (0059), a pool's in shape: Home alone, the bell, my
              face, the gear; the views beneath. */}
          <div data-home-header>
            <PlaceHeader
              name="Home"
              faces={me ? [{ userId: me, initials }] : []}
              me={me}
              onMyFace={() => setProfile(true)}
              onSettings={() => settings.open('home')}
              tabs={<ViewToggle view={view} onChange={setView} />}
            />
          </div>

          {dropMessage || lanes.message ? (
            <p role="alert" className="shrink-0 px-6 pb-2 text-sm text-white/80">
              {dropMessage ?? lanes.message}
            </p>
          ) : null}

          {/* On a phone the Board takes the pinned strip's height (review). */}
          {boardView ? null : pinnedStrip('phone')}
          {boardView ? (
            // In the grid's place, the stack beside or beneath it as in the
            // Lane view: a tap brings the post's card to the top.
            <BoardFrame>
              <MonthBoard
                cards={drafts.drawn}
                month={boardMonth}
                onMonth={setBoardMonth}
                today={today}
                ring={ring}
                dropped={pendingDrop?.splash.id ?? null}
                onPick={goTo}
                lanes={columns}
                onDrawn={setRecipes}
                editing={editing}
                onShare={() => setSharing(true)}
              />
            </BoardFrame>
          ) : (
            <>
              <LaneGrid
                ref={grid}
                view={view}
                cards={laneView ? laneDrafts.drawn : shown}
                pieces
                onDrawn={setRecipes}
                categories={columns}
                today={today}
                ring={ring}
                waterIds={waterIds}
                // No face above the lanes on Home (review): my profile is the gear's.
                initials={null}
                scrollToMonth={scrollToMonth}
                onPick={goTo}
                onCreateLane={() => setNewLane(true)}
                editing={laneView ? editing : null}
              />
            </>
          )}
        </div>

        <div
          data-board-column
          className="flex shrink-0 flex-col lg:min-h-0 lg:min-w-0 lg:flex-1 lg:py-10"
        >
          {pinnedStrip('wide')}
          {board === 'stair' ? (
            <StairBoard
              cards={shown}
              flip={flip}
              categories={lanes.value}
              initials={initials}
              pinnedIds={pinnedIds}
              onPin={pin}
              onDelete={remove}
              low={boardView}
              collapsed={editing.activeId !== null}
            />
          ) : (
            <FlipBoard cards={shown} flip={flip} categories={lanes.value} initials={initials} />
          )}
          {/* Desktop only (review): the top card's layout, under the stack; not keyed by the card, so open it stays open as another label is picked. */}
          {(boardView || laneView) && wide && topCard ? (
            <LayoutPanel
              layers={editing.layers}
              card={topCard}
              recipe={recipes[topCard.splash.id] ?? null}
              layout={viewDrafts.shown(topCard.splash.id).layout}
              source={viewDrafts.shown(topCard.splash.id).source}
              home
              view={laneView ? 'lane' : 'calendar'}
              message={viewDrafts.message}
              onEdit={(patch, clear) => viewDrafts.edit(topCard.splash.id, patch, clear)}
              onRevert={() => viewDrafts.revertToPool(topCard.splash.id)}
              open={panelOpen}
              onOpenChange={setPanelOpen}
            />
          ) : null}
          {sheetOpen && !wide && topCard ? (
            <LayoutSheet
              editing={editing}
              card={topCard}
              recipe={recipes[topCard.splash.id] ?? null}
              layout={viewDrafts.shown(topCard.splash.id).layout}
              source={viewDrafts.shown(topCard.splash.id).source}
              home
              view={laneView ? 'lane' : 'calendar'}
              message={viewDrafts.message}
              onEdit={(patch, clear) => viewDrafts.edit(topCard.splash.id, patch, clear)}
              onRevert={() => viewDrafts.revertToPool(topCard.splash.id)}
              onClose={() => setSheetOpen(false)}
            />
          ) : null}

          {/* The foot (H23): Home — each tap switches the view, Lane to
              Date and back (review) — then Pool, and compose at the right. */}
          <GroundFoot
            here="home"
            homeLabel={`Home, showing ${homeViewName(view)}; tap for ${homeViewName(nextHomeView(view))}`}
            onHome={() => setView(nextHomeView(view))}
            onCompose={() => openSheet()}
          />
        </div>

        {/* Wide: the same three, stacked at the right edge (review). */}
        <GroundFoot
          slot="wide"
          here="home"
          homeLabel={`Home, showing ${homeViewName(view)}; tap for ${homeViewName(nextHomeView(view))}`}
          onHome={() => setView(nextHomeView(view))}
          onCompose={() => openSheet()}
        />
      </div>

      {newLane ? (
        <CategorySheet category={null} apply={lanes.run} onClose={() => setNewLane(false)} />
      ) : null}
      <SettingsSheet
        title="Settings"
        tabs={[
          {
            key: 'home',
            label: 'Home',
            render: () => (
              <section data-settings-lanes className="flex flex-col gap-3">
                <h2 className="text-ink font-semibold">My lanes</h2>
                <LanesSheet categories={lanes.value} apply={lanes.run} message={lanes.message} />
              </section>
            ),
          },
          { key: 'theme', label: 'Theme', render: () => <ThemePicker /> },
          // Leave Pool's place on Home (H53): the account's own door, small.
          { key: 'advanced', label: 'Advanced', render: () => <DeleteAccount /> },
        ]}
      />
      {profile ? <ProfileSheet onClose={() => setProfile(false)} /> : null}
      {sharing ? (
        <ShareSheet
          cards={drafts.drawn}
          lanes={columns}
          today={today}
          poolName={null}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </div>
  );
}
