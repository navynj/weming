'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronRight, Settings } from 'lucide-react';

import { withEdits, type Card } from '@/features/home/grid';
import { DAY_LIST_TEMPLATE, DateDay } from '@/features/home/date-day';
import { GroundFoot } from '@/features/home/ground-foot';
import { LaneIcon } from '@/features/home/lane-icon';
import { HOME_VIEWS, SegmentedToggle } from '@/features/home/view-toggle';
import { POOL_VIEWS } from '@/features/pool/pool-views';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { PostRow } from '@/features/home/post-row';
import { StairBoard } from '@/features/home/stair-board';
import { useFlip } from '@/features/home/use-flip';
import type { PoolScope } from '@/features/pool/compose-scope';
import { deleteJointSplash, savePoolLane } from '@/features/pool/actions';
import { deleteRipple } from '@/features/ripple-sheet/actions';
import { deleteSplash, setSplashPinned } from '@/features/splash/actions';
import { monthKey } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { saveLane } from './actions';
import { EmojiInput } from './emoji-input';
import { lanePath, poolLanePath, poolPath, splashPath } from '@/lib/routes';

/**
 * A lane's page (round 3, review): a breadcrumb, Home / the lane; the lane's
 * emoji large with its name under it; then every post on the lane as a row
 * in the Date view's own day list — the day over its weekday on the rail,
 * the icon and the title, the month on a line of its own — newest first,
 * separated only by faint white lines. Beneath, Home's card
 * stack over this lane's posts: the row of the card on top is the one at
 * full white, a row brings its post to the top, and the top card opens the
 * post's page, which comes back here with the same card on top.
 *
 * Tapping the emoji or the name edits them in place — the emoji as the
 * one-grapheme field, the name as text — with Save and Cancel, shown at
 * once (CLAUDE.md, the principle). Deleting and reordering lanes stay in
 * lane management, linked at the foot of the list.
 *
 * A pool's lane opens the same page from its header in the pool (review):
 * the breadcrumb starts at the pool, the posts are the pool's on that lane
 * with their authors, the rename is the pool lane's (any member's), and the
 * foot is the pool's.
 */
export function LanePage({
  lane,
  cards,
  categories = [lane],
  initials = '',
  topParam = null,
  pool,
}: {
  lane: Pick<MyCategory, 'id' | 'name' | 'icon'> & { description?: string | null };
  /** This lane's posts, newest first. */
  cards: Card[];
  categories?: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
  /** A pool's lane: the pool it is in, as the composer takes it. */
  pool?: PoolScope;
  initials?: string;
  /** `?top=`: the post to open with on top, where a post's page sends this page back to. */
  topParam?: string | null;
}) {
  const router = useRouter();
  const { openSheet, pendingEdits, dropMessage } = useInputSheet();
  const saved = useOptimisticAction({ name: lane.name, icon: lane.icon ?? '' });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(lane.name);
  const [icon, setIcon] = useState(lane.icon ?? '');

  // The stack, over this lane's posts; deletes and pins show at once.
  const removed = useOptimisticAction<string[]>([]);
  const pins = useOptimisticAction<string[]>(
    cards.filter((card) => card.splash.pinnedAt).map((card) => card.splash.id),
  );
  const shown = useMemo(
    () =>
      withEdits(cards, pendingEdits).filter(
        (card) =>
          !removed.value.includes(card.splash.id) &&
          // Moved to another of the pool's lanes a moment ago (0020): gone from here at once.
          !(
            pool &&
            pendingEdits[card.splash.id]?.poolLane?.id !== undefined &&
            pendingEdits[card.splash.id]?.poolLane?.id !== lane.id
          ),
      ),
    [cards, pendingEdits, removed.value, pool, lane.id],
  );
  const ids = useMemo(() => shown.map((card) => card.splash.id), [shown]);
  const [initialTop] = useState(() =>
    topParam && ids.includes(topParam) ? topParam : (ids[0] ?? null),
  );
  const flip = useFlip(ids, initialTop, -1);
  const here = pool ? poolLanePath(pool.poolId, lane.id) : lanePath(lane.id);

  function start(): void {
    setName(saved.value.name);
    setIcon(saved.value.icon);
    setEditing(true);
  }
  function save(): void {
    const next = { name: name.trim(), icon: icon.trim() };
    if (!next.name || !next.icon) return;
    setEditing(false);
    saved.run(
      () => next,
      () =>
        pool
          ? savePoolLane({
              id: lane.id,
              poolId: pool.poolId,
              name: next.name,
              icon: next.icon,
              description: lane.description ?? null,
            })
          : saveLane({ id: lane.id, name: next.name, icon: next.icon }),
    );
  }

  // Newest day first, each day's posts newest first.
  const days: { day: string; cards: Card[] }[] = [];
  for (const card of shown) {
    const last = days[days.length - 1];
    if (last && last.day === card.day) last.cards.push(card);
    else days.push({ day: card.day, cards: [card] });
  }
  const shownLane = { ...lane, name: saved.value.name, icon: saved.value.icon };

  return (
    // As Home on a wide screen (review): the list left, the stack right, the
    // nav as a vertical rail at the far right edge; a phone keeps one column.
    <div
      data-lane-page={lane.id}
      data-ground-row
      className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col lg:max-w-7xl lg:flex-row lg:gap-8"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        data-grid-column
        // Two thirds, as every view on the left (review); the stack one third.
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-6 lg:min-w-0 lg:flex-[2]"
      >
        {/* The views' tabs stay as they were (review), Lane chosen — this is
            a lane — each tab back to the ground on that view. Placed as on
            the ground's header, so they do not move between the two. */}
        <header data-lane-tabs className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-6">
          <Link
            href={pool ? poolPath(pool.poolId) : '/?settings=home'}
            aria-label={pool ? 'Pool lanes' : 'Lanes'}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
          >
            <LaneIcon size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <SegmentedToggle
              view="lane"
              options={pool ? POOL_VIEWS : HOME_VIEWS}
              onChange={(view) =>
                router.push(pool ? `${poolPath(pool.poolId)}?view=${view}` : `/?view=${view}`)
              }
            />
          </div>
          {pool ? (
            <Link
              href={`${poolPath(pool.poolId)}?settings=pool`}
              aria-label="Pool settings"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
            >
              <Settings aria-hidden size={20} />
            </Link>
          ) : null}
        </header>
        {/* No side padding on the scroller itself: the day list's rail is
            sticky to its left edge, and padding there pushed it over the
            rows (review). The parts above and below carry their own. */}
        <nav
          aria-label="Breadcrumb"
          data-breadcrumb
          className="flex items-center gap-1 px-6 text-sm"
        >
          <Link href={pool ? poolPath(pool.poolId) : '/'} className="font-medium text-white">
            {pool ? pool.poolName : 'Home'}
          </Link>
          <ChevronRight aria-hidden size={14} className="text-white/50" />
          <span className="text-white/70">{saved.value.name}</span>
        </nav>

        <header className="flex flex-col items-center gap-2 px-6 pt-6 pb-8">
          {editing ? (
            <div data-lane-edit className="flex w-full flex-col items-center gap-3">
              <EmojiInput value={icon} onChange={setIcon} label="Lane icon" />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Lane name"
                maxLength={pool ? 40 : 24}
                className="surface text-ink w-full max-w-60 rounded-full bg-white px-4 py-2 text-center text-base outline-none"
              />
              <span className="flex gap-4 text-sm">
                <button
                  type="button"
                  onClick={save}
                  disabled={!name.trim() || !icon.trim()}
                  className="text-main-900 rounded-full bg-white px-4 py-1.5 font-semibold disabled:opacity-50"
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className="text-white/70">
                  Cancel
                </button>
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-label="Edit the lane icon"
                data-lane-emoji
                onClick={start}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-5xl/none"
              >
                {saved.value.icon}
              </button>
              <button
                type="button"
                aria-label="Edit the lane name"
                data-lane-name
                onClick={start}
                className="text-xl font-semibold text-white"
              >
                {saved.value.name}
              </button>
            </>
          )}
          {saved.message || dropMessage ? (
            <p role="alert" className="text-sm text-white/80">
              {saved.message ?? dropMessage}
            </p>
          ) : null}
        </header>

        {days.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-white/60">Nothing on this lane yet.</p>
        ) : (
          // The Date view's own day list: the rail, the rows, the month on
          // a line of its own (review).
          <div data-lane-posts className="grid" style={{ gridTemplateColumns: DAY_LIST_TEMPLATE }}>
            {days.map(({ day, cards: onDay }, index) => (
              <DateDay
                key={day}
                day={day}
                monthChanges={index === 0 || monthKey(days[index - 1].day) !== monthKey(day)}
              >
                {onDay.map((card) => (
                  <div key={card.splash.id} data-lane-post={card.splash.id}>
                    <PostRow
                      card={card}
                      lane={shownLane}
                      current={card.splash.id === flip.heading}
                      ring={null}
                      showLane={false}
                      onPick={flip.bringForward}
                    />
                  </div>
                ))}
              </DateDay>
            ))}
          </div>
        )}

        {pool ? null : (
          <Link
            href="/?settings=home"
            data-manage-lanes-link
            className="mt-10 block text-center text-sm text-white/70 underline-offset-4 hover:underline"
          >
            Manage lanes
          </Link>
        )}
      </div>

      {/* Home's stack over this lane's posts, at the foot of the page. */}
      <div
        data-lane-stack
        data-board-column
        className="shrink-0 pt-2 lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-col lg:py-10"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <StairBoard
          cards={shown}
          flip={flip}
          categories={categories}
          initials={initials}
          pinnedIds={new Set(pins.value)}
          onPin={(card, on) =>
            pins.run(
              (current) =>
                on ? [...current, card.splash.id] : current.filter((id) => id !== card.splash.id),
              () => setSplashPinned(card.splash.id, on),
            )
          }
          onDelete={(card) =>
            removed.run(
              (current) => [...current, card.splash.id],
              async () => {
                const result =
                  pool && card.branches
                    ? await deleteJointSplash(pool.poolId, card.splash.id)
                    : card.splash.orphan
                      ? await deleteRipple(card.splash.id)
                      : await deleteSplash(card.splash.id);
                return result.ok
                  ? { ok: true }
                  : { ok: false, message: 'That could not be deleted.' };
              },
            )
          }
          hrefFor={(id) =>
            pool ? (shown.find((card) => card.splash.id === id)?.href ?? here) : splashPath(id)
          }
        />
      </div>

      {/* Wide: Home, Pool and compose, the vertical rail at the far right. */}
      <GroundFoot
        slot="wide"
        here={pool ? 'pool' : 'home'}
        poolId={pool?.poolId ?? null}
        homeLabel="Home"
        onHome={() => router.push('/')}
        onPool={pool ? () => router.push(poolPath(pool.poolId)) : undefined}
        onCompose={() => openSheet(pool ?? null)}
      />
    </div>
  );
}
