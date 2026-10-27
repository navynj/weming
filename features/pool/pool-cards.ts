import { byNewest, placeCard, type Card, type GridColumn } from '@/features/home/grid';
import { summarizeSplash, type SplashSummary } from '@/features/splash/summary';
import type { PoolRipple, PoolView } from '@/lib/queries/pools';

import { originTag } from './origin-tag';

/** A pool's views (H23). Lane, Date and Board as on Home; Swimmers by member. */
export type PoolViewKind = 'lane' | 'date' | 'swimmers' | 'board';

/** Where a post of a pool opens: its page in the pool, coming back to this pool. */
export function poolSplashHref(poolId: string, splashId: string): string {
  return `/pool/${poolId}/splash/${splashId}`;
}

/**
 * The grid's columns (H23): the pool's lanes in the Lane view; in Swimmers
 * the current members, me first then join order (D7) — never a former
 * member, whose kept records sit in the unlabelled column.
 */
export function poolColumns(view: PoolView, kind: PoolViewKind): GridColumn[] {
  if (kind === 'swimmers') {
    return view.members
      .filter((m) => !m.former)
      .map((m) => ({ id: m.userId, name: m.name, icon: null, avatar: m.initials, href: null }));
  }
  // A pool lane's header opens its page, as a lane's does on Home (review).
  return view.lanes.map((lane) => ({
    id: lane.id,
    name: lane.name,
    icon: lane.icon,
    href: `/pool/${view.pool.id}/lane/${lane.id}`,
  }));
}

/**
 * Every placed post and joint splash as a card, newest first, with its
 * column for the view: a placed post sits in the pool lane it was placed in,
 * or in its author's column; a joint splash is a band, each ripple a branch
 * in the band's lane (Lane) or in its author's column (Swimmers). Days are
 * read in my zone: the pool is read from where I am.
 */
export function poolCards(
  view: PoolView,
  kind: PoolViewKind,
  me: string,
  timeZone: string,
  now: Date = new Date(),
): Card[] {
  const initialsOf = new Map(view.members.map((m) => [m.userId, m.initials]));
  const nameOf = new Map(view.members.map((m) => [m.userId, m.name]));
  // Each post is read in its author's zone (0013): its day is stored, and a
  // span's end day and a timed block's place are the author's too. `timeZone`
  // (mine) only stands in for an author whose profile is unreadable.
  const zoneOf = new Map(view.members.map((m) => [m.userId, m.timeZone]));
  const laneOf = new Map(view.lanes.map((lane) => [lane.id, lane]));
  const byPost = new Map<string, PoolRipple[]>();
  for (const r of view.ripples) {
    if (!r.splash_id) continue;
    const list = byPost.get(r.splash_id);
    if (list) list.push(r);
    else byPost.set(r.splash_id, [r]);
  }
  const placementOf = new Map(view.placements.map((p) => [p.splashId, p]));

  const cards: Card[] = [];
  for (const splash of view.splashes) {
    // On someone's record: the owner's ripples and this pool's members' sides
    // only — another pool's are not this pool's to see (0035).
    const blocks = (byPost.get(splash.id) ?? [])
      .filter((r) => !r.thread_pool_id || r.thread_pool_id === view.pool.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const writer = splash.owner_id ?? splash.created_by;
    const summary: SplashSummary = summarizeSplash(
      splash,
      blocks,
      (writer && zoneOf.get(writer)) || timeZone,
      now,
    );
    // Its blocks with words or photos: the top card shows each one's photos under its words.
    const thread = blocks
      .filter((r) => r.note || r.media.length > 0)
      .map((r) => ({
        id: r.id,
        note: r.note ?? '',
        createdAt: r.created_at,
        initials: initialsOf.get(r.author_id) ?? '',
        authorId: r.author_id,
        authorName: nameOf.get(r.author_id),
      }));
    const href = poolSplashHref(view.pool.id, splash.id);
    // Its photos, for the Board view: every image across its ripples, oldest first.
    const pictured = blocks.flatMap((r) => r.media.map((path) => ({ rippleId: r.id, path })));
    const photo = pictured.length > 0 ? { photos: pictured } : {};
    if (splash.owner_id === null) {
      // A joint splash: the pool's, so its pin is shared (any member) and it
      // is deleted only while every ripple on it is mine.
      const lane = splash.pool_lane_id ? laneOf.get(splash.pool_lane_id) : undefined;
      const card = placeCard(summary, bodyOf(thread), timeZone, thread);
      const wrote = [...new Set(blocks.map((r) => r.author_id))];
      cards.push({
        ...card,
        ...photo,
        // Filled with Everyone on, or once anyone besides its maker is picked (0033).
        together:
          splash.joint_invite_all ||
          (view.together?.[splash.id] ?? []).some((id) => id !== splash.created_by),
        writers: wrote.map((id) => ({ authorId: id, initials: initialsOf.get(id) ?? '' })),
        // Together's open slots (0033): who it is with, less those who wrote.
        awaiting: view.members
          .filter(
            (m) =>
              !m.former &&
              !wrote.includes(m.userId) &&
              (view.together?.[splash.id] ?? []).includes(m.userId),
          )
          .map((m) => ({ authorId: m.userId, initials: m.initials })),
        column: splash.pool_lane_id ?? undefined,
        lane: lane ? { icon: lane.icon, name: lane.name } : null,
        origins: lane ? [originTag(view.pool.name, lane.icon, lane.name)] : undefined,
        branches: blocks.map((r) => ({
          id: r.id,
          column: kind === 'swimmers' ? r.author_id : (splash.pool_lane_id ?? ''),
          initials: initialsOf.get(r.author_id) ?? '',
          authorId: r.author_id,
        })),
        href,
        menu: { pin: true, delete: blocks.every((r) => r.author_id === me) },
        editable: true,
        joint: true,
      });
      continue;
    }
    const placement = placementOf.get(splash.id);
    const lane = placement ? laneOf.get(placement.poolLaneId) : undefined;
    // The tag reads live here: I am in this pool (0015).
    const origins = lane ? [originTag(view.pool.name, lane.icon, lane.name)] : undefined;
    const author = initialsOf.get(splash.owner_id) ?? '';
    const card = placeCard(summary, bodyOf(thread), timeZone, thread);
    const mine = splash.owner_id === me;
    // With, in this pool (0035): filled once Everyone or anyone is picked;
    // the slot waits for the invited who have not written here.
    const withHere = view.placementTogether?.[splash.id] ?? [];
    const sides = [...new Set(blocks.map((r) => r.author_id))];
    const together = Boolean(placement?.inviteAll) || withHere.length > 0;
    cards.push({
      ...card,
      ...photo,
      ...(together
        ? {
            together: true,
            writers: sides.map((id) => ({ authorId: id, initials: initialsOf.get(id) ?? '' })),
            awaiting: view.members
              .filter((m) => !m.former && withHere.includes(m.userId) && !sides.includes(m.userId))
              .map((m) => ({ authorId: m.userId, initials: m.initials })),
          }
        : {}),
      column: kind === 'swimmers' ? splash.owner_id : placement?.poolLaneId,
      lane: lane ? { icon: lane.icon, name: lane.name } : null,
      author,
      authorId: splash.owner_id,
      authorName: nameOf.get(splash.owner_id),
      href,
      origins,
      // My own post: my pin and my delete, as on Home. Someone else's: neither.
      menu: { pin: mine, delete: mine },
      editable: mine,
    });
  }
  // The calendar's layouts its members set (0025): the pool's, for every splash in it.
  const layouts = view.layouts ?? {};
  return (
    cards
      .map((card) => {
        const layout = layouts[card.splash.id];
        return layout ? { ...card, layout, layoutSource: 'pool' as const } : card;
      })
      // What readers left, for the top card and the unseen dots (H25): every
      // member reads a pool's post, so each takes reactions and replies.
      .map((card) => {
        const ids = new Set(card.ripples.map((r) => r.id));
        return {
          ...card,
          responded: view.responded
            ? {
                value: {
                  reactions: view.responded.reactions.filter((r) => ids.has(r.ripple_id)),
                  replies: view.responded.replies.filter((r) => ids.has(r.ripple_id)),
                },
                locked: view.lockedIds ?? [],
              }
            : undefined,
          respondedAt: view.respondedAt?.[card.splash.id],
        };
      })
      .sort(byNewest)
  );
}

/**
 * Pinned in a pool (H23): my own pinned posts that are placed here, and
 * joint splashes pinned by anyone — a joint splash's pin is the pool's.
 */
export function poolPinned(cards: Card[], me: string, view: PoolView): Card[] {
  const owner = new Map(view.splashes.map((s) => [s.id, s.owner_id]));
  return cards
    .filter((card) => {
      if (!card.splash.pinnedAt) return false;
      const by = owner.get(card.splash.id);
      return by === null || by === me;
    })
    .sort((a, b) => b.splash.pinnedAt!.localeCompare(a.splash.pinnedAt!));
}

/**
 * A pool's own splash moved to another lane a moment ago (0020, review): it
 * shows there at once — its column in the Lane view, its lane chip and its
 * origin tag everywhere — until the re-read lands; a refusal clears the edit
 * and it goes back. Swimmers keeps its author's column.
 */
export function withPoolMoves(
  cards: Card[],
  edits: Record<
    string,
    {
      poolLane?: { id: string; icon: string | null; name: string };
      kind?: 'mine' | 'own' | 'joint';
    }
  >,
  kind: PoolViewKind,
  poolName: string,
  me: { id: string; initials: string },
): Card[] {
  return cards.map((card) => {
    const edit = edits[card.splash.id];
    const to = edit?.poolLane;
    if (!edit || (!to && !edit.kind)) return card;
    const column = to ? (kind === 'swimmers' ? card.column : to.id) : card.column;
    const moved: Card = {
      ...card,
      ...(to
        ? {
            lane: { icon: to.icon, name: to.name },
            origins: [originTag(poolName, to.icon, to.name)],
            column,
            branches: card.branches?.map((branch) => ({
              ...branch,
              column: kind === 'swimmers' ? branch.column : to.id,
            })),
          }
        : {}),
    };
    // Converted (0022): the pool's own — a band, its pin anyone's — or mine
    // again — a mark under my name.
    if (edit.kind === 'joint' && !card.branches) {
      return {
        ...moved,
        author: undefined,
        authorId: undefined,
        joint: true,
        branches: [
          {
            id: `${card.splash.id}-mine`,
            column: kind === 'swimmers' ? me.id : (column ?? ''),
            initials: me.initials,
            authorId: me.id,
          },
        ],
        menu: { pin: true, delete: true },
      };
    }
    if ((edit.kind === 'mine' || edit.kind === 'own') && card.branches) {
      return {
        ...moved,
        branches: undefined,
        joint: false,
        author: me.initials,
        authorId: me.id,
        column: kind === 'swimmers' ? me.id : column,
        menu: { pin: true, delete: true },
      };
    }
    return moved;
  });
}

/** A card's words: its blocks' notes, those that have any. */
function bodyOf(thread: { note: string }[]): string {
  return thread.flatMap((r) => (r.note ? [r.note] : [])).join('\n\n');
}
