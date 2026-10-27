import type { Database } from '@/lib/database.types';
import { dayOf, flowInstant, restingInstant, type FlowKeyed } from '@/lib/flow-key';
import { todayIn, type IsoDate } from '@/lib/time';

export type Splash = Database['public']['Tables']['splashes']['Row'];

/**
 * How long after its last block a post stays open (H20e). Tunable. Since
 * H21g this decides the `+Drop` affordance on an entry and nothing else.
 */
export const OPEN_WINDOW_HOURS = 48;

/** How many words of a first block stand in for a missing title. */
const GHOST_TITLE_WORDS = 6;

/** What a block contributes to its post: its key, its lane, its words. */
export type SplashBlock = FlowKeyed & {
  id: string;
  /** Null only on a "Just mine" splash (0014): a block with no lane of mine. */
  category_id: string | null;
  note: string | null;
  /** A span's end, when the block has one: its last day counts for the range. */
  ended_at?: string | null;
};

export type DateRange = { start: IsoDate; end: IsoDate };

/**
 * A post as the surfaces read it (H21a, H24): its lane and its range are its
 * own, and every block inherits them. A block's own lane and date are frozen
 * metadata (0028, 0029): read back on the block, never used to place it.
 */
export type SplashSummary = {
  id: string;
  title: string;
  /** For an untitled post: the first block's first words, else null. */
  ghostTitle: string | null;
  /** Its description (0037), under the title, apart from its ripples; null when none. */
  description: string | null;
  /** Its lane (H24); none for joint and Just mine, whose lane is their pool lane. */
  declaredLaneId: string | null;
  /** The post's own icon (0008), or none: its lane's emoji stands in. */
  icon: string | null;
  /** Its lane, alone (H24): blocks take no lane of their own to add a tag. */
  laneIds: string[];
  declaredRange: DateRange | null;
  /** Where it is placed (H24): its own range, else the day it was made. */
  range: DateRange | null;
  count: number;
  /** Each block on the post's last day, ordered by when it was written, oldest first. */
  blocks: { day: IsoDate; endDay: IsoDate; instant: number }[];
  /** When the post last received something, for recency and the open rule. */
  latestCreatedAt: string;
  /** The author's local date when the post was made (0013): its row with no range. */
  writtenOn: IsoDate;
  /** A "Just mine" splash (0014): the pool it lives in, with no lane of mine. */
  ownPoolId: string | null;
  open: boolean;
  createdAt: string;
  pinnedAt: string | null;
  sessionId: string | null;
  /** True for a splashless block standing in as a post of one (H21a). */
  orphan: boolean;
};

/** A block within the window, or nothing written yet (H20e). */
export function isSplashOpen(count: number, latestCreatedAt: string | null, now: Date): boolean {
  if (count === 0 || latestCreatedAt === null) return true;
  return now.getTime() - Date.parse(latestCreatedAt) < OPEN_WINDOW_HOURS * 60 * 60 * 1000;
}

/** The first few words of a note, for a post with no title. */
export function ghostTitle(note: string | null): string | null {
  const words = (note ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const head = words.slice(0, GHOST_TITLE_WORDS).join(' ');
  return words.length > GHOST_TITLE_WORDS ? `${head}…` : head;
}

/**
 * The last day a block covers: its span's end in the author's zone, else the
 * day it rests on. A span by dates alone ends at the close of its end day, so
 * that day is the one read back.
 */
function spanEndDay(block: SplashBlock, day: IsoDate, timeZone: string): IsoDate {
  if (!block.ended_at || !block.occurred_on) return day;
  const end = todayIn(timeZone, new Date(block.ended_at));
  return end > day ? end : day;
}

export function summarizeSplash(
  splash: Splash,
  blocks: SplashBlock[],
  timeZone: string,
  now: Date,
): SplashSummary {
  // H24: the post is placed by its own range; with none (a row from before
  // 0028 that the backfill has not reached), by the day it was made.
  const writtenOn = splash.written_on ?? todayIn(timeZone, new Date(splash.created_at));
  const declaredRange = splash.declared_start
    ? { start: splash.declared_start, end: splash.declared_end ?? splash.declared_start }
    : null;
  const range = declaredRange ?? { start: writtenOn, end: writtenOn };
  // Blocks order by when they were written; their own dates place nothing.
  const written = [...blocks].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );

  const latestCreatedAt = blocks.reduce<string | null>(
    (latest, b) => (latest === null || b.created_at > latest ? b.created_at : latest),
    null,
  );

  return {
    id: splash.id,
    title: splash.title,
    ghostTitle: splash.title.trim() ? null : ghostTitle(written[0]?.note ?? null),
    description: splash.description ?? null,
    declaredLaneId: splash.declared_lane_id,
    icon: splash.icon ?? null,
    laneIds: splash.declared_lane_id ? [splash.declared_lane_id] : [],
    declaredRange,
    range,
    count: blocks.length,
    blocks: written.map((b) => ({
      day: range.end,
      endDay: range.end,
      instant: Date.parse(b.created_at),
    })),
    latestCreatedAt: latestCreatedAt ?? splash.created_at,
    writtenOn,
    ownPoolId: splash.own_pool_id ?? null,
    open: isSplashOpen(blocks.length, latestCreatedAt, now),
    createdAt: splash.created_at,
    pinnedAt: splash.pinned_at,
    sessionId: splash.session_id,
    orphan: false,
  };
}

/**
 * A block whose post I cannot read — on a joint splash of a pool I left
 * (H23) — renders as an untitled post of one, so nothing I wrote vanishes
 * from my own surfaces. Every block has a post since 0028 (H24); this is the
 * one way one still reads alone. Its id is the block's.
 */
export function summarizeOrphan(block: SplashBlock, timeZone: string, now: Date): SplashSummary {
  const day = dayOf(block, timeZone);
  return {
    id: block.id,
    title: '',
    ghostTitle: ghostTitle(block.note),
    description: null,
    declaredLaneId: null,
    icon: null,
    laneIds: block.category_id ? [block.category_id] : [],
    declaredRange: null,
    range: { start: day, end: day },
    count: 1,
    blocks: [
      { day, endDay: spanEndDay(block, day, timeZone), instant: flowInstant(block, timeZone) },
    ],
    latestCreatedAt: block.created_at,
    writtenOn: day,
    ownPoolId: null,
    open: isSplashOpen(1, block.created_at, now),
    createdAt: block.created_at,
    pinnedAt: null,
    sessionId: null,
    orphan: true,
  };
}

/**
 * Every post summarised against the blocks it holds, plus every splashless
 * block as a post of one, recent first. A block whose post is not among
 * `splashes` — a joint splash of a pool I have left, say (H23) — is never
 * dropped: it reads as a post of one, so nothing I wrote vanishes from my
 * own surfaces.
 */
export function summarizeAll(
  splashes: Splash[],
  blocks: (SplashBlock & { splash_id: string | null })[],
  timeZone: string,
  now: Date,
): SplashSummary[] {
  const byPost = new Map<string, SplashBlock[]>();
  const orphans: SplashBlock[] = [];
  const known = new Set(splashes.map((splash) => splash.id));
  for (const block of blocks) {
    if (block.splash_id === null || !known.has(block.splash_id)) {
      orphans.push(block);
      continue;
    }
    const list = byPost.get(block.splash_id);
    if (list) list.push(block);
    else byPost.set(block.splash_id, [block]);
  }
  return [
    ...splashes.map((splash) =>
      summarizeSplash(splash, byPost.get(splash.id) ?? [], timeZone, now),
    ),
    ...orphans.map((block) => summarizeOrphan(block, timeZone, now)),
  ].sort(byRecency);
}

/** Recent first: the post something was just written on is the likely target. */
export function byRecency(a: SplashSummary, b: SplashSummary): number {
  return Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt);
}

/** The lane that stands for the post (H24): its own; a lone block's, read alone. */
export function representativeLane(summary: Pick<SplashSummary, 'laneIds'>): string | null {
  return summary.laneIds[0] ?? null;
}

/** `2026-08`, the month a date falls in. */
export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

/** The last day of `2026-08`, as a date. */
export function lastDayOf(month: string): IsoDate {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0));
  return last.toISOString().slice(0, 10);
}

/** Every month from `a` to `b` inclusive, ascending. */
export function monthsBetween(a: string, b: string): string[] {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  const months: string[] = [];
  for (let n = ay * 12 + am; n <= by * 12 + bm; n += 1) {
    const year = Math.floor((n - 1) / 12);
    const month = ((n - 1) % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

/**
 * The months a post appears in (H21e): every month its display range
 * touches, or the month it was made in while it has nothing and declares
 * nothing.
 */
export function monthsOf(summary: SplashSummary): string[] {
  if (summary.range)
    return monthsBetween(monthKey(summary.range.start), monthKey(summary.range.end));
  return [monthKey(summary.writtenOn)];
}

/**
 * Where a post sits within a month (H21e, H24): at the end of its range
 * clipped to the month, ordered by its latest block; `span` is its range
 * clipped to the month, what the pill reads. A post with no range of its
 * own sits where it was made.
 */
export function positionInMonth(
  summary: SplashSummary,
  month: string,
): { instant: number; date: IsoDate; span: DateRange } {
  const first: IsoDate = `${month}-01`;
  const last = lastDayOf(month);
  const range = summary.range ?? { start: summary.writtenOn, end: summary.writtenOn };
  const date = range.end < last ? range.end : last;
  const start = range.start > first ? range.start : first;
  const latest = summary.blocks[summary.blocks.length - 1];
  return {
    instant: latest && date === range.end ? latest.instant : restingInstant(date),
    date,
    span: { start, end: date },
  };
}

/** `2026. 8. 17 ~ 2026. 8. 20`, or one date, as the mockups write it. */
export function formatRange(range: DateRange | null): string {
  if (!range) return '';
  const day = (date: IsoDate): string =>
    `${date.slice(0, 4)}. ${Number(date.slice(5, 7))}. ${Number(date.slice(8, 10))}`;
  return range.start === range.end ? day(range.start) : `${day(range.start)} ~ ${day(range.end)}`;
}

/** `Sep 12`, or `Sep 12–14` within one month, for a pill. */
export function formatPillDate(range: DateRange): string {
  const month = (date: IsoDate): string =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = (date: IsoDate): number => Number(date.slice(8, 10));
  if (range.start === range.end) return `${month(range.start)} ${day(range.start)}`;
  if (monthKey(range.start) === monthKey(range.end)) {
    return `${month(range.start)} ${day(range.start)}–${day(range.end)}`;
  }
  return `${month(range.start)} ${day(range.start)} – ${month(range.end)} ${day(range.end)}`;
}
