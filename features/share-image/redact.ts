import type { Card, CardRipple } from '@/features/home/grid';
import type { BoardLayoutJson } from '@/features/month-board/board-layout';
import type { SplashSummary } from '@/features/splash/summary';

/**
 * What a shared image may say (H63). My own records are drawn as they are;
 * anyone else's is a shape in its label's colour, with no words, photos,
 * faces or names. The rule for a record with others on it: the title follows
 * who made the record, each photo who posted it. The pool's name and its
 * members' faces show only with the switch on.
 */
export type ExportOptions = {
  /** "Show pool name and faces": off by default. */
  faces: boolean;
};

export type Redacted = {
  cards: Card[];
  /** The records drawn as shapes, by splash id. */
  shapes: ReadonlySet<string>;
};

/**
 * Sizes a shape's label as one short line. Never drawn: a shape renders its
 * box alone, so nothing of the record's own length or words is in it.
 */
export const SHAPE_WORDS = 'xxxxxxxx';

/**
 * The cards a shared image is drawn from. Built field by field rather than
 * by removing fields, so a field added to Card later stays out of the image
 * until it is let in here.
 */
export function redactForExport(cards: Card[], { faces }: ExportOptions): Redacted {
  const shapes = new Set<string>();
  const out = cards.map((card) => {
    if (card.madeByMe === true) return mineCard(card, faces);
    shapes.add(card.splash.id);
    return shapeCard(card);
  });
  return { cards: out, shapes };
}

/** Where a card sits and how its label is filled, around the splash given: nothing it says. */
function placement(card: Card, splash: SplashSummary): Card {
  return {
    splash,
    day: card.day,
    instant: card.instant,
    body: '',
    ripples: [],
    ...(card.column !== undefined ? { column: card.column } : {}),
    ...(card.joint ? { joint: true } : {}),
    ...(card.together ? { together: true } : {}),
    ...(card.everyone ? { everyone: true } : {}),
    ...(card.side ? { side: true } : {}),
    ...(card.layout ? { layout: card.layout } : {}),
    ...(card.layoutSource ? { layoutSource: card.layoutSource } : {}),
  };
}

function mineCard(card: Card, faces: boolean): Card {
  const ripples: CardRipple[] = card.ripples
    .filter((r) => r.byMe === true)
    .map((r) => ({ id: r.id, note: r.note, createdAt: r.createdAt, byMe: true }));
  const own = new Set(ripples.map((r) => r.id));
  // My photos and videos only: the server checks again, and fetches a video's thumbnail itself.
  const photos = (card.photos ?? []).filter((p) => own.has(p.rippleId));
  // An untitled record reads its first words: mine only when the first words are.
  const firstWords = card.ripples.find((r) => r.note.trim() !== '');
  const splash: SplashSummary = {
    ...card.splash,
    ghostTitle: firstWords?.byMe === true ? card.splash.ghostTitle : null,
    description: null,
  };
  return {
    ...placement(card, splash),
    body: ripples.flatMap((r) => (r.note ? [r.note] : [])).join('\n\n'),
    ripples,
    madeByMe: true,
    ...(card.lane !== undefined ? { lane: card.lane } : {}),
    ...(photos.length > 0 ? { photos } : {}),
    // My own face after my title in a pool: mine to show.
    ...(card.authorFace && card.authorId ? { authorFace: true, authorId: card.authorId } : {}),
    ...(faces
      ? {
          ...(card.writers ? { writers: card.writers } : {}),
          ...(card.branches ? { branches: card.branches } : {}),
          ...(card.pools ? { pools: card.pools } : {}),
          ...(card.poolPhoto !== undefined ? { poolPhoto: card.poolPhoto } : {}),
          ...(card.sharedPools ? { sharedPools: card.sharedPools } : {}),
        }
      : {}),
  };
}

function shapeCard(card: Card): Card {
  const s = card.splash;
  // Only what places it: its days and when it was made. No title, icon or lane.
  const splash: SplashSummary = {
    id: s.id,
    title: SHAPE_WORDS,
    ghostTitle: null,
    description: null,
    declaredLaneId: null,
    icon: null,
    laneIds: [],
    declaredRange: s.declaredRange,
    range: s.range,
    count: 0,
    blocks: s.blocks,
    latestCreatedAt: s.latestCreatedAt,
    writtenOn: s.writtenOn,
    ownPoolId: null,
    open: false,
    createdAt: s.createdAt,
    pinnedAt: null,
    sessionId: null,
    orphan: false,
  };
  // Its hand-set place and fill, but not its photos' settings, keyed by their paths.
  const layout = card.layout
    ? (Object.fromEntries(
        Object.entries(card.layout).filter(([key]) => key !== 'photos' && key !== 'videos'),
      ) as BoardLayoutJson)
    : undefined;
  return {
    ...placement(card, splash),
    lane: null,
    ...(layout ? { layout } : {}),
  };
}
