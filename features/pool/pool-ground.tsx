'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Settings } from 'lucide-react';

import { Monogram } from '@/components/ui/monogram';

import { GroundFoot } from '@/features/home/ground-foot';
import { withEdits, type Card } from '@/features/home/grid';
import { LaneGrid, type Ring } from '@/features/home/lane-grid';
import { LaneIcon } from '@/features/home/lane-icon';
import { PinnedCards } from '@/features/home/pinned-cards';
import { StairBoard } from '@/features/home/stair-board';
import { useFlip } from '@/features/home/use-flip';
import { SegmentedToggle } from '@/features/home/view-toggle';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { deleteSplash, setSplashPinned } from '@/features/splash/actions';
import type { PoolView } from '@/lib/queries/pools';
import type { IsoDate } from '@/lib/time';
import { useOptimisticAction } from '@/lib/use-optimistic-action';
import { Avatar } from '@/features/people/avatar';
import { BoardFrame, MonthBoard } from '@/features/month-board/month-board';
import { monthKey } from '@/features/splash/summary';

import { poolScopeOf } from './compose-scope';
import { deleteJointSplash } from './actions';
import { InvitePanel } from './invite-panel';
import { MembersSheet } from './members-sheet';
import { poolCards, poolColumns, poolPinned, withPoolMoves, type PoolViewKind } from './pool-cards';
import { PoolLanesSheet } from './pool-lanes-sheet';
import { rememberVisit } from './remembered';
import { PoolSheet, SheetTitle } from './sheet';

/** The view after this one, in the toggle's order. */
function nextView(view: PoolViewKind): PoolViewKind {
  const at = VIEWS.findIndex((v) => v.value === view);
  return VIEWS[(at + 1) % VIEWS.length].value;
}

import { POOL_VIEWS as VIEWS } from './pool-views';

/** What a view is called, for the foot's label. */
function viewName(view: PoolViewKind): string {
  return VIEWS.find((v) => v.value === view)?.label ?? view;
}

/** How many members' initials the header shows before the `+`. */
const HEADER_AVATARS = 3;

type Sheet = 'members' | 'invite' | 'lanes' | null;

/**
 * A pool's home (H23; `_docs/mockups/pool-home.png`, `pool-swimmers.png`):
 * the same water ground as Home, scoped to one pool. The header is the
 * pool's name (going to another pool is the foot's strip), the members' initials and a `+`
 * that opens the invite link, and the settings gear; beneath it the lane
 * glyph (the pool's lanes, any member edits them), the Lane | Date |
 * Swimmers toggle, and the members icon. Pinned cards and the stair stack
 * work as on Home: cards carry their author's initials, joint splashes are
 * bands with their ripples branching off. The foot is Home · Pool · +, and
 * compose from here defaults to this pool.
 */
export function PoolGround({
  view,
  me,
  today,
  timeZone,
  topParam = null,
  initialView = 'board',
}: {
  view: PoolView;
  me: string;
  today: IsoDate;
  timeZone: string;
  topParam?: string | null;
  /** The view a visit opens on: the Calendar, always, outside a test. */
  initialView?: PoolViewKind;
}) {
  const router = useRouter();
  const poolId = view.pool.id;
  // Every visit opens on the Calendar, not Swimmers (review); a view chosen
  // here holds while I stay.
  const [kind, setKind] = useState<PoolViewKind>(initialView);
  const [sheet, setSheet] = useState<Sheet>(null);
  const {
    openSheet,
    pendingDrop,
    clearDropped,
    pendingDeletes,
    markDeleted,
    dropMessage,
    pendingEdits,
  } = useInputSheet();

  // Opening a pool makes it the one the Pool tab opens, seen as of now.
  useEffect(() => rememberVisit(poolId), [poolId]);

  const cards = useMemo(() => poolCards(view, kind, me, timeZone), [view, kind, me, timeZone]);
  const columns = useMemo(() => poolColumns(view, kind), [view, kind]);

  // A post just dropped here is on the grid before the server has it.
  const dropHere = pendingDrop?.pool?.poolId === poolId ? pendingDrop.pool.card : null;
  const landed = dropHere !== null && cards.some((c) => c.splash.id === dropHere.splash.id);
  const shown = useMemo(() => {
    // An edit made a moment ago shows at once (review).
    const kept = withPoolMoves(withEdits(cards, pendingEdits), pendingEdits, kind, view.pool.name, {
      id: me,
      initials: view.members.find((m) => m.userId === me)?.initials ?? '',
    }).filter((c) => !pendingDeletes.includes(c.splash.id));
    if (!dropHere || landed) return kept;
    // In Swimmers my drop sits in my column, and a joint splash's first ripple branches into it.
    const seated: Card =
      kind === 'swimmers'
        ? {
            ...dropHere,
            column: me,
            branches: dropHere.branches?.map((branch) => ({ ...branch, column: me })),
          }
        : dropHere;
    return [seated, ...kept];
  }, [
    cards,
    pendingEdits,
    pendingDeletes,
    dropHere,
    landed,
    kind,
    me,
    view.pool.name,
    view.members,
  ]);
  useEffect(() => {
    if (!landed) return;
    const timer = window.setTimeout(clearDropped, 1800);
    return () => window.clearTimeout(timer);
  }, [landed, clearDropped]);

  const pinned = useOptimisticAction(poolPinned(cards, me, view));
  const pinnedIds = useMemo(() => new Set(pinned.value.map((c) => c.splash.id)), [pinned.value]);
  const pin = (card: Card, on: boolean): void =>
    pinned.run(
      (current) =>
        on
          ? [
              { ...card, splash: { ...card.splash, pinnedAt: new Date().toISOString() } },
              ...current,
            ]
          : current.filter((c) => c.splash.id !== card.splash.id),
      () => setSplashPinned(card.splash.id, on),
    );
  const remove = (card: Card): void => {
    markDeleted(card.splash.id);
    void (
      card.branches ? deleteJointSplash(poolId, card.splash.id) : deleteSplash(card.splash.id)
    ).then((result) => {
      if (result.ok) router.refresh();
    });
  };

  const ids = useMemo(() => shown.map((c) => c.splash.id), [shown]);
  const [initialTop] = useState(() =>
    topParam && ids.includes(topParam) ? topParam : (ids[0] ?? null),
  );
  const flip = useFlip(ids, initialTop, -1);
  const { heading, bringForward } = flip;

  const [ring, setRing] = useState<Ring | null>(() =>
    initialTop ? { id: initialTop, seq: 0 } : null,
  );
  const seq = useRef(0);
  const previous = useRef(heading);
  useEffect(() => {
    if (heading && heading !== previous.current) {
      seq.current += 1;
      setRing({ id: heading, seq: seq.current });
    }
    previous.current = heading;
  }, [heading]);
  const droppedId = dropHere?.splash.id ?? null;
  useEffect(() => {
    if (droppedId) bringForward(droppedId);
    // The drop is the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedId]);

  // Re-tapping Pool while in a pool walks the views; the toggle follows (review).
  const cycleView = (): void => setKind(nextView(kind));
  // Compose from here defaults to this pool, its lanes as I linked them (H23).
  const composeHere = (): void => openSheet(poolScopeOf(view));
  // The Board view's month: that of the post on top, else this month.
  const [boardMonth, setBoardMonth] = useState(() => {
    const top = shown.find((c) => c.splash.id === initialTop);
    return monthKey(top ? top.day : today);
  });
  const boardView = kind === 'board';
  const waterIds = useMemo(() => new Set(ids.filter((id) => id !== heading)), [ids, heading]);
  const current = view.members.filter((m) => !m.former);
  const laneNames = view.lanes.map((l) => ({ id: l.id, name: l.name, icon: l.icon }));
  const pinnedStrip = (slot: 'phone' | 'wide') => (
    <PinnedCards
      slot={slot}
      cards={pinned.value}
      categories={laneNames}
      initials=""
      onPick={bringForward}
    />
  );

  return (
    <div data-pool-ground={poolId} className="water-ground flex min-h-0 flex-1 flex-col">
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
          <header data-pool-header className="flex shrink-0 items-center gap-2 px-4 pt-4">
            {/* The pool's photo or monogram, then its name (0024); going to
                another pool is the strip's (review). */}
            <Monogram name={view.pool.name} size="row" photo={view.pool.photo ?? null} />
            <h1
              data-pool-title
              className="min-w-0 flex-1 truncate text-3xl/tight font-semibold text-white"
            >
              {view.pool.name}
            </h1>
            <span className="flex shrink-0 items-center">
              {/* The members' faces are the way to the member list (review). */}
              <button
                type="button"
                aria-label="Members"
                data-pool-members
                onClick={() => setSheet('members')}
                className="flex items-center"
              >
                {current.slice(0, HEADER_AVATARS).map((member, at) => (
                  <Avatar
                    key={member.userId}
                    id={member.userId}
                    initials={member.initials}
                    // Solid, so an avatar never shows the one beneath it (review).
                    className={`text-main-900/60 ring-main-900 flex h-8 w-8 items-center justify-center rounded-full bg-[#8283EE] text-[10px] font-medium ring-2 ${
                      at > 0 ? '-ml-2' : ''
                    }`}
                  />
                ))}
              </button>
              <button
                type="button"
                aria-label="Invite"
                data-pool-invite
                onClick={() => setSheet('invite')}
                className="ml-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white"
              >
                <Plus aria-hidden size={16} />
              </button>
            </span>
          </header>

          <div className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-6">
            <button
              type="button"
              aria-label="Pool lanes"
              data-manage-pool-lanes
              onClick={() => setSheet('lanes')}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
            >
              <LaneIcon size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <SegmentedToggle view={kind} onChange={setKind} options={VIEWS} />
            </div>
            <Link
              href={`/pool/${poolId}/settings`}
              aria-label="Pool settings"
              data-pool-settings
              className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
            >
              <Settings aria-hidden size={20} />
            </Link>
          </div>

          {dropMessage || pinned.message ? (
            <p role="alert" className="shrink-0 px-6 pb-2 text-sm text-white/80">
              {dropMessage ?? pinned.message}
            </p>
          ) : null}

          {/* On a phone the Board takes the pinned strip's height (review). */}
          {boardView ? null : pinnedStrip('phone')}

          {shown.length === 0 && !boardView ? (
            <p data-pool-empty className="px-6 pt-6 text-sm/relaxed text-white/80">
              Nothing in this Pool yet. Splashes in your connected lanes land here, and so do joint
              splashes anyone opens.
            </p>
          ) : null}

          {boardView ? (
            <BoardFrame>
              <MonthBoard
                cards={shown}
                month={boardMonth}
                onMonth={setBoardMonth}
                today={today}
                ring={ring}
                dropped={dropHere?.splash.id ?? null}
                onPick={bringForward}
                lanes={laneNames}
              />
            </BoardFrame>
          ) : (
            <LaneGrid
              view={kind === 'date' ? 'date' : 'lane'}
              cards={shown}
              categories={columns}
              today={today}
              ring={ring}
              waterIds={waterIds}
              initials={null}
              scrollToMonth={null}
              onPick={bringForward}
              // A joint splash spans every column only where columns are people.
              bands={kind === 'swimmers'}
            />
          )}
        </div>

        <div
          data-board-column
          className="flex shrink-0 flex-col lg:min-h-0 lg:min-w-0 lg:flex-1 lg:py-10"
        >
          {pinnedStrip('wide')}
          <StairBoard
            cards={shown}
            flip={flip}
            categories={laneNames}
            initials=""
            pinnedIds={pinnedIds}
            onPin={pin}
            onDelete={remove}
            low={boardView}
            hrefFor={(id) => shown.find((c) => c.splash.id === id)?.href ?? `/pool/${poolId}`}
          />
          <GroundFoot
            here="pool"
            poolId={poolId}
            onPool={cycleView}
            poolLabel={`Pool, showing ${viewName(kind)}; tap for ${viewName(nextView(kind))}`}
            onCompose={composeHere}
          />
        </div>

        {/* Wide: Home, Pool and compose stacked at the right edge. */}
        <GroundFoot
          slot="wide"
          here="pool"
          poolId={poolId}
          onPool={cycleView}
          poolLabel={`Pool, showing ${viewName(kind)}; tap for ${viewName(nextView(kind))}`}
          onCompose={composeHere}
        />
      </div>

      {sheet === 'members' ? (
        <MembersSheet
          poolId={poolId}
          members={view.members}
          me={me}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'lanes' ? (
        <PoolLanesSheet poolId={poolId} lanes={view.lanes} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'invite' ? (
        <PoolSheet label="Invite" onClose={() => setSheet(null)}>
          <SheetTitle>Invite to {view.pool.name}</SheetTitle>
          <InvitePanel poolId={poolId} invites={view.invites} />
        </PoolSheet>
      ) : null}
    </div>
  );
}
