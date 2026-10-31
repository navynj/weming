import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.ts';
import { listAll } from './storage/backend.ts';
import type { Bucket, ObjectInfo, StorageBackend } from './storage/types.ts';

/**
 * The daily sweep (2026-10-30, H70): stored photos no row names, older than
 * a day, removed with their copies. A draft removes what it will not use
 * (features/input-sheet/media-field.tsx); this is for what still slips
 * through — a tab closed mid-draft, a phone that died, a delete whose
 * storage half failed. A stored photo with no row is a delete that never
 * happened (CLAUDE.md).
 *
 * Relative imports only: `scripts/sweep-media.mjs` runs this same code from
 * Node for a dry run against a project.
 */

/** Younger than this, an object may belong to a draft still open. */
export const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;
/**
 * More than this share of a bucket unnamed reads as a bad read, not as
 * orphans: that bucket is held and reported, nothing removed.
 */
const HOLD_OVER_SHARE = 0.5;
/** Below this many, any share may go: a nearly empty bucket is not a bad read. */
const HOLD_FLOOR = 20;
const PAGE = 1000;
const REMOVE_BATCH = 100;

export type SweepCount = {
  /** Objects stored. */
  stored: number;
  /** Unnamed and older than a day: removed, or would be. */
  orphans: number;
  /** Their bytes. */
  bytes: number;
  /** Unnamed but younger than a day: left for now. */
  young: number;
  /** True when the share unnamed looked like a bad read, and nothing was removed. */
  held: boolean;
};

export type SweepReport = { dryRun: boolean; buckets: Record<Bucket, SweepCount> };

type ServiceClient = SupabaseClient<Database>;

/** Every row a read returns, page by page; a failed read throws, never reads as none. */
async function allValues<T>(
  db: ServiceClient,
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error || !data) throw new Error(`media sweep: a read failed (${String(error)})`);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

/** What a ripple names, a photo or one of its copies: `a.d.webp` and `a.t.webp` are `a.webp`'s. */
export function photoOf(path: string): string {
  return path.replace(/\.(d|t)(\.[^./]+)$/, '$2');
}

async function namedPaths(db: ServiceClient): Promise<Record<Bucket, Set<string>>> {
  const [ripples, profiles, pools] = await Promise.all([
    allValues(db, (from, to) =>
      db.from('ripples').select('media').filter('media', 'neq', '{}').order('id').range(from, to),
    ),
    allValues(db, (from, to) =>
      db
        .from('profiles')
        .select('avatar_path')
        .not('avatar_path', 'is', null)
        .order('id')
        .range(from, to),
    ),
    allValues(db, (from, to) =>
      db
        .from('pools')
        .select('photo_path')
        .not('photo_path', 'is', null)
        .order('id')
        .range(from, to),
    ),
  ]);
  return {
    'ripple-media': new Set(ripples.flatMap((row) => row.media)),
    avatars: new Set(profiles.map((row) => row.avatar_path!)),
    'pool-photos': new Set(pools.map((row) => row.photo_path!)),
  };
}

function isOld(object: ObjectInfo, now: number): boolean {
  // No time stated: not known to be old, so left.
  if (!object.updatedAt) return false;
  return now - Date.parse(object.updatedAt) > SWEEP_AFTER_MS;
}

/**
 * Finds, and unless `dryRun` removes, every object in the three buckets no
 * row names that is older than a day. Reports counts and bytes only, never
 * a path: object paths carry user ids.
 */
export async function sweepMedia({
  storage,
  db,
  dryRun,
  now = Date.now(),
  scope = () => true,
}: {
  storage: StorageBackend;
  db: ServiceClient;
  dryRun: boolean;
  now?: number;
  /** Which objects it may consider: all of them, except in a test sharing the stack. */
  scope?: (bucket: Bucket, path: string) => boolean;
}): Promise<SweepReport> {
  const named = await namedPaths(db);
  const buckets = {} as Record<Bucket, SweepCount>;
  for (const bucket of ['ripple-media', 'avatars', 'pool-photos'] as const) {
    const stored = (await listAll(storage, bucket)).filter((object) => scope(bucket, object.path));
    const unnamed = stored.filter((object) => !named[bucket].has(photoOf(object.path)));
    const orphans = unnamed.filter((object) => isOld(object, now));
    const held = orphans.length > HOLD_FLOOR && orphans.length > stored.length * HOLD_OVER_SHARE;
    if (!dryRun && !held) {
      for (let i = 0; i < orphans.length; i += REMOVE_BATCH) {
        await storage.remove(
          bucket,
          orphans.slice(i, i + REMOVE_BATCH).map((object) => object.path),
        );
      }
    }
    buckets[bucket] = {
      stored: stored.length,
      orphans: orphans.length,
      bytes: orphans.reduce((sum, object) => sum + object.size, 0),
      young: unnamed.length - orphans.length,
      held,
    };
  }
  return { dryRun, buckets };
}

/** One line for a log: counts and bytes per bucket, nothing that names anyone. */
export function sweepSummary(report: SweepReport): string {
  const parts = Object.entries(report.buckets).map(
    ([bucket, c]) =>
      `${bucket}: ${c.orphans} orphan${c.orphans === 1 ? '' : 's'} (${c.bytes} B) of ${c.stored}` +
      (c.young ? `, ${c.young} under a day left` : '') +
      (c.held ? ', HELD (too many unnamed; nothing removed)' : ''),
  );
  return `${report.dryRun ? 'dry run, nothing removed — ' : ''}${parts.join('; ')}`;
}
